import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def get_transfer_stats(token):
    url = "https://api.bringyour.com/transfer/stats"
    headers = {"Authorization": f"Bearer {token}", "Accept": "*/*"}

    # Configure retry strategy for 5xx errors
    retry_strategy = Retry(
        total=5,
        backoff_factor=0.5,
        status_forcelist=[500, 502, 503, 504],
        allowed_methods=["GET"],
    )
    adapter = HTTPAdapter(max_retries=retry_strategy)

    session = requests.Session()
    session.mount("https://", adapter)
    session.mount("http://", adapter)

    try:
        response = session.get(url, headers=headers, timeout=10)

        try:
            data = response.json()
        except ValueError:
            return {"valid": False, "reason": "Server returned non-JSON response"}

        if "paid_bytes_provided" in data and "unpaid_bytes_provided" in data:
            return {
                "valid": True,
                "paid": data["paid_bytes_provided"],
                "unpaid": data["unpaid_bytes_provided"],
                "raw": data,
            }
        else:
            return {"valid": False, "reason": "Missing required fields"}

    except requests.RequestException as e:
        logger.error(f"Upstream request failed: {e}")
        return {
            "network_error": True,
            "reason": "Request failed: Main Upstream Provider connection timeout or unreachable.",
        }
    finally:
        session.close()
