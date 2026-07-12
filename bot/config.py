import os
from dataclasses import dataclass

from dotenv import load_dotenv

load_dotenv()


def _require(name: str) -> str:
    value = os.getenv(name)
    if not value:
        raise RuntimeError(f"Переменная окружения {name} не задана. Проверьте файл .env")
    return value


@dataclass(frozen=True)
class Config:
    bot_token: str
    provider_token: str | None
    webapp_url: str
    admin_chat_id: int
    currency: str
    port: int

    @property
    def payments_enabled(self) -> bool:
        return bool(self.provider_token)


def load_config() -> Config:
    return Config(
        bot_token=_require("BOT_TOKEN"),
        # Без ИП/самозанятости провайдера может не быть — тогда заказ оформляется
        # вручную (оплата вне бота). Как только появится PROVIDER_TOKEN, онлайн-оплата
        # включится сама, без изменений кода.
        provider_token=os.getenv("PROVIDER_TOKEN") or None,
        webapp_url=_require("WEBAPP_URL"),
        admin_chat_id=int(_require("ADMIN_CHAT_ID")),
        currency=os.getenv("CURRENCY", "RUB"),
        port=int(os.getenv("PORT", "8080")),
    )
