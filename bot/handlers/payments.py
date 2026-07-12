from aiogram import Bot, F, Router
from aiogram.types import Message, PreCheckoutQuery

from bot.config import Config
from bot.services import orders as orders_service


def register(config: Config) -> Router:
    router = Router(name="payments")

    @router.pre_checkout_query()
    async def pre_checkout_handler(pre_checkout_query: PreCheckoutQuery) -> None:
        order = await orders_service.get_order(pre_checkout_query.invoice_payload)
        if order is None or order["status"] != "pending":
            await pre_checkout_query.answer(ok=False, error_message="Заказ не найден или уже обработан.")
            return
        await pre_checkout_query.answer(ok=True)

    @router.message(F.successful_payment)
    async def successful_payment_handler(message: Message, bot: Bot) -> None:
        payment = message.successful_payment
        order = await orders_service.mark_order_paid(
            payment.invoice_payload, payment.telegram_payment_charge_id
        )
        if order is None:
            return

        items_text = "\n".join(f"• {item['name']} × {item['qty']}" for item in order["items"])
        await message.answer(
            "Оплата прошла успешно! Спасибо за заказ 🌸\n\n"
            f"Номер заказа: {order['id']}\n"
            f"{items_text}\n\n"
            f"Итого: {order['total']} {order['currency']}\n\n"
            "Мы свяжемся с вами для уточнения адреса доставки."
        )

        admin_text = (
            f"🛒 Новый оплаченный заказ #{order['id']}\n"
            f"Пользователь: {order['user_id']}\n"
            f"{items_text}\n"
            f"Итого: {order['total']} {order['currency']}"
        )
        await bot.send_message(config.admin_chat_id, admin_text)

    return router
