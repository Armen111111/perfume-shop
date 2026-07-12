import hashlib
import hmac
import json
from urllib.parse import parse_qsl


def validate_init_data(init_data: str, bot_token: str, max_age_seconds: int = 86400) -> dict | None:
    """Проверяет подпись Telegram.WebApp.initData.

    Алгоритм описан в https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
    Возвращает распарсенные данные (включая user) или None, если подпись невалидна.
    """
    if not init_data:
        return None

    pairs = parse_qsl(init_data, strict_parsing=True)
    data = dict(pairs)
    received_hash = data.pop("hash", None)
    if not received_hash:
        return None

    data_check_string = "\n".join(f"{k}={v}" for k, v in sorted(data.items()))

    secret_key = hmac.new(b"WebAppData", bot_token.encode(), hashlib.sha256).digest()
    computed_hash = hmac.new(secret_key, data_check_string.encode(), hashlib.sha256).hexdigest()

    if not hmac.compare_digest(computed_hash, received_hash):
        return None

    auth_date = data.get("auth_date")
    if auth_date is not None:
        import time

        if time.time() - int(auth_date) > max_age_seconds:
            return None

    if "user" in data:
        data["user"] = json.loads(data["user"])

    return data
