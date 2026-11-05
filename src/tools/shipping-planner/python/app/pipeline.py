# -*- coding: utf-8 -*-
"""主处理流程编排：解析 PDF → 创建统一输出文件夹 → 复制PDF → 匹配产品 → 匹配BTW → 生成Excel"""
import datetime
import os
import re
import shutil
import sys
from dataclasses import dataclass, field
from types import SimpleNamespace

if __package__ in (None, ""):
    sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.config import OUTPUT_FOLDER_SUFFIX, DEFAULT_COUNTRY
from app.pdf_parser import normalize_sku, parse_pdf
from app.pdf_processor import process_pdf_fba_text
from app.product_store import ProductStore
from app.excel_writer import generate_excel
from app.btw_matcher import match_btw_files

# 标准 PDF 文件名：{YYYYMMDD}-{SKU段}-{N}PCS-{类型}
PDF_SKU_SEGMENT_RE = re.compile(r"^\d{8}-(.+?)-(\d+)PCS", re.IGNORECASE)
MIN_PART_LEN = 3  # 判定为独立 SKU 片段的最小长度


def extract_pdf_sku_name(pdf_stem: str, sku_list) -> str:
    """从 PDF 文件名提取 SKU 代号段（案例：KBCS02-10BAXL → KBCS02&10BAXL）"""
    m = PDF_SKU_SEGMENT_RE.search(pdf_stem or "")
    if not m:
        return None
    segment = m.group(1).strip()
    if not segment:
        return None
    # 新版文件名使用 FBA 货件编号；文件夹名称回退到 PDF 正文中的 SKU。
    if re.fullmatch(r"FBA[A-Z0-9]+", segment, re.IGNORECASE):
        return None
    known = {str(s).upper() for s in sku_list if s}

    def is_single_sku(seg: str) -> bool:
        su = seg.upper()
        return any(su in k or k in su for k in known)

    if is_single_sku(segment):
        return segment
    parts = segment.split("-")
    if len(parts) > 1:
        matched = [p for p in parts if len(p) >= MIN_PART_LEN and
                   any(p.upper() in k or k in p.upper() for k in known)]
        if len(matched) == len(parts):
            return "&".join(parts)
    return segment


def parse_md_date(date_str: str, ref_year: int = None) -> datetime.date:
    """解析 M.D / M月D日 / YYYY-MM-DD 等日期字符串，返回 date（当年）"""
    s = (date_str or "").strip().replace("月", ".").replace("日", "")
    year = ref_year or datetime.date.today().year
    try:
        if "-" in s and len(s.split("-")[0]) == 4:  # YYYY-MM-DD
            return datetime.datetime.strptime(s, "%Y-%m-%d").date()
        parts = [p for p in s.replace("/", ".").split(".") if p.strip()]
        if len(parts) >= 2:
            month = int(parts[0])
            day = int(parts[1])
            return datetime.date(year, month, day)
    except Exception:
        pass
    return datetime.date.today()


def compute_fba_delivery_range(date_str: str, delivery_days: int = 45) -> str:
    """计划派送FBA时间：发货日期 + 用户输入时效天数 → 所在周 周一~周日。

    例：2026-10-06 + 45天 = 2026-11-20（周五）→ 11月16日-11月22日。
    """
    start = parse_md_date(date_str)
    try:
        days = int(delivery_days)
    except (TypeError, ValueError):
        raise ValueError("运输时效必须是非负整数")
    if days < 0:
        raise ValueError("运输时效不能小于 0 天")
    target = start + datetime.timedelta(days=days)
    week_start = target - datetime.timedelta(days=target.weekday())  # 周一
    week_end = week_start + datetime.timedelta(days=6)               # 周日
    return f"{week_start.month}月{week_start.day}日-{week_end.month}月{week_end.day}日"


def display_transport(transport_name: str, locked: bool) -> str:
    """运输方式显示：锁仓 → AGL+方式；非锁仓 → 仅方式"""
    return f"AGL{transport_name}" if locked else transport_name


def lock_text(locked: bool) -> str:
    """Excel A列「锁仓或非锁仓」"""
    return "AGL锁仓" if locked else "非锁仓"


def index_product_overrides(products) -> dict:
    """把 Electron 传入的产品库快照转换为大小写不敏感的 SKU 映射。"""
    result = {}
    for product in products or []:
        sku = str(product.get("sku", "")).strip()
        if not sku:
            continue
        result[sku.upper()] = {
            "sku": sku,
            "fnsku": str(product.get("fnsku", "")).strip(),
            "name": str(product.get("name", "")).strip(),
        }
    return result


def resolve_product(product_store, sku: str, override_map: dict) -> dict:
    """优先使用主程序传入的最新产品库；没有覆盖值时回退到本地产品库。"""
    stored = product_store.get(sku) or {}
    override = override_map.get((sku or "").strip().upper(), {})
    return {
        "fnsku": override.get("fnsku") or stored.get("fnsku", ""),
        "name": override.get("name") or stored.get("name", ""),
    }


def build_output_folder_name(parsed, folder_date="", transport="", person="", locked=True) -> str:
    """输出文件夹命名：{SKU代号} 工厂发货计划 {日期} {运输方式} {负责人}"""
    sku_part = extract_pdf_sku_name(parsed.pdf_stem, [s.sku for s in parsed.skus])
    if not sku_part:
        sku_part = "&".join(s.sku for s in parsed.skus)

    name = f"{sku_part} {OUTPUT_FOLDER_SUFFIX}"
    if folder_date:
        name += f" {folder_date}"
    t = display_transport(transport, locked) if transport else ""
    if t:
        name += f" {t}"
    if person:
        name += f" {person}"
    return name


@dataclass
class ProcessReport:
    ok: bool = False
    message: str = ""
    pdf: str = ""
    pdfs: list = field(default_factory=list)
    output_pdfs: list = field(default_factory=list)
    output_dir: str = ""
    excel_path: str = ""
    skus: list = field(default_factory=list)          # [(sku, box_count, total_qty)]
    sku_details: list = field(default_factory=list)
    btw_matched: list = field(default_factory=list)   # [sku]
    btw_missing: list = field(default_factory=list)   # [sku]
    product_missing: list = field(default_factory=list)  # [sku]
    warnings: list = field(default_factory=list)

    def summary_text(self):
        lines = [f"PDF：{os.path.basename(self.pdf)}",
                 f"独立 SKU 数：{len(self.skus)}",
                 f"输出文件夹：{self.output_dir}",
                 f"Excel：{os.path.basename(self.excel_path) if self.excel_path else '-'}",
                 f"BTW 匹配：{len(self.btw_matched)} 个，缺失：{len(self.btw_missing)} 个",
                 f"产品库缺失：{len(self.product_missing)} 个"]
        if self.btw_missing:
            lines.append("缺失BTW: " + ", ".join(self.btw_missing))
        if self.product_missing:
            lines.append("缺失产品: " + ", ".join(self.product_missing))
        if self.warnings:
            lines.append("告警: " + "; ".join(self.warnings))
        return "\n".join(lines)


def run_pipeline(pdf_path: str, store_name: str,
                 missing_callback=None,
                 product_overrides=None,
                 template_path: str = None,
                 btw_dir: str = None,
                 output_base: str = None,
                 folder_date: str = "",
                 transport: str = "普船",
                 delivery_days: int = 45,
                 person: str = "",
                 locked: bool = True,
                 copy_pdf: bool = True) -> ProcessReport:
    """执行完整处理流程。
    output_base: 输出基础目录（默认 PDF 所在目录），工具在其下创建统一文件夹
    folder_date: 日期（M.D，用于文件夹名与计划派送FBA时间推算）
    transport: 运输方式（普船/快船/空运），仅用于显示与文件夹命名
    delivery_days: 运输时效天数，独立于运输方式，默认45天
    locked: 是否锁仓（影响文件夹运输前缀与Excel A列）
    """
    report = ProcessReport(pdf=pdf_path, pdfs=[pdf_path])

    try:
        # 1. 解析 PDF
        parsed = parse_pdf(pdf_path)
        report.skus = [(s.sku, s.box_count, s.total_qty) for s in parsed.skus]
        report.sku_details = [
            {"sku": s.sku, "box_count": s.box_count, "total_qty": s.total_qty,
             "fba_warehouse": parsed.fba_warehouse, "source_count": 1}
            for s in parsed.skus
        ]
        report.warnings = list(parsed.warnings)

        # 2. 创建统一输出文件夹
        base = (output_base or "").strip() or os.path.dirname(pdf_path)
        folder_name = build_output_folder_name(parsed, folder_date, transport, person, locked)
        output_dir = os.path.join(base, folder_name)
        os.makedirs(output_dir, exist_ok=True)
        report.output_dir = output_dir

        # 3. 处理 PDF（每页 FBA: XXXXXX Ltd. -> FBA:）并放入输出文件夹
        if copy_pdf:
            dst_pdf = os.path.join(output_dir, os.path.basename(pdf_path))
            report.output_pdfs.append(dst_pdf)
            try:
                info = process_pdf_fba_text(pdf_path, dst_pdf)
                if info.get("total_replacements", 0) == 0:
                    report.warnings.append("PDF 中未找到 'FBA: ... Ltd.' 文本，已按原样输出")
            except Exception as e:
                shutil.copy2(pdf_path, dst_pdf)
                report.warnings.append(f"PDF 文本处理失败，已复制原文件：{e}")

        # 4. 匹配产品库
        store = ProductStore()
        override_map = index_product_overrides(product_overrides)
        products_map = {}
        for s in parsed.skus:
            p = resolve_product(store, s.sku, override_map)
            if not p.get("fnsku") or not p.get("name"):
                report.product_missing.append(s.sku)
                entry = None
                if missing_callback:
                    entry = missing_callback(s.sku)  # {"fnsku","name","save"}
                if entry and entry.get("fnsku"):
                    products_map[s.sku] = {"fnsku": entry["fnsku"], "name": entry.get("name", "")}
                    if entry.get("save"):
                        store.add(s.sku, entry["fnsku"], entry.get("name", ""))
                else:
                    products_map[s.sku] = p
            else:
                products_map[s.sku] = p

        # 5. 匹配并复制 BTW
        kw = {}
        if btw_dir:
            kw["btw_dir"] = btw_dir
        matched, missing = match_btw_files([s.sku for s in parsed.skus],
                                           output_dir, **kw)
        report.btw_matched = [m[0] for m in matched]
        report.btw_missing = missing

        # 6. 生成 Excel 到输出文件夹
        kw2 = {}
        if template_path:
            kw2["template_path"] = template_path
        report.excel_path = generate_excel(
            output_dir, parsed, store_name, products_map,
            lock_status=lock_text(locked),
            fba_delivery_range=compute_fba_delivery_range(folder_date, delivery_days),
            **kw2)

        report.ok = True
        report.message = "处理完成"
    except Exception as e:
        report.ok = False
        report.message = f"处理失败：{e}"
    return report


@dataclass
class BatchSkuSummary:
    """批量 PDF 中按 FBA 仓库 + SKU 合并后的 Excel 行。"""
    sku: str
    fba_warehouse: str
    box_count: int = 0
    total_qty: int = 0
    first_serial: str = ""
    last_serial: str = ""
    serial_ranges: list = field(default_factory=list)
    shipment_stems: list = field(default_factory=list)
    source_pdfs: list = field(default_factory=list)

    @property
    def serial_text(self) -> str:
        return compact_serial_ranges(self.serial_ranges)

    @property
    def shipment_name_text(self) -> str:
        names = []
        for name in self.shipment_stems:
            if name and name not in names:
                names.append(name)
        return f"货件名称：{'；'.join(names)}\n货件编号：\n货件追踪编号:"


def _split_serial(serial: str):
    """把 FBA 箱号拆成固定前缀、数字尾号和尾号宽度。"""
    match = re.match(r"^(.*\D)(\d+)$", (serial or "").strip(), re.IGNORECASE)
    if not match:
        return None
    return match.group(1), int(match.group(2)), len(match.group(2))


def compact_serial_ranges(serial_ranges) -> str:
    """合并同一箱号前缀下相邻或重叠的区间，存在断号时保留多个区间。"""
    values = []
    for value in serial_ranges:
        value = (value or "").strip()
        if value and value not in values:
            values.append(value)
    if not values:
        return ""

    intervals = []
    serial_prefix = None
    serial_width = None
    for value in values:
        parts = value.split("-", 1)
        start_info = _split_serial(parts[0])
        end_info = _split_serial(parts[-1])
        if not start_info or not end_info:
            return "；".join(values)
        start_prefix, start_number, start_width = start_info
        end_prefix, end_number, end_width = end_info
        if start_prefix.upper() != end_prefix.upper() or start_width != end_width:
            return "；".join(values)
        if serial_prefix is None:
            serial_prefix = start_prefix
            serial_width = start_width
        elif (serial_prefix.upper(), serial_width) != (start_prefix.upper(), start_width):
            return "；".join(values)
        intervals.append((min(start_number, end_number), max(start_number, end_number)))

    merged = []
    for start_number, end_number in sorted(intervals):
        if merged and start_number <= merged[-1][1] + 1:
            merged[-1] = (merged[-1][0], max(merged[-1][1], end_number))
        else:
            merged.append((start_number, end_number))

    def format_serial(number):
        return f"{serial_prefix}{number:0{serial_width}d}"

    return "；".join(
        f"{format_serial(start_number)}-{format_serial(end_number)}"
        for start_number, end_number in merged
    )


def merge_batch_skus(parsed_results) -> list:
    """同一 FBA 仓库且同一 SKU 合并；其余组合保持独立行。"""
    merged = {}
    for parsed in parsed_results:
        warehouse_key = (parsed.fba_warehouse or "").strip().upper()
        for summary in parsed.skus:
            normalized_sku = normalize_sku(summary.sku)
            key = (warehouse_key, normalized_sku.upper())
            row = merged.get(key)
            if row is None:
                row = BatchSkuSummary(sku=normalized_sku, fba_warehouse=parsed.fba_warehouse)
                merged[key] = row
            row.box_count += summary.box_count
            row.total_qty += summary.total_qty
            if not row.first_serial:
                row.first_serial = summary.first_serial
            row.last_serial = summary.last_serial or row.last_serial
            serial_range = "-".join(part for part in (summary.first_serial, summary.last_serial) if part)
            if serial_range:
                row.serial_ranges.append(serial_range)
            row.shipment_stems.append(parsed.pdf_stem)
            row.source_pdfs.append(parsed.pdf_path)
    return list(merged.values())


def build_batch_output_folder_name(merged_skus, folder_date="", transport="", person="", locked=True) -> str:
    unique_skus = []
    for item in merged_skus:
        if item.sku not in unique_skus:
            unique_skus.append(item.sku)
    sku_part = "&".join(unique_skus)
    if len(sku_part) > 64:
        sku_part = f"{unique_skus[0]}等{len(unique_skus)}个SKU"
    name = f"{sku_part or '批量货件'} {OUTPUT_FOLDER_SUFFIX}"
    if folder_date:
        name += f" {folder_date}"
    if transport:
        name += f" {display_transport(transport, locked)}"
    if person:
        name += f" {person}"
    return name


def run_batch_pipeline(pdf_paths, store_name: str,
                       product_overrides=None,
                       template_path: str = None,
                       btw_dir: str = None,
                       output_base: str = None,
                       folder_date: str = "",
                       transport: str = "普船",
                       delivery_days: int = 45,
                       person: str = "",
                       locked: bool = True) -> ProcessReport:
    """处理多个 PDF，并生成一份按 FBA 仓库 + SKU 聚合的 Excel。"""
    paths = [os.path.abspath(path) for path in pdf_paths if path]
    report = ProcessReport(pdf=paths[0] if paths else "", pdfs=paths)
    try:
        if not paths:
            raise ValueError("未选择任何 PDF")

        parsed_results = []
        for pdf_path in paths:
            parsed = parse_pdf(pdf_path)
            parsed_results.append(parsed)
            report.warnings.extend(f"{os.path.basename(pdf_path)}：{warning}" for warning in parsed.warnings)

        merged_skus = merge_batch_skus(parsed_results)
        report.skus = [(s.sku, s.box_count, s.total_qty) for s in merged_skus]
        report.sku_details = [
            {"sku": s.sku, "box_count": s.box_count, "total_qty": s.total_qty,
             "fba_warehouse": s.fba_warehouse, "source_count": len(s.source_pdfs)}
            for s in merged_skus
        ]

        base = (output_base or "").strip() or os.path.dirname(paths[0])
        folder_name = build_batch_output_folder_name(merged_skus, folder_date, transport, person, locked)
        output_dir = os.path.join(base, folder_name)
        os.makedirs(output_dir, exist_ok=True)
        report.output_dir = output_dir

        used_names = set()
        for pdf_path in paths:
            base_name = os.path.basename(pdf_path)
            stem, ext = os.path.splitext(base_name)
            candidate = base_name
            suffix = 2
            while candidate.lower() in used_names:
                candidate = f"{stem}_{suffix}{ext}"
                suffix += 1
            used_names.add(candidate.lower())
            dst_pdf = os.path.join(output_dir, candidate)
            report.output_pdfs.append(dst_pdf)
            try:
                info = process_pdf_fba_text(pdf_path, dst_pdf)
                if info.get("total_replacements", 0) == 0:
                    report.warnings.append(f"{base_name}：未找到 'FBA: ... Ltd.' 文本，已按原样输出")
            except Exception as error:
                shutil.copy2(pdf_path, dst_pdf)
                report.warnings.append(f"{base_name}：PDF 文本处理失败，已复制原文件：{error}")

        product_store = ProductStore()
        override_map = index_product_overrides(product_overrides)
        products_map = {}
        unique_skus = []
        for summary in merged_skus:
            if summary.sku not in unique_skus:
                unique_skus.append(summary.sku)
            product = resolve_product(product_store, summary.sku, override_map)
            if not product.get("fnsku") or not product.get("name"):
                if summary.sku not in report.product_missing:
                    report.product_missing.append(summary.sku)
            products_map[summary.sku] = product

        kwargs = {"btw_dir": btw_dir} if btw_dir else {}
        matched, missing = match_btw_files(unique_skus, output_dir, **kwargs)
        report.btw_matched = [item[0] for item in matched]
        report.btw_missing = missing

        excel_input = SimpleNamespace(skus=merged_skus, shipment_name_text="", fba_warehouse="")
        excel_kwargs = {"template_path": template_path} if template_path else {}
        report.excel_path = generate_excel(
            output_dir, excel_input, store_name, products_map,
            lock_status=lock_text(locked),
            fba_delivery_range=compute_fba_delivery_range(folder_date, delivery_days),
            **excel_kwargs)

        report.ok = True
        report.message = f"处理完成：{len(paths)} 份 PDF，{len(merged_skus)} 条货品记录"
    except Exception as error:
        report.ok = False
        report.message = f"处理失败：{error}"
    return report


if __name__ == "__main__":
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    print("2026-10-06 + 45天 →", compute_fba_delivery_range("2026-10-06", 45))
    print("2026-10-06 + 8天 →", compute_fba_delivery_range("2026-10-06", 8))
    print("锁仓运输:", display_transport("普船", True), "| 非锁仓:", display_transport("普船", False))
    print("A列:", lock_text(True), "/", lock_text(False))
