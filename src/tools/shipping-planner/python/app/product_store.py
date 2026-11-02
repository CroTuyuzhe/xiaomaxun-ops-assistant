# -*- coding: utf-8 -*-
"""产品支持库：本地 JSON 存储 SKU / FNSKU / 产品名称，支持增删改查"""
import json
import os
import sys

if __package__ in (None, ""):
    sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.config import PRODUCTS_JSON, DATA_DIR

# 预置 17 条虚构示例产品数据
SEED_PRODUCTS = [
    {"sku": "DEMO-SKU-01",  "fnsku": "DEMO-FNSKU-01", "name": "示例产品 01"},
    {"sku": "DEMO-SKU-02",     "fnsku": "DEMO-FNSKU-02", "name": "示例产品 02"},
    {"sku": "DEMO-SKU-03",    "fnsku": "DEMO-FNSKU-03", "name": "示例产品 03"},
    {"sku": "DEMO-SKU-04",    "fnsku": "DEMO-FNSKU-04", "name": "示例产品 04"},
    {"sku": "DEMO-SKU-05",    "fnsku": "DEMO-FNSKU-05", "name": "示例产品 05"},
    {"sku": "DEMO-SKU-06",    "fnsku": "DEMO-FNSKU-06", "name": "示例产品 06"},
    {"sku": "DEMO-SKU-07",    "fnsku": "DEMO-FNSKU-07", "name": "示例产品 07"},
    {"sku": "DEMO-SKU-08",    "fnsku": "DEMO-FNSKU-08", "name": "示例产品 08"},
    {"sku": "DEMO-SKU-09", "fnsku": "DEMO-FNSKU-09", "name": "示例产品 09"},
    {"sku": "DEMO-SKU-10", "fnsku": "DEMO-FNSKU-10", "name": "示例产品 10"},
    {"sku": "DEMO-SKU-11", "fnsku": "DEMO-FNSKU-11", "name": "示例产品 11"},
    {"sku": "DEMO-SKU-12", "fnsku": "DEMO-FNSKU-12", "name": "示例产品 12"},
    {"sku": "DEMO-SKU-13",    "fnsku": "DEMO-FNSKU-13", "name": "示例产品 13"},
    {"sku": "DEMO-SKU-14",   "fnsku": "DEMO-FNSKU-14", "name": "示例产品 14"},
    {"sku": "DEMO-SKU-15",  "fnsku": "DEMO-FNSKU-15", "name": "示例产品 15"},
    {"sku": "DEMO-SKU-16",      "fnsku": "DEMO-FNSKU-16", "name": "示例产品 16"},
    {"sku": "DEMO-SKU-17",  "fnsku": "DEMO-FNSKU-17", "name": "示例产品 17"},
]


class ProductStore:
    def __init__(self, path: str = PRODUCTS_JSON):
        self.path = path
        self.products = []
        self._load()

    def _load(self):
        if not os.path.exists(self.path):
            os.makedirs(DATA_DIR, exist_ok=True)
            self.products = [dict(p) for p in SEED_PRODUCTS]
            self.save()
            return
        try:
            with open(self.path, "r", encoding="utf-8") as f:
                data = json.load(f)
            self.products = data.get("products", [])
        except Exception:
            self.products = [dict(p) for p in SEED_PRODUCTS]
            self.save()

    def save(self):
        os.makedirs(os.path.dirname(self.path), exist_ok=True)
        with open(self.path, "w", encoding="utf-8") as f:
            json.dump({"products": self.products}, f, ensure_ascii=False, indent=2)

    def get(self, sku: str):
        """精确匹配（大小写不敏感），返回 dict 或 None"""
        sku = (sku or "").strip()
        for p in self.products:
            if p.get("sku", "").strip().lower() == sku.lower():
                return p
        return None

    def list_all(self):
        return list(self.products)

    def add(self, sku: str, fnsku: str, name: str) -> bool:
        sku = (sku or "").strip()
        fnsku = (fnsku or "").strip()
        name = (name or "").strip()
        if not sku or not fnsku:
            return False
        if self.get(sku):
            return False  # 已存在，用 update
        self.products.append({"sku": sku, "fnsku": fnsku, "name": name})
        self.save()
        return True

    def update(self, sku: str, fnsku: str, name: str) -> bool:
        sku = (sku or "").strip()
        p = self.get(sku)
        if not p:
            return False
        p["fnsku"] = (fnsku or "").strip() or p["fnsku"]
        p["name"] = (name or "").strip() or p["name"]
        self.save()
        return True

    def delete(self, sku: str) -> bool:
        sku = (sku or "").strip()
        for i, p in enumerate(self.products):
            if p.get("sku", "").strip().lower() == sku.lower():
                del self.products[i]
                self.save()
                return True
        return False


if __name__ == "__main__":
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    store = ProductStore()
    for p in store.list_all():
        print(p["sku"], p["fnsku"], p["name"])
