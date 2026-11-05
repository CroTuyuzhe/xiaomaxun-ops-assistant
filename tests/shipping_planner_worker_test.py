import os
import sys
import unittest


ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PYTHON_ROOT = os.path.join(ROOT, "src", "tools", "shipping-planner", "python")
if PYTHON_ROOT not in sys.path:
    sys.path.insert(0, PYTHON_ROOT)

from app.pdf_parser import SkuSummary, US_LINE_RE, normalize_sku
from app.pipeline import compute_fba_delivery_range, merge_batch_skus, build_output_folder_name, extract_pdf_sku_name
from types import SimpleNamespace


class ShippingPlannerWorkerTests(unittest.TestCase):
    def test_amazon_sku_prefix_accepts_dot_and_hyphen_variants(self):
        cases = {
            "US.CB29AW-3": "CB29AW-3",
            "US-EZB03PPBK-4": "EZB03PPBK-4",
            "US1.DEMO-SKU-16": "DEMO-SKU-16",
            "US1-DEMO-SKU-16": "DEMO-SKU-16",
            "US2.DEMO-SKU-02": "DEMO-SKU-02",
            "US2-DEMO-SKU-02": "DEMO-SKU-02",
            "US12.DEMO-SKU-15": "DEMO-SKU-15",
        }
        for source, expected in cases.items():
            with self.subTest(source=source):
                match = US_LINE_RE.match(source)
                self.assertIsNotNone(match)
                self.assertEqual(match.group(1), expected)
                self.assertEqual(normalize_sku(source), expected)

    def test_real_sku_hyphens_and_us_sku_names_are_not_truncated(self):
        self.assertEqual(normalize_sku("DEMO-SKU-15"), "DEMO-SKU-15")
        self.assertEqual(normalize_sku("DEMO-SKU-13"), "DEMO-SKU-13")

    def test_batch_excel_rows_defensively_normalize_sku_prefixes(self):
        parsed = SimpleNamespace(
            fba_warehouse="POC3",
            pdf_stem="sample",
            pdf_path="sample.pdf",
            skus=[SkuSummary(
                sku="US1.DEMO-SKU-16",
                box_count=2,
                total_qty=200,
                first_serial="FBA1U000001",
                last_serial="FBA1U000002",
            )],
        )
        merged = merge_batch_skus([parsed])
        self.assertEqual(len(merged), 1)
        self.assertEqual(merged[0].sku, "DEMO-SKU-16")

    def test_shipment_id_filename_uses_pdf_skus_for_folder(self):
        parsed = SimpleNamespace(
            pdf_stem="20261111-FBA19W2W4TBV-1072PCS-SBD3",
            skus=[SkuSummary(sku="DEMO-SKU-01"), SkuSummary(sku="DEMO-SKU-02")],
        )
        self.assertEqual(
            build_output_folder_name(parsed),
            "DEMO-SKU-01&DEMO-SKU-02 工厂发货计划",
        )
        self.assertIsNone(extract_pdf_sku_name(
            "20261111-fba19w2w4tbv-1072PCS-SBD3", ["DEMO-SKU-01"]))

    def test_legacy_filename_keeps_sku_code(self):
        self.assertEqual(extract_pdf_sku_name(
            "20260812-KBCS02-10BAXL-7420PCS-POC2", ["KBCS02", "10BAXL"]),
            "KBCS02-10BAXL")

    def test_delivery_days_are_independent_from_transport(self):
        self.assertEqual(
            compute_fba_delivery_range("2026-10-06", 45),
            "11月16日-11月22日",
        )
        self.assertEqual(
            compute_fba_delivery_range("2026-10-06", 8),
            "10月12日-10月18日",
        )
        self.assertEqual(
            compute_fba_delivery_range("2026-10-06", 0),
            "10月5日-10月11日",
        )

    def test_delivery_days_reject_negative_values(self):
        with self.assertRaisesRegex(ValueError, "不能小于"):
            compute_fba_delivery_range("2026-10-06", -1)


if __name__ == "__main__":
    unittest.main()
