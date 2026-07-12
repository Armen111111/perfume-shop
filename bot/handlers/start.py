from aiogram import Router
from aiogram.filters import CommandStart
from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup, Message, WebAppInfo

from bot.config import Config


def register(config: Config) -> Router:
    router = Router(name="start")

    @router.message(CommandStart())
    async def start_handler(message: Message) -> None:
        keyboard = InlineKeyboardMarkup(
            inline_keyboard=[
                [
                    InlineKeyboardButton(
                        text="🌸 Открыть магазин",
                        web_app=WebAppInfo(url=config.webapp_url),
                    )
                ]
            ]
        )
        await message.answer(
            "Добро пожаловать в парфюмерный магазин!\n\n"
            "Нажмите кнопку ниже, чтобы посмотреть каталог и оформить заказ.",
            reply_markup=keyboard,
        )

    return router
