# -*- coding: utf-8 -*-
"""Excel 生成模块：基于模板生成 工厂发货计划.xlsx（每 SKU 一行，格式继承模板）"""
import copy
import datetime
import os
import shutil
import sys

if __package__ in (None, ""):
    sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from openpyxl import load_workbook
from openpyxl.styles import Font

from app.config import TEMPLATE_XLSX, OUTPUT_XLSX_NAME, resolve_template

MAX_COL = 13  # A~M


def _find_header_row(ws, keywords):
    """找到包含所有关键词的行号"""
    for row in ws.iter_rows(min_row=1, max_row=30):
        values = [str(c.value or "") for c in row]
        if all(any(k in v for v in values) for k in keywords):
            return row[0].row
    return None


def _capture_row(ws, row, max_col=MAX_COL):
    """捕获某行样式：返回 (styles列表, 行高)"""
    styles = []
    for c in range(1, max_col + 1):
        cell = ws.cell(row=row, column=c)
        styles.append(copy.copy(cell._style))
    height = ws.row_dimensions[row].height
    return styles, height


def _apply_row(ws, row, captured, max_col=MAX_COL):
    """把捕获的样式应用到某行"""
    styles, height = captured
    for c in range(1, max_col + 1):
        cell = ws.cell(row=row, column=c)
        cell._style = styles[c - 1]
    if height:
        ws.row_dimensions[row].height = height


def _force_black_font(cell):
    """强制黑色文字（模板某些单元格是金色/白色字体，写在黄底/白底上不可见）"""
    f = cell.font
    cell.font = Font(name=f.name, size=f.size, bold=f.bold, italic=f.italic,
                     underline=f.underline, strike=f.strike,
                     color="FF000000", scheme=f.scheme)


def _write(ws, row, col, value):
    """写值并强制黑色文字"""
    cell = ws.cell(row=row, column=col, value=value)
    _force_black_font(cell)
    return cell


def generate_excel(output_dir: str, parsed, store_name: str, products_map: dict,
                   template_path: str = None,
                   output_name: str = OUTPUT_XLSX_NAME,
                   lock_status: str = "AGL锁仓",
                   fba_delivery_range: str = "") -> str:
    """根据解析结果生成发货计划 Excel
    products_map: {sku: {"fnsku":..., "name":...}}
    lock_status: 「锁仓或非锁仓」A列值（AGL锁仓/非锁仓）
    fba_delivery_range: 「计划派送FBA时间」L列值（如 9月21日-9月27日）
    返回输出文件路径
    """
    if not template_path:
        template_path = resolve_template()
    if not os.path.exists(template_path):
        raise FileNotFoundError(f"找不到 Excel 模板：{template_path}")

    os.makedirs(output_dir, exist_ok=True)
    output_path = os.path.join(output_dir, output_name)

    # 若目标文件已存在且被占用（如 Excel 打开），给出明确提示
    try:
        shutil.copy2(template_path, output_path)
    except PermissionError:
        raise PermissionError(
            f"无法写入 {output_name}：目标文件可能正被 Excel 打开，请先关闭后重试。\n路径：{output_path}")
    except FileNotFoundError:
        raise FileNotFoundError(f"无法写入输出文件，请检查目录权限：{output_path}")

    wb = load_workbook(output_path)
    ws = wb["Sheet1"]

    # 1. 定位表头
    top_header_row = _find_header_row(ws, ["店铺", "SKU", "产品名称", "订单数量"])
    bottom_header_row = _find_header_row(ws, ["发货数量", "箱数", "条码标签", "箱唛流水号"])
    if not top_header_row or not bottom_header_row:
        raise ValueError("模板结构不符合预期：未找到上表/下表表头")

    # 2. 上表数据起始行（跳过“采购填写”占位行）
    top_data_start = top_header_row + 2

    # 3. 捕获格式基准（插行前，避免被移位）：模板上表数据行 / 下表数据行
    top_ref = _capture_row(ws, top_data_start)
    bottom_ref = _capture_row(ws, bottom_header_row + 1)

    # 4. 计算需要插入的行数，避免上表数据覆盖下表表头
    #    目标：下表表头位于 最后一条上表数据行 + 2（留 1 空行）
    n = len(parsed.skus)
    last_top_row = top_data_start + n - 1
    target_bottom_header = last_top_row + 2
    insert_count = max(0, target_bottom_header - bottom_header_row)
    if insert_count > 0:
        ws.insert_rows(top_data_start, insert_count)
        bottom_header_row += insert_count

    # 5. 填充上表（店铺/SKU/产品名称/计划派送FBA时间/货件创建时间）并应用参考格式
    today = datetime.date.today()
    for i, summary in enumerate(parsed.skus):
        row = top_data_start + i
        _apply_row(ws, row, top_ref)
        prod = products_map.get(summary.sku, {})
        _write(ws, row, 3, f"AMZN-{store_name}")   # C 店铺
        _write(ws, row, 4, summary.sku)            # D SKU
        _write(ws, row, 5, prod.get("name", ""))   # E 产品名称
        if fba_delivery_range:
            _write(ws, row, 12, fba_delivery_range)  # L 计划派送FBA时间
        m = _write(ws, row, 13, today)             # M 货件创建时间
        m.number_format = "yyyy/m/d"

    # 6. 填充下表（锁仓/店铺/SKU/名称/数量/箱数/条码标签/箱唛流水号/货件名称/FBA仓库）并应用参考格式
    bottom_data_start = bottom_header_row + 1
    for i, summary in enumerate(parsed.skus):
        row = bottom_data_start + i
        _apply_row(ws, row, bottom_ref)
        prod = products_map.get(summary.sku, {})
        _write(ws, row, 1, lock_status)                       # A 锁仓或非锁仓
        _write(ws, row, 3, f"AMZN-{store_name}")              # C 店铺
        _write(ws, row, 4, summary.sku)                       # D SKU
        _write(ws, row, 5, prod.get("name", ""))              # E 产品名称
        _write(ws, row, 6, summary.total_qty)                 # F 发货数量
        _write(ws, row, 7, summary.box_count)                 # G 箱数
        _write(ws, row, 8, prod.get("fnsku", ""))             # H 条码标签(FNSKU)
        serial_text = getattr(summary, "serial_text", "") or f"{summary.first_serial}-{summary.last_serial}"
        shipment_name = getattr(summary, "shipment_name_text", "") or parsed.shipment_name_text
        fba_warehouse = getattr(summary, "fba_warehouse", "") or parsed.fba_warehouse
        _write(ws, row, 9, serial_text)                        # I 箱唛流水号
        _write(ws, row, 10, shipment_name)                     # J 货件名称
        _write(ws, row, 11, fba_warehouse)                     # K FBA仓库

    wb.save(output_path)
    return output_path


