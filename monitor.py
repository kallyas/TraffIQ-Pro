"""Real-time traffic monitor.

Queries the Google Distance Matrix API for live, traffic-adjusted travel times
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

# --- CONFIGURATION ---
# Hardcoded coordinates ("lat,lng") based on proposal locations.
LOCATIONS: Final[Mapping[str, str]] = {
    "Citadel Mall": "32.7924,-80.0198",  # Charleston, SC
    "MUSC": "32.7848,-79.9472",  # Charleston, SC
}


@dataclass(frozen=True, slots=True)
class Route:
    """A directed origin -> destination pair to monitor."""

    origin: str
    destination: str


ROUTES: Final[Sequence[Route]] = (
    Route(origin="Citadel Mall", destination="MUSC"),
    Route(origin="MUSC", destination="Citadel Mall"),
)

# API keys and file paths.
GOOGLE_MAPS_API_KEY: Final[str | None] = os.getenv("GOOGLE_MAPS_API_KEY")
GOOGLE_SHEETS_KEY_FILE: Final[str] = os.getenv("GOOGLE_SHEETS_KEY_FILE", "credentials.json")
SPREADSHEET_NAME: Final[str] = os.getenv("SPREADSHEET_NAME", "Traffic_Log")
WORKSHEET_NAME: Final[str] = os.getenv("WORKSHEET_NAME", "Log")

# Network / concurrency tuning.
DISTANCE_MATRIX_URL: Final[str] = "https://maps.googleapis.com/maps/api/distancematrix/json"
REQUEST_TIMEOUT: Final[tuple[float, float]] = (5.0, 15.0)  # (connect, read) seconds
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

    def to_row(self, timestamp: str) -> list[str | float]:
        """Serialize to a row matching the Google Sheet schema."""
        return [
            timestamp,
            self.route.origin,
            self.route.destination,
            self.distance_miles,
            self.normal_min,
            self.traffic_min,
            self.delay_min,
            self.status.value,
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
        allowed_methods=frozenset({"GET"}),
        raise_on_status=False,
    )
    adapter = HTTPAdapter(max_retries=retry, pool_connections=MAX_WORKERS, pool_maxsize=MAX_WORKERS)
    session = requests.Session()
    session.mount("https://", adapter)
    session.mount("http://", adapter)
    return session


# --- AUTHENTICATION ---
def get_google_sheet() -> gspread.Worksheet:
    """Authorize against Google and return the target worksheet."""
    creds = Credentials.from_service_account_file(  # type: ignore[no-untyped-call]
        GOOGLE_SHEETS_KEY_FILE, scopes=list(SHEETS_SCOPES)
    )
    client = gspread.authorize(creds)
    return client.open(SPREADSHEET_NAME).worksheet(WORKSHEET_NAME)


# --- DATA EXTRACTION ---
def fetch_traffic_data(
    session: requests.Session, route: Route, api_key: str
) -> TrafficSample:
    """Query the Distance Matrix API for live, traffic-adjusted data for a route.

    The Distance Matrix API is used here because it is optimized for simple
    A-to-B matrix durations.

    Raises:
        requests.HTTPError: on a non-2xx response after retries are exhausted.
        RuntimeError: when the API returns a non-OK status for the request or
            the matrix element.
    """
    params = {
        "origins": LOCATIONS[route.origin],
        "destinations": LOCATIONS[route.destination],
        "departure_time": "now",  # Crucial for live traffic-adjusted times.
        "traffic_model": "best_guess",
        "key": api_key,
    }

    response = session.get(DISTANCE_MATRIX_URL, params=params, timeout=REQUEST_TIMEOUT)
    response.raise_for_status()
    data = response.json()

    top_status = data.get("status")
    if top_status != "OK":
        message = data.get("error_message", "")
        raise RuntimeError(f"Distance Matrix request failed: status={top_status} {message}".strip())

    element = data["rows"][0]["elements"][0]
    element_status = element.get("status")
    if element_status != "OK":
        raise RuntimeError(f"No route between {route.origin} and {route.destination}: {element_status}")

    distance_meters: float = element["distance"]["value"]
    duration_seconds: float = element["duration"]["value"]  # Baseline time.
    # duration_in_traffic is only present when a valid departure_time is set;
    # fall back to the baseline duration so a missing field never crashes us.
    traffic_seconds: float = element.get("duration_in_traffic", element["duration"])["value"]

    distance_miles = round(distance_meters * METERS_TO_MILES, 2)
    normal_min = round(duration_seconds / 60, 1)
    traffic_min = round(traffic_seconds / 60, 1)
    delay_min = round(max(0.0, traffic_min - normal_min), 1)

    return TrafficSample(
        route=route,
        distance_miles=distance_miles,
        normal_min=normal_min,
        traffic_min=traffic_min,
        delay_min=delay_min,
        status=TrafficStatus.from_delay(delay_min),
    )


def collect_samples(api_key: str) -> list[TrafficSample]:
    """Fetch every route concurrently, isolating per-route failures."""
    samples: list[TrafficSample] = []
    with build_session() as session, ThreadPoolExecutor(max_workers=MAX_WORKERS) as pool:
        futures = {
            pool.submit(fetch_traffic_data, session, route, api_key): route for route in ROUTES
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

    samples = collect_samples(GOOGLE_MAPS_API_KEY)
    if not samples:
        logger.error("No traffic data could be fetched for any route.")
        return 1

    timestamp = dt.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    rows = [sample.to_row(timestamp) for sample in samples]

    try:
        sheet = get_google_sheet()
        # Batch all rows into a single API call for speed and quota efficiency.
        sheet.append_rows(rows, value_input_option=ValueInputOption.user_entered)
    except Exception as exc:  # noqa: BLE001 - report and fail with a non-zero code.
        logger.error("Failed to write to Google Sheet: %s", exc)
        return 1

    logger.info("Logged %d entr%s to '%s'.", len(rows), "y" if len(rows) == 1 else "ies", SPREADSHEET_NAME)
    return 0


if __name__ == "__main__":
    sys.exit(main())
