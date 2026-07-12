from typing import Optional

# code -> процент скидки. Коды нечувствительны к регистру.
PROMO_CODES: dict[str, int] = {
    "WELCOME10": 10,  # скидка на первый заказ
    "VIP15": 15,  # для постоянных клиентов
    "FRIEND10": 10,  # за рекомендацию друга
    "BIRTHDAY15": 15,  # скидка ко дню рождения
}


def get_discount_percent(code: str) -> Optional[int]:
    if not code:
        return None
    return PROMO_CODES.get(code.strip().upper())
