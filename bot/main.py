import asyncio
import logging

from aiogram import Bot, Dispatcher
from aiogram.client.default import DefaultBotProperties
from aiogram.enums import ParseMode
from aiohttp import web

from bot.config import load_config
from bot.handlers import payments as payments_handlers
from bot.handlers import start as start_handlers
from bot.webserver import create_app


async def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    config = load_config()

    bot = Bot(token=config.bot_token, default=DefaultBotProperties(parse_mode=ParseMode.HTML))
    dp = Dispatcher()

    dp.include_router(start_handlers.register(config))
    dp.include_router(payments_handlers.register(config))

    app = create_app(bot, config)
    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, host="0.0.0.0", port=config.port)
    await site.start()
    logging.info("Веб-сервер (Mini App + API) запущен на порту %s", config.port)

    try:
        await dp.start_polling(bot)
    finally:
        await runner.cleanup()
        await bot.session.close()


if __name__ == "__main__":
    asyncio.run(main())
