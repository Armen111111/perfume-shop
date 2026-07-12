def apply_markup(supplier_price: int) -> int:
    """Наценка тем выше, чем дешевле товар у поставщика.

    < 2000: +80%, 2000-5000: +50%, > 5000: +20%. Результат округляется
    до 10 рублей, чтобы цены выглядели аккуратно.
    """
    if supplier_price < 2000:
        markup = 1.8
    elif supplier_price <= 5000:
        markup = 1.5
    else:
        markup = 1.2

    price = supplier_price * markup
    return round(price / 10) * 10
