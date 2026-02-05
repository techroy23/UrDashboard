import requests
import logging
from concurrent.futures import ThreadPoolExecutor, as_completed

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def fetch_zenquotes():
    try:
        response = requests.get("https://zenquotes.io/api/random", timeout=3)
        if response.status_code != 200:
            return None
        data = response.json()
        if isinstance(data, list) and len(data) > 0 and "q" in data[0]:
            q = data[0]
            if "Too many requests" in q["q"] or q["a"] == "zenquotes.io":
                return None
            return {"q": q["q"], "a": q["a"]}
    except Exception:
        pass
    return None


def fetch_animechan():
    try:
        response = requests.get("https://api.animechan.io/v1/quotes/random", timeout=3)
        if response.status_code != 200:
            return None
        data = response.json()
        if data.get("status") == "success" and "data" in data:
            d = data["data"]
            return {
                "q": d["content"],
                "a": f"{d['character']['name']} ({d['anime']['name']})",
            }
    except Exception:
        pass
    return None


def fetch_breakingbad():
    try:
        response = requests.get(
            "https://api.breakingbadquotes.xyz/v1/quotes", timeout=3
        )
        if response.status_code != 200:
            return None

        if "application/json" not in response.headers.get("Content-Type", ""):
            return None
        data = response.json()
        if isinstance(data, list) and len(data) > 0 and "quote" in data[0]:
            return {"q": data[0]["quote"], "a": data[0]["author"]}
    except Exception:
        pass
    return None


def fetch_got():
    try:
        response = requests.get(
            "https://api.gameofthronesquotes.xyz/v1/random", timeout=3
        )
        if response.status_code != 200:
            return None
        if "application/json" not in response.headers.get("Content-Type", ""):
            return None
        data = response.json()
        if "sentence" in data and "character" in data:
            return {"q": data["sentence"], "a": data["character"]["name"]}
    except Exception:
        pass
    return None


def fetch_lucifer():
    try:
        response = requests.get(
            "https://luciferquotes.shadowdev.xyz/api/quotes", timeout=3
        )
        if response.status_code != 200:
            return None
        data = response.json()
        if isinstance(data, list) and len(data) > 0 and "quote" in data[0]:
            return {"q": data[0]["quote"], "a": data[0]["author"]}
    except Exception:
        pass
    return None


def fetch_ron():
    try:
        response = requests.get(
            "https://ron-swanson-quotes.herokuapp.com/v2/quotes", timeout=3
        )
        if response.status_code != 200:
            return None
        data = response.json()
        if isinstance(data, list) and len(data) > 0 and isinstance(data[0], str):
            return {"q": data[0], "a": "Ron Swanson"}
    except Exception:
        pass
    return None


def fetch_stranger():
    try:
        response = requests.get(
            "https://strangerthingsquotes.shadowdev.xyz/api/quotes", timeout=3
        )
        if response.status_code != 200:
            return None
        data = response.json()
        if isinstance(data, list) and len(data) > 0 and "quote" in data[0]:
            return {"q": data[0]["quote"], "a": data[0]["author"]}
    except Exception:
        pass
    return None


def get_all_quotes():
    sources = [
        fetch_zenquotes,
        fetch_animechan,
        fetch_breakingbad,
        fetch_got,
        fetch_lucifer,
        fetch_ron,
        fetch_stranger,
    ]

    results = []

    with ThreadPoolExecutor(max_workers=len(sources)) as executor:
        future_to_source = {executor.submit(source): source for source in sources}
        for future in as_completed(future_to_source):
            try:
                data = future.result()
                if data:
                    results.append(data)
            except Exception:
                pass

    return results
