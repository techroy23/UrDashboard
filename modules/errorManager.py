import logging
from sanic import response


logger = logging.getLogger("ErrorManager")
if not logger.handlers:
    handler = logging.StreamHandler()
    formatter = logging.Formatter(
        "%(asctime)s - %(name)s - %(levelname)s - %(message)s"
    )
    handler.setFormatter(formatter)
    logger.addHandler(handler)
    logger.setLevel(logging.INFO)


def log_error(message, exc_info=None):
    if exc_info:
        logger.error(message, exc_info=exc_info)
    else:
        logger.error(message)


def handle_error(request, message, status_code=500):
    log_error(f"[{status_code}] Error processing {request.path}: {message}")

    if request.path.startswith("/api") or "application/json" in request.headers.get(
        "accept", ""
    ):
        return response.json(
            {"error": True, "message": message, "status": status_code},
            status=status_code,
        )

    return response.text(f"Error {status_code}: {message}", status=status_code)
