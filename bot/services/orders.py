import asyncio
import json
import uuid
from datetime import datetime, timezone
from pathlib import Path

ORDERS_PATH = Path(__file__).resolve().parent.parent.parent / "data" / "orders.json"

_lock = asyncio.Lock()


def _read_all() -> list[dict]:
    if not ORDERS_PATH.exists():
        return []
    with open(ORDERS_PATH, "r", encoding="utf-8") as f:
        content = f.read().strip()
        return json.loads(content) if content else []


def _write_all(orders: list[dict]) -> None:
    ORDERS_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(ORDERS_PATH, "w", encoding="utf-8") as f:
        json.dump(orders, f, ensure_ascii=False, indent=2)


def new_order_id() -> str:
    return uuid.uuid4().hex[:12]


async def create_pending_order(order_id: str, user_id: int, items: list[dict], total: int, currency: str) -> dict:
    order = {
        "id": order_id,
        "user_id": user_id,
        "items": items,
        "total": total,
        "currency": currency,
        "status": "pending",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "paid_at": None,
    }
    async with _lock:
        orders = _read_all()
        orders.append(order)
        _write_all(orders)
    return order


async def create_manual_order(
    order_id: str,
    user_id: int,
    items: list[dict],
    total: int,
    currency: str,
    contact: dict,
    promo_code: str | None = None,
    discount_amount: int = 0,
) -> dict:
    """Заказ без онлайн-оплаты: клиент оплачивает вне бота (перевод/наличные),
    админ получает контакты и сам подтверждает оплату."""
    order = {
        "id": order_id,
        "user_id": user_id,
        "items": items,
        "total": total,
        "currency": currency,
        "status": "new",
        "contact": contact,
        "promo_code": promo_code,
        "discount_amount": discount_amount,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "paid_at": None,
    }
    async with _lock:
        orders = _read_all()
        orders.append(order)
        _write_all(orders)
    return order


async def mark_order_paid(order_id: str, telegram_payment_charge_id: str) -> dict | None:
    async with _lock:
        orders = _read_all()
        for order in orders:
            if order["id"] == order_id:
                order["status"] = "paid"
                order["paid_at"] = datetime.now(timezone.utc).isoformat()
                order["telegram_payment_charge_id"] = telegram_payment_charge_id
                _write_all(orders)
                return order
    return None


async def get_order(order_id: str) -> dict | None:
    async with _lock:
        orders = _read_all()
    for order in orders:
        if order["id"] == order_id:
            return order
    return None
