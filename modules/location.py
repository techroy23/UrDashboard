import sqlite3
import asyncio
import aiohttp
from datetime import datetime, timedelta
from typing import Optional, Dict, List, Any
import os
import requests
import logging

logger = logging.getLogger(__name__)

DB_PATH = "data/location.db"
UPSTREAM_API = "https://api.bringyour.com/network/provider-locations"
MAX_RETRIES = 10
RETRY_INTERVAL = 60  # seconds


def init_db() -> None:
    """Initialize location database with required tables."""
    try:
        os.makedirs("data", exist_ok=True)

        with sqlite3.connect(DB_PATH, check_same_thread=False) as conn:
            cursor = conn.cursor()

            # Table 1: Historical snapshots for delta calculation
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS snapshots (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    timestamp INTEGER NOT NULL,
                    country TEXT NOT NULL,
                    country_code TEXT,
                    provider_count INTEGER NOT NULL,
                    stable INTEGER NOT NULL,
                    strong_privacy INTEGER NOT NULL
                )
            """)

            cursor.execute(
                "CREATE INDEX IF NOT EXISTS idx_snapshots_timestamp ON snapshots(timestamp)"
            )
            cursor.execute(
                "CREATE INDEX IF NOT EXISTS idx_snapshots_country_timestamp ON snapshots(country, timestamp)"
            )

            # Table 2: Current state with pre-calculated deltas
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS current_locations (
                    country TEXT PRIMARY KEY,
                    country_code TEXT,
                    provider_count INTEGER NOT NULL,
                    stable INTEGER NOT NULL,
                    strong_privacy INTEGER NOT NULL,
                    delta_1h INTEGER,
                    delta_3h INTEGER,
                    delta_6h INTEGER,
                    delta_12h INTEGER,
                    delta_24h INTEGER,
                    last_updated INTEGER NOT NULL
                )
            """)

            # Migration: Check if delta_1h exists, if not add it
            try:
                cursor.execute("SELECT delta_1h FROM current_locations LIMIT 1")
            except sqlite3.OperationalError:
                logger.info(
                    "[Location] Adding missing column 'delta_1h' to current_locations"
                )
                cursor.execute(
                    "ALTER TABLE current_locations ADD COLUMN delta_1h INTEGER"
                )

        logger.info(f"[Location] Database initialized at {DB_PATH}")
    except OSError as e:
        logger.error(f"[Location] Failed to create data directory: {e}")
        raise
    except sqlite3.Error as e:
        logger.error(f"[Location] Database initialization failed: {e}")
        raise


async def fetch_upstream_with_retry() -> Optional[Dict[str, Any]]:
    """
    Fetch provider locations from upstream API with 10-retry logic.
    Returns None if all retries fail.
    """
    async with aiohttp.ClientSession() as session:
        for attempt in range(1, MAX_RETRIES + 1):
            try:
                async with session.get(
                    UPSTREAM_API, timeout=aiohttp.ClientTimeout(total=10)
                ) as response:
                    if response.status == 200:
                        data = await response.json()
                        logger.info(
                            f"[Location] Successfully fetched upstream data (attempt {attempt})"
                        )
                        return data
                    else:
                        logger.error(
                            f"[Location] HTTP {response.status} on attempt {attempt}"
                        )
            except asyncio.TimeoutError:
                logger.error(f"[Location] Timeout on attempt {attempt}/{MAX_RETRIES}")
            except Exception as e:
                logger.error(
                    f"[Location] Error on attempt {attempt}/{MAX_RETRIES}: {e}"
                )

            if attempt < MAX_RETRIES:
                logger.info(f"[Location] Waiting {RETRY_INTERVAL}s before retry...")
                await asyncio.sleep(RETRY_INTERVAL)

        logger.error(f"[Location] All {MAX_RETRIES} retries failed")
        return None


def get_all_tracked_countries() -> set:
    """Get all countries ever tracked in the database."""
    try:
        with sqlite3.connect(DB_PATH, check_same_thread=False) as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT DISTINCT country FROM current_locations")
            countries = {row[0] for row in cursor.fetchall()}
            logger.info(f"[Location] Retrieved {len(countries)} tracked countries")
            return countries
    except sqlite3.Error as e:
        logger.error(f"[Location] Failed to retrieve tracked countries: {e}")
        raise
    except OSError as e:
        logger.error(f"[Location] Database access error: {e}")
        raise


def insert_snapshot(timestamp: int, locations: List[Dict]) -> None:
    """
    Insert snapshot into database.
    If a tracked country is missing from locations, insert with provider_count=0.
    """
    try:
        with sqlite3.connect(DB_PATH, check_same_thread=False) as conn:
            cursor = conn.cursor()

            # Get all tracked countries
            tracked_countries = get_all_tracked_countries()

            # Create lookup map for current API response
            location_map = {loc["name"]: loc for loc in locations}

            # Combine: tracked countries + new countries from API
            all_countries = tracked_countries | set(location_map.keys())

            # Insert snapshots
            for country in all_countries:
                if country in location_map:
                    loc = location_map[country]
                    country_code = loc.get("country_code", "")
                    provider_count = loc.get("provider_count", 0)
                    stable = 1 if loc.get("stable", False) else 0
                    strong_privacy = 1 if loc.get("strong_privacy", False) else 0
                else:
                    # Country is tracked but missing from API response
                    # Try to retrieve country_code from current_locations if possible, or leave empty
                    # For simplicity in this flow, we might lose country_code if not persisted.
                    # Ideally we fetch it from current_locations.
                    country_code = (
                        ""  # Will be updated/preserved in current_locations logic
                    )
                    provider_count = 0
                    stable = 0
                    strong_privacy = 0

                cursor.execute(
                    """
                    INSERT INTO snapshots (timestamp, country, country_code, provider_count, stable, strong_privacy)
                    VALUES (?, ?, ?, ?, ?, ?)
                """,
                    (
                        timestamp,
                        country,
                        country_code,
                        provider_count,
                        stable,
                        strong_privacy,
                    ),
                )

            conn.commit()
            logger.info(
                f"[Location] Inserted snapshot for {len(all_countries)} countries at {timestamp}"
            )
    except sqlite3.Error as e:
        logger.error(f"[Location] Failed to insert snapshot: {e}")
        raise
    except OSError as e:
        logger.error(f"[Location] Database access error during snapshot insertion: {e}")
        raise


# ========================================
# Task 4: Delta Calculation Logic
# ========================================


def get_snapshot_at_offset(
    country: str, hours_ago: int, current_timestamp: int
) -> Optional[int]:
    """
    Get provider count for a country at specific time offset.
    Returns None if no data available.
    """
    target_timestamp = current_timestamp - (hours_ago * 60 * 60 * 1000)

    try:
        with sqlite3.connect(DB_PATH, check_same_thread=False) as conn:
            cursor = conn.cursor()

            # Find closest snapshot within ±30 minutes of target time
            cursor.execute(
                """
                SELECT provider_count FROM snapshots
                WHERE country = ? 
                AND timestamp BETWEEN ? AND ?
                ORDER BY ABS(timestamp - ?) ASC
                LIMIT 1
            """,
                (
                    country,
                    target_timestamp - 1800000,
                    target_timestamp + 1800000,
                    target_timestamp,
                ),
            )

            result = cursor.fetchone()
            return result[0] if result else None
    except sqlite3.Error as e:
        logger.error(f"[Location] Failed to get snapshot at offset for {country}: {e}")
        return None


def calculate_delta(current_count: int, past_count: Optional[int]) -> Optional[int]:
    """Calculate delta. Returns None if past_count is None."""
    if past_count is None:
        return None
    return current_count - past_count


def format_delta_for_api(current_count: int, past_count: Optional[int]) -> Dict:
    """
    Format delta for API response with count, percent, direction, and previous count.
    Returns: {"count": int|None, "percent": float|None, "direction": "up"|"down"|"neutral"|None, "prev_count": int|None}
    """
    if past_count is None:
        return {"count": None, "percent": None, "direction": None, "prev_count": None}

    delta_count = current_count - past_count
    delta_percent = ((delta_count / past_count) * 100) if past_count > 0 else 0

    if delta_count > 0:
        direction = "up"
    elif delta_count < 0:
        direction = "down"
    else:
        direction = "neutral"

    return {
        "count": delta_count,
        "percent": round(delta_percent, 1),
        "direction": direction,
        "prev_count": past_count,
    }


# ========================================
# Task 5: Update current_locations Table
# ========================================


def update_current_locations(timestamp: int) -> None:
    """
    Update current_locations table with latest snapshot data and calculated deltas.
    """
    try:
        with sqlite3.connect(DB_PATH, check_same_thread=False) as conn:
            cursor = conn.cursor()

            # Get latest snapshot for each country
            cursor.execute(
                """
                SELECT country, country_code, provider_count, stable, strong_privacy
                FROM snapshots
                WHERE timestamp = ?
            """,
                (timestamp,),
            )

            snapshots = cursor.fetchall()

            for (
                country,
                country_code,
                provider_count,
                stable,
                strong_privacy,
            ) in snapshots:
                # Calculate deltas
                delta_1h = calculate_delta(
                    provider_count, get_snapshot_at_offset(country, 1, timestamp)
                )
                delta_3h = calculate_delta(
                    provider_count, get_snapshot_at_offset(country, 3, timestamp)
                )
                delta_6h = calculate_delta(
                    provider_count, get_snapshot_at_offset(country, 6, timestamp)
                )
                delta_12h = calculate_delta(
                    provider_count, get_snapshot_at_offset(country, 12, timestamp)
                )
                delta_24h = calculate_delta(
                    provider_count, get_snapshot_at_offset(country, 24, timestamp)
                )

                # Upsert into current_locations
                # We use COALESCE for country_code to preserve it if the new one is empty (e.g. from a zero-fill snapshot)
                cursor.execute(
                    """
                    INSERT INTO current_locations 
                    (country, country_code, provider_count, stable, strong_privacy, delta_1h, delta_3h, delta_6h, delta_12h, delta_24h, last_updated)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(country) DO UPDATE SET
                        country_code = CASE WHEN excluded.country_code != '' THEN excluded.country_code ELSE current_locations.country_code END,
                        provider_count = excluded.provider_count,
                        stable = excluded.stable,
                        strong_privacy = excluded.strong_privacy,
                        delta_1h = excluded.delta_1h,
                        delta_3h = excluded.delta_3h,
                        delta_6h = excluded.delta_6h,
                        delta_12h = excluded.delta_12h,
                        delta_24h = excluded.delta_24h,
                        last_updated = excluded.last_updated
                """,
                    (
                        country,
                        country_code,
                        provider_count,
                        stable,
                        strong_privacy,
                        delta_1h,
                        delta_3h,
                        delta_6h,
                        delta_12h,
                        delta_24h,
                        timestamp,
                    ),
                )

            conn.commit()
            logger.info(
                f"[Location] Updated current_locations with {len(snapshots)} countries"
            )
    except sqlite3.Error as e:
        logger.error(f"[Location] Failed to update current_locations: {e}")
        raise


# ========================================
# Task 6: Snapshot Purge Logic
# ========================================


def purge_old_snapshots(current_timestamp: int) -> None:
    """Delete snapshots older than 26 hours (safeguard for 24h lookback)."""
    cutoff = current_timestamp - (26 * 60 * 60 * 1000)

    try:
        with sqlite3.connect(DB_PATH, check_same_thread=False) as conn:
            cursor = conn.cursor()

            cursor.execute("DELETE FROM snapshots WHERE timestamp < ?", (cutoff,))
            deleted = cursor.rowcount

            conn.commit()

            if deleted > 0:
                logger.info(
                    f"[Location] Purged {deleted} snapshots older than 26 hours"
                )
    except sqlite3.Error as e:
        logger.error(f"[Location] Failed to purge old snapshots: {e}")
        raise


# ========================================
# Task 7: Main Update Function
# ========================================


async def update_location_data() -> None:
    """
    Main hourly update function:
    1. Fetch from upstream (with retries)
    2. Insert snapshot
    3. Calculate deltas
    4. Purge old data
    """
    logger.info("[Location] Starting hourly update...")
    timestamp = int(datetime.now().timestamp() * 1000)

    try:
        # Fetch upstream data
        data = await fetch_upstream_with_retry()

        if data is None:
            # Complete failure: set all tracked countries to 0
            logger.info(
                "[Location] Complete fetch failure - marking all countries as 0"
            )
            tracked_countries = get_all_tracked_countries()
            locations = [
                {
                    "name": country,
                    "provider_count": 0,
                    "stable": False,
                    "strong_privacy": False,
                }
                for country in tracked_countries
            ]
        else:
            locations = data.get("locations", [])
            logger.info(f"[Location] Fetched {len(locations)} locations from upstream")

        if not locations:
            logger.warning("[Location] No locations to update (empty list)")

        # Insert snapshot
        insert_snapshot(timestamp, locations)

        # Update current_locations with deltas
        update_current_locations(timestamp)

        # Purge old snapshots
        purge_old_snapshots(timestamp)

        logger.info(
            f"[Location] Hourly update completed at {datetime.now().isoformat()}"
        )
    except Exception as e:
        logger.error(f"[Location] Hourly update failed: {e}")
        raise


# ========================================
# Legacy Sync Function (RESTORED PROXY)
# ========================================


def get_provider_locations() -> Dict[str, Any]:
    """
    Direct proxy to upstream API (Original behavior).
    Returns data directly from BringYour API.
    """
    try:
        response = requests.get(UPSTREAM_API, timeout=10)
        response.raise_for_status()
        return response.json()
    except Exception as e:
        logger.error(f"[Location] Upstream API fetch failed: {e}")
        return {"locations": [], "error": str(e)}


# ========================================
# New History Endpoint (DB-Backed)
# ========================================


def get_location_history() -> Dict[str, Any]:
    """
    Get location delta history from local database.
    """
    try:
        with sqlite3.connect(DB_PATH, check_same_thread=False) as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()

            cursor.execute("""
                SELECT 
                    country,
                    country_code,
                    provider_count,
                    stable,
                    strong_privacy,
                    delta_1h,
                    delta_3h,
                    delta_6h,
                    delta_12h,
                    delta_24h,
                    last_updated
                FROM current_locations
            """)

            rows = cursor.fetchall()

        history = {}
        for row in rows:
            # Format deltas
            delta_1h_obj = format_delta_for_api(
                row["provider_count"],
                row["provider_count"] - row["delta_1h"]
                if row["delta_1h"] is not None
                else None,
            )
            delta_3h_obj = format_delta_for_api(
                row["provider_count"],
                row["provider_count"] - row["delta_3h"]
                if row["delta_3h"] is not None
                else None,
            )
            delta_6h_obj = format_delta_for_api(
                row["provider_count"],
                row["provider_count"] - row["delta_6h"]
                if row["delta_6h"] is not None
                else None,
            )
            delta_12h_obj = format_delta_for_api(
                row["provider_count"],
                row["provider_count"] - row["delta_12h"]
                if row["delta_12h"] is not None
                else None,
            )
            delta_24h_obj = format_delta_for_api(
                row["provider_count"],
                row["provider_count"] - row["delta_24h"]
                if row["delta_24h"] is not None
                else None,
            )

            history[row["country"]] = {
                "name": row["country"],
                "country_code": row["country_code"],
                "provider_count": row["provider_count"],
                "stable": bool(row["stable"]),
                "strong_privacy": bool(row["strong_privacy"]),
                "delta_1h": delta_1h_obj,
                "delta_3h": delta_3h_obj,
                "delta_6h": delta_6h_obj,
                "delta_12h": delta_12h_obj,
                "delta_24h": delta_24h_obj,
                "last_updated": row["last_updated"],
            }

        return {"history": history}

    except Exception as e:
        logger.error(f"[Location] History database read error: {e}")
        return {"history": {}, "error": str(e)}


# ========================================
# Task 8: Background Scheduler Setup
# ========================================

_background_task = None


async def start_background_task() -> None:
    """Start hourly background task for location updates."""
    global _background_task

    if _background_task is not None:
        logger.info("[Location] Background task already running")
        return

    # Initialize database
    try:
        init_db()
    except Exception as e:
        logger.error(f"[Location] Failed to initialize database: {e}")

    async def scheduled_task():
        # Run initial update immediately inside the background task
        try:
            logger.info("[Location] Running initial data update...")
            await update_location_data()
        except Exception as e:
            logger.error(f"[Location] Initial update failed: {e}")

        while True:
            # Calculate seconds until next hour
            now = datetime.now()
            next_hour = (now + timedelta(hours=1)).replace(
                minute=0, second=0, microsecond=0
            )
            sleep_seconds = (next_hour - now).total_seconds()
            logger.info(
                f"[Location] Sleeping {sleep_seconds:.1f}s until next hourly update"
            )

            await asyncio.sleep(sleep_seconds)
            await update_location_data()

    _background_task = asyncio.create_task(scheduled_task())
    logger.info("[Location] Background task started (hourly updates)")
