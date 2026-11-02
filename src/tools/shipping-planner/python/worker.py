# -*- coding: utf-8 -*-
"""小马逊运营助手：工厂发货计划无界面工作进程。"""
import argparse
import json
import os
import sys


def load_products(file_path):
    if not file_path:
        return []
    with open(file_path, "r", encoding="utf-8") as handle:
        payload = json.load(handle)
    products = payload.get("products", []) if isinstance(payload, dict) else payload
    return products if isinstance(products, list) else []


def report_payload(report):
    details = report.sku_details or [
        {"sku": sku, "box_count": box_count, "total_qty": total_qty,
         "fba_warehouse": "", "source_count": 1}
        for sku, box_count, total_qty in report.skus
    ]
    return {
        "ok": bool(report.ok),
        "message": report.message,
        "pdf": report.pdf,
        "pdfs": report.pdfs,
        "outputPdfs": report.output_pdfs,
        "outputDir": report.output_dir,
        "excelPath": report.excel_path,
        "skus": [{
            "sku": item["sku"],
            "boxCount": item["box_count"],
            "totalQty": item["total_qty"],
            "fbaWarehouse": item.get("fba_warehouse", ""),
            "sourceCount": item.get("source_count", 1),
        } for item in details],
        "btwMatched": report.btw_matched,
        "btwMissing": report.btw_missing,
        "productMissing": report.product_missing,
        "warnings": report.warnings,
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--pdf", action="append", required=True)
    parser.add_argument("--store", default="StoreA")
    parser.add_argument("--date", default="")
    parser.add_argument("--transport", default="普船")
    parser.add_argument("--delivery-days", type=int, default=45)
    parser.add_argument("--person", default="")
    parser.add_argument("--locked", choices=("0", "1"), default="1")
    parser.add_argument("--btw", default="")
    parser.add_argument("--output", default="")
    parser.add_argument("--products-json", default="")
    parser.add_argument("--inspect-only", action="store_true")
    args = parser.parse_args()

    # 所有标准输出只保留最后一行 JSON，Electron 可以稳定解析。
    from app.pipeline import merge_batch_skus, run_batch_pipeline, run_pipeline
    from app.pdf_parser import parse_pdf

    pdf_paths = [os.path.abspath(value) for value in args.pdf]
    if args.inspect_only:
        parsed_results = [parse_pdf(pdf_path) for pdf_path in pdf_paths]
        summaries = merge_batch_skus(parsed_results)
        print(json.dumps({
            "ok": True,
            "pdfs": pdf_paths,
            "skus": [{
                "sku": item.sku,
                "boxCount": item.box_count,
                "totalQty": item.total_qty,
                "fbaWarehouse": item.fba_warehouse,
            } for item in summaries],
        }, ensure_ascii=False))
        return 0

    common = {
        "store_name": args.store,
        "btw_dir": os.path.abspath(args.btw) if args.btw else None,
        "output_base": os.path.abspath(args.output) if args.output else None,
        "folder_date": args.date,
        "transport": args.transport,
        "delivery_days": args.delivery_days,
        "person": args.person,
        "locked": args.locked == "1",
        "product_overrides": load_products(args.products_json),
    }
    report = run_pipeline(pdf_path=pdf_paths[0], **common) if len(pdf_paths) == 1 \
        else run_batch_pipeline(pdf_paths=pdf_paths, **common)
    print(json.dumps(report_payload(report), ensure_ascii=False))
    return 0 if report.ok else 1


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as error:
        print(json.dumps({"ok": False, "message": f"处理失败：{error}"}, ensure_ascii=False))
        sys.exit(1)
