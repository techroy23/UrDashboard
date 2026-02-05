import requests
import logging
from modules.utils import format_bytes

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def get_leaderboard_data(token):
    url = "https://api.bringyour.com/stats/leaderboard"
    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "*/*",
        "Content-Type": "application/json",
    }

    try:
        response = requests.post(url, headers=headers, json={}, timeout=5)

        try:
            data = response.json()
        except ValueError:
            logger.error(
                f"Non-JSON response from {url}: {response.status_code} - {response.text[:200]}"
            )
            return {
                "valid": False,
                "reason": f"Server returned non-JSON response (Status: {response.status_code})",
            }

        if "earners" in data:
            earners = data["earners"]
            for earner in earners:
                mib = earner.get("net_mib_count", 0)

                bytes_val = int(mib * 1000 * 1000)
                earner["formatted_transfer"] = format_bytes(bytes_val)

            return {"valid": True, "earners": earners}
        else:
            return {"valid": False, "reason": "Missing required fields (earners)"}

    except requests.RequestException:
        return {
            "network_error": True,
            "reason": "Request failed: Main Upstream Provider connection timeout or unreachable.",
        }
