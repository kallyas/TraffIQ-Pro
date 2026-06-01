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
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from enum import Enum
from typing import Final, Mapping, Sequence

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
class Place:
    """A named waypoint addressed by its street address.

    We send the *address string* to the Routes API rather than a hand-picked
    lat/lng so Google geocodes the exact same point the Google Maps app would.
    Hard-coded coordinates silently snap to the nearest road segment, which was
    producing a shorter corridor (and therefore under-reported drive times).
    The real geocoded coordinates are read back from the API response.
    """

    address: str

    def to_payload(self) -> dict[str, str]:
        """Routes API waypoint format using server-side geocoding."""
        return {"address": self.address}


# --- CONFIGURATION ---
# Addresses are geocoded by Google exactly as the client specified them.
LOCATIONS: Final[Mapping[str, Place]] = {
    "Citadel Mall": Place(address="2070 Sam Rittenberg Blvd, Charleston, SC 29407"),
    "MUSC": Place(address="171 Ashley Ave, Charleston, SC 29425"),
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
def build_note(status: TrafficStatus, delay_min: float) -> str:
    """Human-readable summary of current conditions for the Notes column."""
    if status is TrafficStatus.HEAVY:
        return f"Heavy traffic — running {delay_min:.0f} min over the free-flow time."
    if status is TrafficStatus.MODERATE:
        return f"Moderate congestion — about {delay_min:.0f} min of added delay."
    return "Free-flowing — at or near the free-flow time."


def fetch_traffic_data(
    session: requests.Session, route: Route, api_key: str, departure_time: str
) -> TrafficSample:
    """Query the official Google Maps Routes API (V1) for live data for a route.

    Uses ``TRAFFIC_AWARE_OPTIMAL`` with an explicit ``departureTime`` of *now* so
    Google returns the same high-precision, live-traffic estimate the Google Maps
    app shows. The field mask also pulls the real geocoded endpoints and the
    encoded route polyline so the dashboard can draw the actual driving path
    instead of a straight line.
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
            "routes.legs.endLocation.latLng"
        ),
    }

    payload = {
        "origin": LOCATIONS[route.origin].to_payload(),
        "destination": LOCATIONS[route.destination].to_payload(),
        "travelMode": "DRIVE",
        "routingPreference": "TRAFFIC_AWARE_OPTIMAL",
        "departureTime": departure_time,
        "computeAlternativeRoutes": False,
        "units": "IMPERIAL",
    }

    response = session.post(ROUTES_API_URL, json=payload, headers=headers, timeout=REQUEST_TIMEOUT)
    response.raise_for_status()
    data = response.json()

    if "routes" not in data or not data["routes"]:
        raise ValueError(f"No viable driving paths found between {route.origin} and {route.destination}")

    route_data = data["routes"][0]

    # Parse response format strings securely (e.g., "750s" -> integer seconds)
    distance_meters: float = float(route_data["distanceMeters"])
    normal_seconds: float = float(route_data["staticDuration"].rstrip("s"))
    traffic_seconds: float = float(route_data["duration"].rstrip("s"))

    distance_miles = round(distance_meters * METERS_TO_MILES, 2)
    normal_min = round(normal_seconds / 60, 1)
    traffic_min = round(traffic_seconds / 60, 1)
    delay_min = round(max(0.0, traffic_min - normal_min), 1)
    status = TrafficStatus.from_delay(delay_min)

    # Read the real geocoded endpoints back from the response so map markers and
    # the stored coordinates match exactly what Google resolved the address to.
    legs = route_data.get("legs") or [{}]
    start = legs[0].get("startLocation", {}).get("latLng", {})
    end = legs[-1].get("endLocation", {}).get("latLng", {})
    polyline = route_data.get("polyline", {}).get("encodedPolyline", "")
    route_summary = route_data.get("description", "") or f"{route.origin} → {route.destination}"

    return TrafficSample(
        route=route,
        distance_miles=distance_miles,
        normal_min=normal_min,
        traffic_min=traffic_min,
        delay_min=delay_min,
        status=status,
        origin_lat=float(start.get("latitude", 0.0)),
        origin_lng=float(start.get("longitude", 0.0)),
        dest_lat=float(end.get("latitude", 0.0)),
        dest_lng=float(end.get("longitude", 0.0)),
        route_summary=route_summary,
        notes=build_note(status, delay_min),
        polyline=polyline,
    )


def collect_samples(api_key: str, departure_time: str) -> list[TrafficSample]:
    """Fetch every route concurrently, isolating per-route failures."""
    samples: list[TrafficSample] = []
    with build_session() as session, ThreadPoolExecutor(max_workers=MAX_WORKERS) as pool:
        futures = {
            pool.submit(fetch_traffic_data, session, route, api_key, departure_time): route
            for route in ROUTES
        }
        for future in as_completed(futures):
            route = futures[future]
            try:
                sample = future.result()
            except Exception as exc:  # noqa: BLE001 - isolate one route from the rest.
                logger.error("Failed to fetch %s -> %s: %s", route.origin, route.destination, exc)
                continue
            logger.info(
                "%s -> %s: %.1f min (%.1f min delay, %s)",
                route.origin,
                route.destination,
                sample.traffic_min,
                sample.delay_min,
                sample.status.value,
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