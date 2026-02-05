import requests
import json
from tenacity import (
    retry,
    stop_after_attempt,
    wait_fixed,
    retry_if_exception_type,
    before_sleep_log,
    RetryError,
)
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class ServerSideError(Exception):
    def __init__(self, message, status_code=None):
        super().__init__(message)
        self.status_code = status_code


@retry(
    stop=stop_after_attempt(3),
    wait=wait_fixed(2),
    retry=retry_if_exception_type(
        (ServerSideError, requests.RequestException, requests.Timeout)
    ),
    before_sleep=before_sleep_log(logger, logging.INFO),
)
def _send_request(url, payload):
    response = requests.post(
        url,
        headers={"Content-Type": "application/json"},
        data=json.dumps(payload),
        timeout=10,
    )

    if response.status_code >= 500:
        raise ServerSideError(
            f"Server returned {response.status_code}", status_code=response.status_code
        )

    content_start = response.text.strip().lower()[:100]
    if (
        content_start.startswith(("<html", "<!doctype html"))
        or "gateway time-out" in content_start
    ):
        raise ServerSideError(
            f"Server returned HTML content instead of JSON: {content_start}...",
            status_code=response.status_code,
        )

    return response


def _handle_response(response):
    try:
        data = response.json()
        if "error" in data and isinstance(data["error"], dict):
            data["error"]["status_code"] = response.status_code
            data["error"]["error_type"] = "upstream_error"
        return data
    except Exception:
        return {
            "error": {
                "message": "Invalid response from Main Upstream Provider.",
                "status_code": response.status_code,
                "error_type": "parse_error",
            }
        }


def login_with_code(auth_code):
    url = "https://api.bringyour.com/auth/code-login"
    payload = {"auth_code": auth_code}

    try:
        response = _send_request(url, payload)
        return _handle_response(response)
    except RetryError as e:
        last_exc = e.last_attempt.exception()
        message = f"Upstream server error after retries: {str(last_exc)}"
        status_code = getattr(last_exc, "status_code", 500)
        return {
            "error": {
                "message": message,
                "status_code": status_code,
                "error_type": "upstream_error",
            }
        }
    except ServerSideError as e:
        return {
            "error": {
                "message": f"Upstream server error: {str(e)}",
                "status_code": getattr(e, "status_code", None),
                "error_type": "upstream_error",
            }
        }
    except requests.Timeout:
        return {
            "error": {
                "message": "Connection timeout: Main Upstream Provider took too long to respond.",
                "status_code": None,
                "error_type": "network_error",
            }
        }
    except requests.ConnectionError:
        return {
            "error": {
                "message": "Connection failed: Unable to reach Main Upstream Provider.",
                "status_code": None,
                "error_type": "network_error",
            }
        }
    except Exception as e:
        return {
            "error": {
                "message": f"Unexpected error: {str(e)}",
                "status_code": None,
                "error_type": "network_error",
            }
        }


def login_with_password(username, password):
    url = "https://api.bringyour.com/auth/login-with-password"
    payload = {"user_auth": username, "password": password}

    try:
        response = _send_request(url, payload)
        return _handle_response(response)
    except RetryError as e:
        last_exc = e.last_attempt.exception()
        message = f"Upstream server error after retries: {str(last_exc)}"
        status_code = getattr(last_exc, "status_code", 500)
        return {
            "error": {
                "message": message,
                "status_code": status_code,
                "error_type": "upstream_error",
            }
        }
    except ServerSideError as e:
        return {
            "error": {
                "message": f"Upstream server error: {str(e)}",
                "status_code": getattr(e, "status_code", None),
                "error_type": "upstream_error",
            }
        }
    except requests.Timeout:
        return {
            "error": {
                "message": "Connection timeout: Main Upstream Provider took too long to respond.",
                "status_code": None,
                "error_type": "network_error",
            }
        }
    except requests.ConnectionError:
        return {
            "error": {
                "message": "Connection failed: Unable to reach Main Upstream Provider.",
                "status_code": None,
                "error_type": "network_error",
            }
        }
    except Exception as e:
        return {
            "error": {
                "message": f"Unexpected error: {str(e)}",
                "status_code": None,
                "error_type": "network_error",
            }
        }
