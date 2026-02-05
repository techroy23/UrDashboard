import requests
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def get_reliability_data(token):
    url = "https://api.bringyour.com/network/reliability"
    headers = {"Authorization": f"Bearer {token}", "Accept": "*/*"}

    try:
        response = requests.get(url, headers=headers, timeout=10)

        try:
            data = response.json()
            return {"valid": True, "data": data}
        except ValueError:
            return {"valid": False, "reason": "Server returned non-JSON response"}

    except requests.RequestException:
        return {
            "network_error": True,
            "reason": "Request failed: Main Upstream Provider connection timeout or unreachable.",
        }
