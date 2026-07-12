# Парфюм-магазин в Telegram

Telegram-бот + Mini App (веб-витрина) для продажи парфюмерии.

Онлайн-оплата (Telegram Payments) — опциональна и включается сама, как только в `.env`
появится `PROVIDER_TOKEN`. Пока провайдера нет (нужен ИП или самозанятость), магазин
работает в режиме **ручного заказа**: Mini App собирает корзину, имя, телефон, адрес
и способ оплаты (перевод на карту / наличные), заказ падает вам в чат с ботом, а оплату
вы согласовываете с клиентом сами.

## Архитектура

- `bot/main.py` — точка входа: одновременно поднимает aiogram-бота (polling) и aiohttp-сервер (API + статика Mini App).
- `bot/webserver.py` — aiohttp: `GET /api/config`, `GET /api/products`, `POST /api/checkout`, раздача файлов из `webapp/`.
- `bot/handlers/start.py` — команда `/start`, кнопка открытия Mini App.
- `bot/handlers/payments.py` — `pre_checkout_query` и `successful_payment`.
- `bot/services/catalog.py` — чтение каталога из `data/products.json`.
- `bot/services/orders.py` — простое хранение заказов в `data/orders.json`.
- `bot/services/webapp_auth.py` — проверка подписи `Telegram.WebApp.initData`.
- `webapp/` — фронтенд Mini App (vanilla HTML/CSS/JS, без сборки).

## Как это работает

1. Пользователь пишет `/start` боту, получает кнопку «Открыть магазин» (`web_app`).
2. Mini App загружает `GET /api/config` (узнаёт, включена ли онлайн-оплата) и `GET /api/products`, показывает витрину с фильтрами и корзиной.
3. При оформлении заказа фронтенд отправляет `initData` и содержимое корзины на `POST /api/checkout`. Сервер всегда проверяет подпись `initData` и пересчитывает сумму по серверному каталогу — цены с клиента не доверяются.

**Без `PROVIDER_TOKEN` (текущий режим):**

4. Mini App вместо оплаты показывает форму: имя, телефон, адрес, способ оплаты (перевод/наличные).
5. Сервер сохраняет заказ (`status: "new"`) в `data/orders.json` и шлёт вам (`ADMIN_CHAT_ID`) сообщение со всеми деталями и контактами клиента.
6. Дальше вы сами пишете клиенту в этом же чате, подтверждаете заказ и принимаете оплату вне Telegram.

**С `PROVIDER_TOKEN` (когда подключите провайдера):**

4. Сервер создаёт заказ (`status: "pending"`) и вызывает `createInvoiceLink`.
5. Mini App открывает нативную форму оплаты через `Telegram.WebApp.openInvoice`.
6. После оплаты бот получает `pre_checkout_query` (подтверждает) и `successful_payment` (помечает заказ оплаченным, шлёт уведомление покупателю и админу).

Переключение между режимами — это просто наличие/отсутствие `PROVIDER_TOKEN` в `.env`, код менять не нужно.

## Установка

```powershell
cd perfume-shop
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
copy .env.example .env
```

Заполните `.env`:

- `BOT_TOKEN` — уже есть у вас после создания бота через [@BotFather](https://t.me/BotFather).
- `PROVIDER_TOKEN` — **оставьте пустым**, пока нет ИП/самозанятости. Магазин будет работать в режиме ручных заказов. Когда появится провайдер: `/mybots` → выбрать бота → `Payments` → подключить провайдера (например ЮKassa) — впишите токен сюда, и оплата в боте включится автоматически.
- `WEBAPP_URL` — публичный HTTPS-адрес, где будет доступен `webapp/` (см. ниже про запуск через ngrok).
- `ADMIN_CHAT_ID` — ваш Telegram user id (узнать можно у [@userinfobot](https://t.me/userinfobot)) — сюда будут падать заказы с контактами клиентов.
- `CURRENCY` — валюта, обычно `RUB`.

## Запуск для разработки (с ngrok)

Mini App обязательно должен открываться по HTTPS, поэтому для локальной разработки нужен туннель:

```powershell
ngrok http 8080
```

Скопируйте выданный `https://xxxx.ngrok-free.app` адрес в `WEBAPP_URL` в `.env`, затем запустите:

```powershell
python -m bot.main
```

Откройте бота в Telegram, отправьте `/start` и нажмите «Открыть магазин».

## Каталог товаров

Товары лежат в `data/products.json`. Формат одной позиции:

```json
{
  "id": "уникальный-slug",
  "name": "Название",
  "brand": "Бренд",
  "gender": "female | male",
  "volume_ml": 50,
  "price": 8990,
  "old_price": null,
  "description": "Описание",
  "image": "https://ссылка-на-фото",
  "in_stock": true
}
```

Изменения подхватываются при перезапуске процесса (или вызовите `catalog.reload_catalog()`, если понадобится горячая перезагрузка).

## Заказы

Хранятся в `data/orders.json` (создаётся автоматически при первом заказе). Каждый заказ:
`id`, `user_id`, `items`, `total`, `status` (`new` для ручных / `pending` → `paid` для онлайн-оплаты),
для ручных заказов ещё `contact` (имя, телефон, адрес, способ оплаты).

Для продакшена стоит заменить на настоящую БД (Postgres/SQLite), но для старта файла достаточно.

## Продакшен

- Разверните на VPS, поставьте nginx + Let's Encrypt для HTTPS, пропишите реальный домен в `WEBAPP_URL`.
- Замените `dp.start_polling(bot)` на webhook-режим, если нужен более быстрый отклик при высокой нагрузке.
- Когда оформите ИП/самозанятость и подключите провайдера — впишите `PROVIDER_TOKEN` в `.env` и перезапустите бота, ручной режим сам переключится на онлайн-оплату.
