import requests
import logging
from modules.utils import format_bytes

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def get_ranking_data(token):
    url = "https://api.bringyour.com/network/ranking"
    headers = {"Authorization": f"Bearer {token}", "Accept": "*/*"}

    try:
        response = requests.get(url, headers=headers, timeout=5)

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

        if "network_ranking" in data:
            ranking = data["network_ranking"]
            mib = ranking.get("net_mib_count", 0)

            bytes_val = int(mib * 1000 * 1000)
            ranking["formatted_transfer"] = format_bytes(bytes_val)

            return {"valid": True, "ranking": ranking}
        else:
            return {
                "valid": False,
                "reason": "Missing required fields (network_ranking)",
            }

    except requests.RequestException:
        return {
            "network_error": True,
            "reason": "Request failed: Main Upstream Provider connection timeout or unreachable.",
        }
