"""Real-time traffic monitor.

Queries the Google Maps Routes API (v1) for live, traffic-adjusted travel times
between configured locations and appends the results to a Google Sheet.

Designed to run as a scheduled job: routes are fetched concurrently, HTTP calls
are retried on transient failures, and a failure on one route never aborts the
others.
"""

from __future__ import annotations

import datetime as dt
import logging
import os
import sys
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from enum import Enum
from typing import Any, Final, Mapping, Sequence, TypedDict

import gspread
import requests
from dotenv import load_dotenv
from google.oauth2.service_account import Credentials
from gspread.utils import ValueInputOption
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

# Load environment variables from the .env file before reading any of them.
load_dotenv()

logger = logging.getLogger("traffiq")

# --- TYPE DEFINITIONS FOR GEO ---
@dataclass(frozen=True, slots=True)
class LatLng:
    """A coordinate used for route endpoints and pass-through locks."""

    lat: float
    lng: float

    def to_payload(self) -> dict[str, object]:
        """Routes API waypoint format using explicit coordinates."""
        return {
            "location": {"latLng": {"latitude": self.lat, "longitude": self.lng}},
        }


@dataclass(frozen=True, slots=True)
class Place:
    """A named waypoint pinned to the Google Maps coordinate provided."""

    lat_lng: LatLng

    def to_payload(self) -> dict[str, object]:
        """Routes API waypoint format."""
        return self.lat_lng.to_payload()


# --- CONFIGURATION ---
# Coordinates come from the Google Maps route examples provided for this shuttle.
LOCATIONS: Final[Mapping[str, Place]] = {
    "Citadel Mall": Place(lat_lng=LatLng(32.798342, -80.031711)),
    "MUSC": Place(lat_lng=LatLng(32.785222, -79.947400)),
}


@dataclass(frozen=True, slots=True)
class Route:
    """A directed origin -> destination pair to monitor."""

    origin: str
    destination: str
    region: str  # Geographic market tagging field


ROUTES: Final[Sequence[Route]] = (
    Route(origin="Citadel Mall", destination="MUSC", region="Charleston, SC"),
    Route(origin="MUSC", destination="Citadel Mall", region="Charleston, SC")
)


@dataclass(frozen=True, slots=True)
class Corridor:
    """A named highway option identified by the road it actually drives.

    Rather than forcing the path with ``via`` waypoints (which snap onto side
    streets and make Google U-turn back to them, producing hairpin detours and
    neighbourhood shortcuts), we ask Google for its natural alternatives and
    match each returned route to a corridor by the signature road it travels.

    ``signature_roads`` are matched against Google's route description first (the
    cleanest signal) and then the turn-by-turn text. The most specific corridor
    must be listed first: SC-61 routes also touch US-17 near downtown, so Route
    61 is checked before Route 17, whose ``Savannah Hwy``/``US-17`` signatures
    would otherwise also match it.
    """

    label: str
    signature_roads: Sequence[str]

    def matches(self, description: str, route_text: str) -> bool:
        """True if this corridor's road appears in the route description/text."""
        return any(road.lower() in description for road in self.signature_roads) or any(
            road.lower() in route_text for road in self.signature_roads
        )


# Monitored corridors, most-specific first. The same two corridors apply to both
# travel directions; the highway names are direction-agnostic.
MONITORED_CORRIDORS: Final[Sequence[Corridor]] = (
    Corridor(
        label="Route 61",
        # SC-61 / St Andrews Blvd / Ashley River Rd — exclusive to this corridor.
        signature_roads=("SC-61", "SC 61", "St Andrews", "Ashley River Rd"),
    ),
    Corridor(
        label="Route 17",
        # US-17 / Savannah Hwy — the direct highway across the Ashley River Bridge.
        signature_roads=("Savannah Hwy", "US-17", "US 17"),
    ),
)

ROUTE_CORRIDORS: Final[Mapping[Route, Sequence[Corridor]]] = {
    ROUTES[0]: MONITORED_CORRIDORS,
    ROUTES[1]: MONITORED_CORRIDORS,
}

# EXPECTED DATABASE SCHEMA DEFINITION
EXPECTED_HEADERS: Final[Sequence[str]] = (
    "Timestamp",
    "Region",
    "Origin",
    "Destination",
    "Origin Lat",
    "Origin Lng",
    "Dest Lat",
    "Dest Lng",
    "Distance (mi)",
    "Normal Duration (min)",
    "Traffic Duration (min)",
    "Delay (min)",
    "Status",
    "Route",
    "Recommended",
    "Notes",
    "Polyline",
)

# API keys and file paths.
GOOGLE_MAPS_API_KEY: Final[str | None] = os.getenv("GOOGLE_MAPS_API_KEY")
GOOGLE_SHEETS_KEY_FILE: Final[str] = os.getenv("GOOGLE_SHEETS_KEY_FILE", "credentials.json")
SPREADSHEET_NAME: Final[str] = os.getenv("SPREADSHEET_NAME", "Traffic_Log")
WORKSHEET_NAME: Final[str] = os.getenv("WORKSHEET_NAME", "Log")

# Network / concurrency tuning (Endpoint updated to fix case sensitivity 404s).
ROUTES_API_URL: Final[str] = "https://routes.googleapis.com/directions/v2:computeRoutes"
REQUEST_TIMEOUT: Final[tuple[float, float]] = (5.0, 15.0)  # (connect, read) seconds
DEPARTURE_BUFFER_SEC: Final[int] = 60  # keep departureTime just ahead of "now"
MAX_WORKERS: Final[int] = min(8, len(ROUTES)) or 1
METERS_TO_MILES: Final[float] = 0.000621371

# Delay thresholds (minutes) used to classify congestion.
MODERATE_DELAY_MIN: Final[float] = 5.0
HEAVY_DELAY_MIN: Final[float] = 15.0

SHEETS_SCOPES: Final[Sequence[str]] = (
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive",
)


class TrafficStatus(str, Enum):
    """Human-readable congestion classification."""

    NORMAL = "Normal"
    MODERATE = "Moderate Congestion"
    HEAVY = "Heavy Traffic"

    @classmethod
    def from_delay(cls, delay_min: float) -> "TrafficStatus":
        if delay_min > HEAVY_DELAY_MIN:
            return cls.HEAVY
        if delay_min > MODERATE_DELAY_MIN:
            return cls.MODERATE
        return cls.NORMAL


@dataclass(frozen=True, slots=True)
class TrafficSample:
    """A single traffic measurement for one route at one point in time."""

    route: Route
    distance_miles: float
    normal_min: float
    traffic_min: float
    delay_min: float
    status: TrafficStatus
    origin_lat: float
    origin_lng: float
    dest_lat: float
    dest_lng: float
    route_summary: str
    recommended: bool
    notes: str
    polyline: str

    def to_row(self, timestamp: str) -> list[str | float]:
        """Serialize to a row matching the updated Google Sheet coordinates schema."""
        return [
            timestamp,
            self.route.region,
            self.route.origin,
            self.route.destination,
            self.origin_lat,
            self.origin_lng,
            self.dest_lat,
            self.dest_lng,
            self.distance_miles,
            self.normal_min,
            self.traffic_min,
            self.delay_min,
            self.status.value,
            self.route_summary,
            "Yes" if self.recommended else "No",
            self.notes,
            self.polyline,
        ]


# --- HTTP SESSION ---
def build_session() -> requests.Session:
    """Create a pooled session that retries transient network/server errors."""
    retry = Retry(
        total=3,
        connect=3,
        read=3,
        backoff_factor=0.5,
        status_forcelist=(429, 500, 502, 503, 504),
        allowed_methods=frozenset({"POST"}),
        raise_on_status=False,
    )
    adapter = HTTPAdapter(max_retries=retry, pool_connections=MAX_WORKERS, pool_maxsize=MAX_WORKERS)
    session = requests.Session()
    session.mount("https://", adapter)
    session.mount("http://", adapter)
    return session


# --- AUTHENTICATION & INITIALIZATION ---
def get_google_sheet() -> gspread.Worksheet:
    """Authorize against Google and return the target worksheet."""
    creds = Credentials.from_service_account_file(  # type: ignore[no-untyped-call]
        GOOGLE_SHEETS_KEY_FILE, scopes=list(SHEETS_SCOPES)
    )
    client = gspread.authorize(creds)
    return client.open(SPREADSHEET_NAME).worksheet(WORKSHEET_NAME)


def ensure_database_schema(sheet: gspread.Worksheet) -> None:
    """Programmatically validates row 1 schema, adding headers if absent."""
    try:
        first_row = sheet.row_values(1)
        if not first_row or [str(h).strip().lower() for h in first_row] != [str(e).lower() for e in EXPECTED_HEADERS]:
            logger.info("Database headers missing or mismatched. Re-initializing schema columns...")
            
            # If completely empty, insert headers at row 1. Otherwise, insert above historical entries.
            if not first_row:
                sheet.insert_row(list(EXPECTED_HEADERS), index=1)
            else:
                logger.warning("Existing headers don't match specification layout. Overwriting header row.")
                sheet.update(range_name="A1", values=[list(EXPECTED_HEADERS)])
                
            logger.info("Database schema columns successfully verified.")
    except Exception as e:
        raise RuntimeError(f"Failed schema execution validation: {e}") from e


# --- DATA EXTRACTION ---
def build_note(status: TrafficStatus, delay_min: float, recommended: bool) -> str:
    """Human-readable summary of current conditions for the Notes column."""
    prefix = "Recommended (fastest now). " if recommended else "Alternative. "
    if status is TrafficStatus.HEAVY:
        return f"{prefix}Heavy traffic — running {delay_min:.0f} min over the free-flow time."
    if status is TrafficStatus.MODERATE:
        return f"{prefix}Moderate congestion — about {delay_min:.0f} min of added delay."
    return f"{prefix}Free-flowing — at or near the free-flow time."


class RouteMetrics(TypedDict):
    """Parsed metrics for a single Routes API path."""

    distance_miles: float
    normal_min: float
    traffic_min: float
    delay_min: float
    origin_lat: float
    origin_lng: float
    dest_lat: float
    dest_lng: float
    polyline: str
    route_summary: str


def _parse_route(route: Route, route_data: dict[str, Any]) -> RouteMetrics:
    """Extract the metrics we care about from a single Routes API path."""
    distance_meters: float = float(route_data["distanceMeters"])
    # staticDuration is the free-flow baseline; fall back to live duration if absent.
    normal_seconds: float = float(route_data.get("staticDuration", route_data["duration"]).rstrip("s"))
    traffic_seconds: float = float(route_data["duration"].rstrip("s"))

    legs = route_data.get("legs") or [{}]
    start = legs[0].get("startLocation", {}).get("latLng", {})
    end = legs[-1].get("endLocation", {}).get("latLng", {})

    traffic_min = round(traffic_seconds / 60, 1)
    normal_min = round(normal_seconds / 60, 1)
    return {
        "distance_miles": round(distance_meters * METERS_TO_MILES, 2),
        "normal_min": normal_min,
        "traffic_min": traffic_min,
        "delay_min": round(max(0.0, traffic_min - normal_min), 1),
        "origin_lat": float(start.get("latitude", 0.0)),
        "origin_lng": float(start.get("longitude", 0.0)),
        "dest_lat": float(end.get("latitude", 0.0)),
        "dest_lng": float(end.get("longitude", 0.0)),
        "polyline": route_data.get("polyline", {}).get("encodedPolyline", ""),
        "route_summary": route_data.get("description", "") or f"{route.origin} → {route.destination}",
    }


def _route_text(route_data: dict[str, Any]) -> str:
    """Flatten human-readable route text used to detect shortcut roads."""
    text: list[str] = []
    description = route_data.get("description")
    if isinstance(description, str):
        text.append(description)

    for leg in route_data.get("legs") or []:
        for step in leg.get("steps") or []:
            instruction = step.get("navigationInstruction", {})
            if isinstance(instruction, dict):
                instructions = instruction.get("instructions")
                if isinstance(instructions, str):
                    text.append(instructions)

    return " ".join(text).lower()


def classify_route(
    route_data: dict[str, Any], corridors: Sequence[Corridor]
) -> Corridor | None:
    """Match a returned route to a monitored corridor by the road it drives.

    Corridors are tested in order, so the most-specific corridor must be listed
    first. The description is the cleanest signal, so a description match wins
    over a turn-by-turn text match; ``Corridor.matches`` checks both.
    """
    description = (route_data.get("description") or "").lower()
    route_text = _route_text(route_data)
    for corridor in corridors:
        if corridor.matches(description, route_text):
            return corridor
    return None


def fetch_direction(
    session: requests.Session,
    route: Route,
    corridors: Sequence[Corridor],
    api_key: str,
    departure_time: str,
) -> dict[str, RouteMetrics]:
    """Fetch Google's natural alternatives for one direction, grouped by corridor.

    Uses ``TRAFFIC_AWARE_OPTIMAL`` with an explicit ``departureTime`` of *now* so
    Google returns the same high-precision, live-traffic estimate the Google Maps
    app shows. ``computeAlternativeRoutes`` lets Google volunteer the genuine
    Savannah Hwy / SC-61 options; each is then matched to a monitored corridor
    and the fastest representative per corridor is kept.

    Returns a mapping of corridor label -> metrics for the corridors that were
    matched in the returned alternatives.
    """
    headers = {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": api_key,
        "X-Goog-FieldMask": (
            "routes.distanceMeters,"
            "routes.duration,"
            "routes.staticDuration,"
            "routes.description,"
            "routes.polyline.encodedPolyline,"
            "routes.legs.startLocation.latLng,"
            "routes.legs.endLocation.latLng,"
            "routes.legs.steps.navigationInstruction.instructions"
        ),
    }

    payload = {
        "origin": LOCATIONS[route.origin].to_payload(),
        "destination": LOCATIONS[route.destination].to_payload(),
        "travelMode": "DRIVE",
        "routingPreference": "TRAFFIC_AWARE_OPTIMAL",
        "departureTime": departure_time,
        "computeAlternativeRoutes": True,
        "units": "IMPERIAL",
    }

    response = session.post(
        ROUTES_API_URL, json=payload, headers=headers, timeout=REQUEST_TIMEOUT
    )
    response.raise_for_status()
    data = response.json()

    if "routes" not in data or not data["routes"]:
        raise ValueError(
            f"No route between {route.origin} and {route.destination}"
        )

    best: dict[str, RouteMetrics] = {}
    for route_data in data["routes"]:
        corridor = classify_route(route_data, corridors)
        if corridor is None:
            # An alternative that doesn't travel a monitored corridor (e.g. a far
            # James Island bypass) is simply ignored — it is never logged.
            continue
        metrics = _parse_route(route, route_data)
        # Label the row by our matched corridor rather than Google's description.
        metrics["route_summary"] = corridor.label
        existing = best.get(corridor.label)
        if existing is None or metrics["traffic_min"] < existing["traffic_min"]:
            best[corridor.label] = metrics

    if not best:
        raise ValueError(
            f"No monitored corridor matched any route between "
            f"{route.origin} and {route.destination}"
        )
    return best


def build_sample(
    route: Route, metrics: RouteMetrics, recommended: bool
) -> TrafficSample:
    """Assemble a TrafficSample from parsed metrics and the recommendation flag."""
    status = TrafficStatus.from_delay(metrics["delay_min"])
    return TrafficSample(
        route=route,
        distance_miles=metrics["distance_miles"],
        normal_min=metrics["normal_min"],
        traffic_min=metrics["traffic_min"],
        delay_min=metrics["delay_min"],
        status=status,
        origin_lat=metrics["origin_lat"],
        origin_lng=metrics["origin_lng"],
        dest_lat=metrics["dest_lat"],
        dest_lng=metrics["dest_lng"],
        route_summary=metrics["route_summary"],
        recommended=recommended,
        notes=build_note(status, metrics["delay_min"], recommended),
        polyline=metrics["polyline"],
    )


def collect_samples(api_key: str, departure_time: str) -> list[TrafficSample]:
    """Fetch every monitored direction/corridor, isolating per-call failures.

    Results are grouped per direction so the fastest monitored corridor can be
    flagged as recommended; a failure on one corridor never aborts the others.
    """
    metrics_by_route: dict[Route, list[RouteMetrics]] = defaultdict(list)

    with build_session() as session, ThreadPoolExecutor(max_workers=MAX_WORKERS) as pool:
        futures = {
            pool.submit(fetch_direction, session, route, corridors, api_key, departure_time): route
            for route, corridors in ROUTE_CORRIDORS.items()
        }
        for future in as_completed(futures):
            route = futures[future]
            try:
                metrics_by_route[route] = list(future.result().values())
            except Exception as exc:  # noqa: BLE001 - isolate one direction from the rest.
                logger.error(
                    "Failed to fetch %s -> %s: %s",
                    route.origin,
                    route.destination,
                    exc,
                )

    samples: list[TrafficSample] = []
    for route, metrics_list in metrics_by_route.items():
        if not metrics_list:
            logger.error(
                "No viable monitored corridors for %s -> %s",
                route.origin,
                route.destination,
            )
            continue

        # The recommended corridor for this direction is the fastest right now.
        fastest = min(metrics_list, key=lambda m: m["traffic_min"])
        for metrics in metrics_list:
            sample = build_sample(route, metrics, recommended=metrics is fastest)
            logger.info(
                "%s -> %s via %s: %.1f min (%.1f min delay, %s)%s",
                route.origin,
                route.destination,
                sample.route_summary,
                sample.traffic_min,
                sample.delay_min,
                sample.status.value,
                " [recommended]" if sample.recommended else "",
            )
            samples.append(sample)
    return samples


# --- MAIN EXECUTION ---
def main() -> int:
    """Entry point. Returns a process exit code."""
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )

    if not GOOGLE_MAPS_API_KEY:
        logger.error("GOOGLE_MAPS_API_KEY is not set. Add it to your .env file.")
        return 1

    try:
        sheet = get_google_sheet()
        # Ensure our database table matches expected structures before mining data
        ensure_database_schema(sheet)
    except Exception as exc:
        logger.error("Database connection or schema validation aborted: %s", exc)
        return 1

    # Stamp departure as the immediate future in RFC-3339 UTC so the Routes API
    # returns current-traffic data. Google rejects a timestamp in the past, so we
    # add a small buffer to absorb clock skew and request latency; a minute out is
    # still effectively "now" for live traffic purposes.
    now = dt.datetime.now(dt.timezone.utc) + dt.timedelta(seconds=DEPARTURE_BUFFER_SEC)
    departure_time = now.strftime("%Y-%m-%dT%H:%M:%SZ")

    samples = collect_samples(GOOGLE_MAPS_API_KEY, departure_time)
    if not samples:
        logger.error("No traffic data could be fetched for any route.")
        return 1

    timestamp = dt.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    rows = [sample.to_row(timestamp) for sample in samples]

    try:
        # Batch all rows into a single API call for speed and quota efficiency.
        sheet.append_rows(rows, value_input_option=ValueInputOption.user_entered)
    except Exception as exc:  # noqa: BLE001 - report and fail with a non-zero code.
        logger.error("Failed to write to Google Sheet: %s", exc)
        return 1

    logger.info("Logged %d entr%s to '%s'.", len(rows), "y" if len(rows) == 1 else "ies", SPREADSHEET_NAME)
    return 0


if __name__ == "__main__":
    sys.exit(main())
