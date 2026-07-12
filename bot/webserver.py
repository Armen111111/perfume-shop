from pathlib import Path

from aiogram import Bot
from aiogram.types import LabeledPrice
from aiohttp import web

from bot.config import Config
from bot.services import catalog
from bot.services import orders as orders_service
from bot.services import promo
from bot.services.webapp_auth import validate_init_data

WEBAPP_DIR = Path(__file__).resolve().parent.parent / "webapp"


def create_app(bot: Bot, config: Config) -> web.Application:
    app = web.Application()
    app["bot"] = bot
    app["config"] = config

    app.router.add_get("/", handle_index)
    app.router.add_get("/api/config", handle_get_config)
    app.router.add_get("/api/products", handle_get_products)
    app.router.add_post("/api/promo/validate", handle_validate_promo)
    app.router.add_post("/api/checkout", handle_checkout)
    app.router.add_static("/", WEBAPP_DIR, show_index=False)

    return app


async def handle_index(request: web.Request) -> web.Response:
    return web.FileResponse(WEBAPP_DIR / "index.html")


async def handle_get_config(request: web.Request) -> web.Response:
    config: Config = request.app["config"]
    return web.json_response({"payments_enabled": config.payments_enabled, "currency": config.currency})


async def handle_get_products(request: web.Request) -> web.Response:
    return web.json_response(catalog.get_all_products())


async def handle_validate_promo(request: web.Request) -> web.Response:
    try:
        body = await request.json()
    except Exception:
        return web.json_response({"error": "invalid_json"}, status=400)

    code = str(body.get("code", ""))
    percent = promo.get_discount_percent(code)
    if percent is None:
        return web.json_response({"valid": False})
    return web.json_response({"valid": True, "percent": percent, "code": code.strip().upper()})


def _build_order_lines(cart: list[dict]) -> tuple[list[dict], list[LabeledPrice], int] | web.Response:
    order_items: list[dict] = []
    prices: list[LabeledPrice] = []
    total = 0

    for entry in cart:
        product_id = str(entry.get("id", ""))
        variant_id = str(entry.get("variant", ""))
        product = catalog.get_product(product_id)
        variant = catalog.get_variant(product_id, variant_id)
        try:
            qty = int(entry.get("qty", 0))
        except (TypeError, ValueError):
            qty = 0

        if product is None or variant is None or qty <= 0:
            return web.json_response({"error": "invalid_item", "id": product_id}, status=400)
        if not variant.get("in_stock", False):
            return web.json_response({"error": "out_of_stock", "id": product_id}, status=400)

        line_total = variant["price"] * qty
        total += line_total
        item_name = f"{product['brand']} {product['name']} — {variant['label']}"
        order_items.append(
            {
                "id": product["id"],
                "variant": variant["id"],
                "name": item_name,
                "qty": qty,
                "price": variant["price"],
            }
        )
        # Telegram Payments ожидает сумму в минимальных единицах валюты (копейки для RUB)
        prices.append(LabeledPrice(label=f"{item_name} x{qty}", amount=line_total * 100))

    return order_items, prices, total


async def handle_checkout(request: web.Request) -> web.Response:
    bot: Bot = request.app["bot"]
    config: Config = request.app["config"]

    try:
        body = await request.json()
    except Exception:
        return web.json_response({"error": "invalid_json"}, status=400)

    init_data = body.get("initData", "")
    cart = body.get("items", [])

    user_data = validate_init_data(init_data, config.bot_token)
    if user_data is None:
        return web.json_response({"error": "invalid_init_data"}, status=401)

    user = user_data.get("user", {})
    user_id = user.get("id")
    if not user_id:
        return web.json_response({"error": "no_user"}, status=401)

    if not cart:
        return web.json_response({"error": "empty_cart"}, status=400)

    result = _build_order_lines(cart)
    if isinstance(result, web.Response):
        return result
    order_items, prices, subtotal = result

    promo_code = str(body.get("promo_code", "")).strip()
    discount_percent = promo.get_discount_percent(promo_code) if promo_code else None
    discount_amount = (subtotal * discount_percent) // 100 if discount_percent else 0
    total = subtotal - discount_amount

    order_id = orders_service.new_order_id()

    if config.payments_enabled:
        if discount_amount:
            prices.append(
                LabeledPrice(label=f"Промокод {promo_code.upper()} (-{discount_percent}%)", amount=-discount_amount * 100)
            )
        await orders_service.create_pending_order(order_id, user_id, order_items, total, config.currency)
        invoice_link = await bot.create_invoice_link(
            title="Заказ в парфюмерном магазине",
            description=f"Заказ №{order_id}, {len(order_items)} позиций",
            payload=order_id,
            provider_token=config.provider_token,
            currency=config.currency,
            prices=prices,
        )
        return web.json_response({"mode": "payment", "order_id": order_id, "invoice_link": invoice_link})

    contact = body.get("contact") or {}
    name = str(contact.get("name", "")).strip()
    phone = str(contact.get("phone", "")).strip()
    address = str(contact.get("address", "")).strip()
    payment_method = str(contact.get("payment_method", "")).strip()

    if not name or not phone or not payment_method:
        return web.json_response({"error": "missing_contact"}, status=400)

    order = await orders_service.create_manual_order(
        order_id,
        user_id,
        order_items,
        total,
        config.currency,
        {"name": name, "phone": phone, "address": address, "payment_method": payment_method},
        promo_code=promo_code.upper() if discount_amount else None,
        discount_amount=discount_amount,
    )

    username = user.get("username")
    user_label = f"@{username}" if username else str(user_id)
    items_text = "\n".join(f"• {i['name']} × {i['qty']}" for i in order_items)
    payment_label = "Перевод на карту" if payment_method == "transfer" else "Наличными при получении"
    discount_line = (
        f"Промокод: {promo_code.upper()} (-{discount_percent}%, -{discount_amount} {config.currency})\n"
        if discount_amount
        else ""
    )

    await bot.send_message(
        config.admin_chat_id,
        "🛒 Новый заказ №{id}\n"
        "Клиент: {user_label} (id {user_id})\n"
        "Имя: {name}\n"
        "Телефон: {phone}\n"
        "Адрес: {address}\n"
        "Оплата: {payment_label}\n"
        "{discount_line}\n"
        "{items}\n\n"
        "Итого: {total} {currency}".format(
            id=order_id,
            user_label=user_label,
            user_id=user_id,
            name=name,
            phone=phone,
            address=address or "—",
            payment_label=payment_label,
            discount_line=discount_line,
            items=items_text,
            total=total,
            currency=config.currency,
        ),
    )

    await bot.send_message(
        user_id,
        "✅ Заказ принят!\n\n"
        "Ожидайте — менеджер свяжется с вами в этом чате, чтобы подтвердить заказ и способ оплаты.",
    )

    return web.json_response({"mode": "manual", "order_id": order_id, "total": total, "currency": config.currency})
