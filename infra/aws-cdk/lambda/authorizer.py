import hmac
import os


def handler(event, context):
    headers = {
        key.lower(): value for key, value in (event.get("headers") or {}).items()
    }
    supplied = headers.get("authorization", "").removeprefix("Bearer ").strip()
    expected = os.environ["RENDERER_API_KEY"]
    return {
        "isAuthorized": bool(supplied)
        and hmac.compare_digest(supplied, expected),
        "context": {"principal": "kathaquest-production"},
    }
