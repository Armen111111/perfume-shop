import json
from pathlib import Path
from typing import Optional

DATA_PATH = Path(__file__).resolve().parent.parent.parent / "data" / "products.json"

_cache: Optional[list[dict]] = None


def _load() -> list[dict]:
    global _cache
    if _cache is None:
        with open(DATA_PATH, "r", encoding="utf-8") as f:
            _cache = json.load(f)
    return _cache


def reload_catalog() -> None:
    global _cache
    _cache = None
    _load()


def get_all_products() -> list[dict]:
    return _load()


def get_product(product_id: str) -> Optional[dict]:
    for product in _load():
        if product["id"] == product_id:
            return product
    return None
