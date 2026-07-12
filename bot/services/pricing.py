# Общая скидка поверх наценки — снижает финальные цены на витрине на 20%.
SALE_DISCOUNT = 0.8


def apply_markup(supplier_price: int) -> int:
    """Наценка тем выше, чем дешевле товар у поставщика.

    < 2000: +80%, 2000-5000: +50%, > 5000: +20%, затем скидка SALE_DISCOUNT.
    Результат округляется до 10 рублей, чтобы цены выглядели аккуратно.
    """
    if supplier_price < 2000:
        markup = 1.8
    elif supplier_price <= 5000:
        markup = 1.5
    else:
        markup = 1.2

    price = supplier_price * markup * SALE_DISCOUNT
    return round(price / 10) * 10


# Доля цены полного флакона (100 мл) у поставщика, в которую обычно укладывается
# отливант — выведено по факту из реальных прайсов Hormone Paris (5 мл ~11%, 10 мл ~19%
# от цены флакона). Плюс минимальный порог, т.к. упаковка/фасовка стоит независимо от объёма.
DECANT_RATIOS = {5: 0.11, 10: 0.19}
DECANT_FLOORS = {5: 350, 10: 550}


def estimate_decant_supplier_price(full_supplier_price: int, ml: int) -> int:
    """Примерная закупочная цена отливанта, когда у поставщика есть только цена флакона."""
    ratio = DECANT_RATIOS[ml]
    floor = DECANT_FLOORS[ml]
    price = max(full_supplier_price * ratio, floor)
    return round(price / 10) * 10
