# -*- coding: utf-8 -*-
"""BTW 匹配模块：从 BTW 库按 SKU 匹配并复制到输出目录 产品标 子文件夹"""
import os
import sys

if __package__ in (None, ""):
    sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import shutil

from app.config import BTW_LIBRARY_DIR, PRODUCT_LABELS_SUBDIR


def match_btw_files(skus, output_dir: str, btw_dir: str = BTW_LIBRARY_DIR):
    """按 SKU 列表从 BTW 库匹配 .btw 文件，复制到 {output_dir}/产品标/
    返回 (matched: list[(sku, src, dst)], missing: list[sku])
    """
    matched = []
    missing = []
    labels_dir = os.path.join(output_dir, PRODUCT_LABELS_SUBDIR)
    os.makedirs(labels_dir, exist_ok=True)

    for sku in skus:
        src = os.path.join(btw_dir, f"{sku}.btw")
        if not os.path.exists(src):
            missing.append(sku)
            continue
        dst = os.path.join(labels_dir, f"{sku}.btw")
        try:
            shutil.copy2(src, dst)
            matched.append((sku, src, dst))
        except Exception:
            missing.append(sku)

    return matched, missing
