import requests
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def get_user_data(token):
    url = "https://api.bringyour.com/network/user"
    headers = {"Authorization": f"Bearer {token}", "Accept": "*/*"}

    try:
        response = requests.get(url, headers=headers, timeout=5)

        try:
            data = response.json()
        except ValueError:
            return {
                "valid": False,
                "reason": "Server returned non-JSON response",
            }

        if "network_user" in data:
            user_data = data["network_user"]
            if "user_auth" in user_data and "network_name" in user_data:
                return {
                    "valid": True,
                    "user_auth": user_data["user_auth"],
                    "network_name": user_data["network_name"],
                }
            else:
                return {
                    "valid": False,
                    "reason": "Missing required fields inside network_user",
                }
        else:
            return {
                "valid": False,
                "reason": "Missing required fields (network_user)",
            }

    except requests.RequestException:
        return {
            "network_error": True,
            "reason": "Request failed: Main Upstream Provider connection timeout or unreachable.",
        }
