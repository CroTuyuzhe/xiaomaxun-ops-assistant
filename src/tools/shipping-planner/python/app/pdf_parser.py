# -*- coding: utf-8 -*-
"""PDF 解析模块：逐页读取箱唛标签，提取 SKU/数量/箱号/目的地，汇总发货数据"""
import os
import re
import sys
from dataclasses import dataclass, field

if __package__ in (None, ""):
    sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pdfplumber

from app.config import COUNTRY_MAP, DEFAULT_COUNTRY

# 每页字段正则
QTY_RE = re.compile(r"^数量\s*(\d+)$")          # 数量 10
SERIAL_RE = re.compile(r"(FBA[A-Z0-9]+U\d+)")    # FBA19KWLW543U000001
US_LINE_RE = re.compile(
    r"^US\d*[.-]([A-Z0-9][A-Z0-9.-]*)$", re.IGNORECASE
)  # US.CB29AW-3 / US1.DEMO-SKU-16 / US2-DEMO-SKU-02
CITY_STATE_ZIP_RE = re.compile(
    r"^([A-Z][A-Z\s]*?),?\s*([A-Z]{2})\s+(\d{5}(?:-\d{4})?)$"
)
STREET_KEYWORDS = ("STREET", "PASEO", "AVE", "BLVD", "RD ", "LANE", "DRIVE", "BOULEVARD", "ROAD", "WAY")


def normalize_sku(value: str) -> str:
    """去掉 Amazon 箱唛的 US/US1/US2... 前缀，保留真实 SKU 内部的点和连字符。"""
    sku = (value or "").strip()
    match = US_LINE_RE.fullmatch(sku)
    return match.group(1).strip() if match else sku


@dataclass
class SkuSummary:
    sku: str
    box_count: int = 0            # 页数 = 箱数
    total_qty: int = 0            # 发货数量 = Σ每页数量
    qty_per_box_set: set = field(default_factory=set)  # 用于数量不一致告警
    first_serial: str = ""
    last_serial: str = ""


@dataclass
class ParsedResult:
    pdf_path: str = ""
    pdf_stem: str = ""            # 不含扩展名
    poc2: str = ""                # 文件名最后一个 - 后的片段
    store_in_pdf: str = ""        # "FBA: xxx" 行
    dest_street: str = ""
    dest_city: str = ""
    dest_state: str = ""
    dest_zip: str = ""
    dest_country: str = DEFAULT_COUNTRY
    skus: list = field(default_factory=list)
    warnings: list = field(default_factory=list)

    @property
    def fba_warehouse(self) -> str:
        """以标准邮寄顺序显示仓库代码与完整目的地地址。"""
        if self.dest_street and self.dest_city:
            city_line = f"{self.dest_city}, {self.dest_state} {self.dest_zip}".strip()
            return f"{self.poc2} - {self.dest_street}\n{city_line}\n{self.dest_country}"
        return f"{self.poc2}\n{self.dest_country}"

    @property
    def shipment_name_text(self) -> str:
        """案例：货件名称：20260812-KBCS02-10BAXL-7420PCS-POC2\n货件编号：\n货件追踪编号:"""
        return f"货件名称：{self.pdf_stem}\n货件编号：\n货件追踪编号:"


def _extract_destination(page):
    """从页面提取目的地信息（左栏）。左右栏以“发货地：”列起点为界。"""
    words = page.extract_words() or []
    if not words:
        return {}
    width = page.width or 612

    # 动态找左右栏分界：'发货地：' 的 x0（无则用 0.25*width）
    boundary = width * 0.25
    for w in words:
        if w["text"] == "发货地：":
            boundary = w["x0"]
            break

    left = [w for w in words if w["x0"] < boundary]
    # 按 top 聚类成行（容差 2pt，避免同一行因 top 微差拆开）
    left.sort(key=lambda w: (int(w["top"] / 2.0) * 2, w["x0"]))
    rows = {}
    for w in left:
        key = int(w["top"] / 2.0) * 2
        rows.setdefault(key, []).append(w)
    left_lines = [" ".join(w["text"] for w in sorted(v, key=lambda x: x["x0"])) for _, v in sorted(rows.items())]

    info = {}
    for ln in left_lines:
        s = ln.strip()
        if not s:
            continue
        if s.startswith("FBA:"):
            info["store"] = s
            continue
        m = CITY_STATE_ZIP_RE.match(s)
        if m:
            info["city"] = m.group(1).strip().rstrip(",")
            info["state"] = m.group(2)
            info["zip"] = m.group(3)
            continue
        if s in COUNTRY_MAP:
            info["country"] = COUNTRY_MAP[s]
            continue
        upper = s.upper()
        if any(k in upper for k in STREET_KEYWORDS) or (s and s[0].isdigit()):
            if "street" not in info:
                info["street"] = s
            continue
        if "Amazon" in s and "company" not in info:
            info["company"] = s
    return info


def parse_pdf(pdf_path: str) -> ParsedResult:
    result = ParsedResult(pdf_path=pdf_path)
    result.pdf_stem = os.path.splitext(os.path.basename(pdf_path))[0]
    stem = result.pdf_stem
    result.poc2 = stem.rsplit("-", 1)[-1] if "-" in stem else stem

    sku_map = {}  # 规范SKU -> SkuSummary

    with pdfplumber.open(pdf_path) as pdf:
        if len(pdf.pages) == 0:
            raise ValueError("PDF 为空，无任何页面")

        # 用第一页提取目的地信息
        dest_info = _extract_destination(pdf.pages[0])
        result.store_in_pdf = dest_info.get("store", "")
        result.dest_street = dest_info.get("street", "")
        result.dest_city = dest_info.get("city", "")
        result.dest_state = dest_info.get("state", "")
        result.dest_zip = dest_info.get("zip", "")
        result.dest_country = dest_info.get("country", DEFAULT_COUNTRY)

        for page in pdf.pages:
            text = page.extract_text() or ""
            lines = [l.strip() for l in text.splitlines() if l.strip()]
            if not lines:
                result.warnings.append("存在空白页（无文本）")
                continue

            # 数量
            qty = 0
            for l in lines:
                m = QTY_RE.match(l)
                if m:
                    qty = int(m.group(1))
                    break

            # 箱号
            serial = ""
            for l in lines:
                m = SERIAL_RE.search(l)
                if m:
                    serial = m.group(1)
                    break

            # 规范 SKU：优先条码行 US./US1./US2- 等，统一去掉物流前缀。
            canonical = ""
            for l in lines:
                m = US_LINE_RE.match(l)
                if m:
                    canonical = normalize_sku(l)
                    break
            if not canonical:
                canonical = normalize_sku(lines[-1])

            rec = sku_map.setdefault(canonical, SkuSummary(sku=canonical))
            rec.box_count += 1
            rec.total_qty += qty
            rec.qty_per_box_set.add(qty)
            if not rec.first_serial:
                rec.first_serial = serial
            rec.last_serial = serial

    if not sku_map:
        raise ValueError("PDF 中未识别到任何 SKU，无法处理")

    # 数量不一致告警
    for sku, rec in sku_map.items():
        if len(rec.qty_per_box_set) > 1:
            result.warnings.append(
                f"SKU {sku} 各页数量不一致（{sorted(rec.qty_per_box_set)}），已按累加计算")

    # 按首次出现顺序输出
    result.skus = list(sku_map.values())
    return result


