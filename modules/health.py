import sqlite3
import time
import os
import logging
import asyncio
import aiohttp
from datetime import datetime


DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data")
if not os.path.exists(DATA_DIR):
    os.makedirs(DATA_DIR)

DB_FILE = os.path.join(DATA_DIR, "health.db")
CHECK_INTERVAL = 300
RETRY_INTERVAL = 5
logger = logging.getLogger(__name__)


def init_db():
    try:
        with sqlite3.connect(DB_FILE) as conn:
            c = conn.cursor()
            c.execute("""
                CREATE TABLE IF NOT EXISTS health_checks (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    timestamp INTEGER NOT NULL,
                    latency INTEGER,
                    status TEXT,
                    error TEXT
                )
            """)
            conn.commit()
        logger.info(f"[Health] DB initialized at {DB_FILE}")
    except Exception as e:
        logger.error(f"[Health] Failed to init DB: {e}")


def save_check(timestamp, latency, status, error=None):
    try:
        with sqlite3.connect(DB_FILE) as conn:
            c = conn.cursor()
            c.execute(
                """
                INSERT INTO health_checks (timestamp, latency, status, error)
                VALUES (?, ?, ?, ?)
            """,
                (timestamp, latency, status, error),
            )
            conn.commit()
    except Exception as e:
        logger.error(f"Failed to save check: {e}")


def get_checks(since=0):
    try:
        with sqlite3.connect(DB_FILE) as conn:
            conn.row_factory = sqlite3.Row
            c = conn.cursor()
            c.execute(
                """
                SELECT timestamp, latency, status, error 
                FROM health_checks 
                WHERE timestamp > ? 
                ORDER BY timestamp ASC
            """,
                (since,),
            )
            rows = c.fetchall()
        return [dict(row) for row in rows]
    except Exception as e:
        logger.error(f"Failed to get checks: {e}")
        return []


def cleanup_old_checks(retention_days=14):
    try:
        cutoff = int((time.time() - (retention_days * 24 * 60 * 60)) * 1000)
        with sqlite3.connect(DB_FILE) as conn:
            c = conn.cursor()
            c.execute("DELETE FROM health_checks WHERE timestamp < ?", (cutoff,))
            deleted = c.rowcount
            conn.commit()
        if deleted > 0:
            logger.info(f"[Health] Cleaned up {deleted} old health records")
    except Exception as e:
        logger.error(f"[Health] Cleanup failed: {e}")


def get_db_count():
    try:
        with sqlite3.connect(DB_FILE) as conn:
            c = conn.cursor()
            c.execute("SELECT COUNT(*) FROM health_checks")
            return c.fetchone()[0]
    except Exception as e:
        logger.error(f"[Health] Failed to get DB count: {e}")
        return -1


async def check_health(session):
    url = "https://api.bringyour.com/hello"
    logger.info("[Health] Check initiated against upstream...")

    # Try 3 times
    for attempt in range(3):
        timestamp = int(time.time() * 1000)
        try:
            start_time = time.time()
            async with session.get(
                url, timeout=aiohttp.ClientTimeout(total=10)
            ) as response:
                latency = int((time.time() - start_time) * 1000)

                if response.status == 200:
                    try:
                        data = await response.json()
                        if "client_address" in data:
                            # Success! Save and return
                            save_check(timestamp, latency, "success")
                            logger.info(
                                f"[Health] Check successful: {latency}ms (Attempt {attempt + 1})"
                            )
                            return True
                        else:
                            logger.warning(
                                f"[Health] Check attempt {attempt + 1} failed: Invalid format"
                            )
                            # Invalid format
                            if attempt == 2:  # Last attempt
                                save_check(
                                    timestamp, -1, "error", "Invalid response format"
                                )
                    except ValueError:
                        logger.warning(
                            f"[Health] Check attempt {attempt + 1} failed: Invalid JSON"
                        )
                        # Invalid JSON
                        if attempt == 2:
                            save_check(timestamp, -1, "error", "Invalid JSON")
                else:
                    logger.warning(
                        f"[Health] Check attempt {attempt + 1} failed: HTTP {response.status}"
                    )
                    # Non-200 status
                    if attempt == 2:
                        save_check(
                            timestamp, -1, "error", f"Server error: {response.status}"
                        )

        except Exception as e:
            logger.warning(f"[Health] Check attempt {attempt + 1} failed: {e}")
            # Network/Connection error
            if attempt == 2:
                save_check(timestamp, -1, "error", str(e))

        # If we didn't return True, and we have retries left, wait 5s
        if attempt < 2:
            logger.info(f"[Health] Retrying in {RETRY_INTERVAL}s...")
            await asyncio.sleep(RETRY_INTERVAL)

    logger.error("[Health] All 3 check attempts failed")
    return False


async def run_scheduler():
    logger.info("[Health] Monitor Scheduler Started (Interval: 5m aligned)")

    init_db()

    while True:
        try:
            now = time.time()

            # Precise alignment to next 5-minute mark
            interval_seconds = CHECK_INTERVAL
            current_epoch = int(now)
            next_ts = ((current_epoch // interval_seconds) + 1) * interval_seconds

            # Ensure we don't sleep for 0 or negative time
            if next_ts - now < 0.1:
                next_ts += interval_seconds

            sleep_time = next_ts - now
            next_run_dt = datetime.fromtimestamp(next_ts)

            logger.info(
                f"[Health] Next target: {next_run_dt.strftime('%H:%M:%S')} (in {sleep_time:.2f}s)"
            )

            # Sleep until target
            await asyncio.sleep(sleep_time)

            logger.info(
                f"[Health] Waking up at {datetime.now().strftime('%H:%M:%S.%f')[:-3]}"
            )

            await asyncio.sleep(0.01)

            # Capture state before
            count_before = get_db_count()

            # Use a fresh session for each check
            async with aiohttp.ClientSession() as session:
                await check_health(session)

            # Verification
            count_after = get_db_count()
            if count_after > count_before:
                logger.info(
                    f"[Health] DB Verification: New record added (Total: {count_after})"
                )
            else:
                logger.error(
                    f"[Health] DB Verification: NO new record added! (Total: {count_after})"
                )

            if time.localtime().tm_hour == 0 and time.localtime().tm_min < 5:
                cleanup_old_checks()

        except asyncio.CancelledError:
            logger.info("[Health] Scheduler cancelled")
            break
        except Exception as e:
            logger.error(f"[Health] Scheduler loop error: {e}")
            await asyncio.sleep(5)


async def start_background_task():
    asyncio.create_task(run_scheduler())
