import importlib.util
import os
import tempfile
import unittest
from datetime import datetime

import openpyxl


ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
WORKER_PATH = os.path.join(ROOT, "src", "tools", "daily-report", "python", "worker.py")
SPEC = importlib.util.spec_from_file_location("daily_report_worker", WORKER_PATH)
worker = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(worker)


class DailyReportRatingParserTests(unittest.TestCase):
    def test_date_columns_scan_past_legacy_column_499_limit(self):
        class FakeColumnCollection:
            Count = 502

        class FakeUsedRange:
            Column = 1
            Columns = FakeColumnCollection()

        class FakeCell:
            def __init__(self, value):
                self.Value = value

        class FakeCells:
            def __init__(self, values):
                self.values = values

            def __call__(self, row, column):
                return FakeCell(self.values.get((row, column)))

        class FakeWorksheet:
            UsedRange = FakeUsedRange()

            def __init__(self):
                values = {
                    (2, column): datetime(2025, 1, 1)
                    for column in range(5, 498)
                }
                values.update({
                    (2, 498): datetime(2026, 10, 7),
                    (2, 499): datetime(2026, 10, 8),
                    (2, 500): datetime(2026, 10, 9),
                    (2, 501): datetime(2026, 10, 10),
                    (2, 502): datetime(2026, 10, 11),
                })
                self.Cells = FakeCells(values)

        columns = worker.date_columns(FakeWorksheet(), 2)

        self.assertEqual(columns[-5:], [
            (498, "2026-10-07"),
            (499, "2026-10-08"),
            (500, "2026-10-09"),
            (501, "2026-10-10"),
            (502, "2026-10-11"),
        ])

    def test_current_amazon_percent_word_format(self):
        labels = [
            "77 percent of reviews have 5 stars",
            "10 percent of reviews have 4 stars",
            "5 percent of reviews have 3 stars",
            "3 percent of reviews have 2 stars",
            "5 percent of reviews have 1 stars",
        ]
        self.assertEqual(worker.parse_rating_percentages(labels), {
            5: 77, 4: 10, 3: 5, 2: 3, 1: 5,
        })

    def test_legacy_percent_symbol_formats_remain_supported(self):
        labels = [
            "5 stars represent 81% of ratings",
            "12% of ratings are 4 stars",
            "3 星占 7%",
        ]
        self.assertEqual(worker.parse_rating_percentages(labels), {
            5: 81, 4: 12, 3: 7,
        })

    def test_html_extractor_accepts_percent_word(self):
        page_html = (
            '<a aria-label="77 percent of reviews have 5 stars"></a>'
            '<a aria-label="10 percent of reviews have 4 stars"></a>'
        )
        self.assertEqual(worker.rating_percentages_from_html(page_html), {5: 77, 4: 10})

    def test_inspection_marks_the_current_wps_sheet(self):
        class FakeSheet:
            Name = "B0BBBBBBBB"

        class FakeWorkbook:
            Name = "运营日表.xlsx"
            ActiveSheet = FakeSheet()

        class FakeWps:
            ActiveWorkbook = FakeWorkbook()

        captured = []
        original_connect = worker.connect_wps
        original_disconnect = worker.disconnect_wps
        original_list = worker.list_daily_worksheets
        original_result = worker.result
        try:
            worker.connect_wps = lambda: FakeWps()
            worker.disconnect_wps = lambda: None
            worker.list_daily_worksheets = lambda _wps: [
                {"workbookName": "运营日表.xlsx", "worksheetName": "B0AAAAAAAA", "asin": "B0AAAAAAAA", "usRow": 3},
                {"workbookName": "运营日表.xlsx", "worksheetName": "B0BBBBBBBB", "asin": "B0BBBBBBBB", "usRow": 3},
            ]
            worker.result = lambda ok, **kwargs: captured.append({"ok": ok, **kwargs})
            worker.inspect_command()
        finally:
            worker.connect_wps = original_connect
            worker.disconnect_wps = original_disconnect
            worker.list_daily_worksheets = original_list
            worker.result = original_result

        self.assertTrue(captured[0]["ok"])
        self.assertFalse(captured[0]["workbooks"][0]["isActive"])
        self.assertTrue(captured[0]["workbooks"][1]["isActive"])


class DailyReportKeywordParserTests(unittest.TestCase):
    def create_report(self, directory, headers, rows, header_row=2, title="Sheet1"):
        path = os.path.join(directory, "keyword-report.xlsx")
        workbook = openpyxl.Workbook()
        sheet = workbook.active
        sheet.title = title
        for column, header in enumerate(headers, 1):
            sheet.cell(row=header_row, column=column).value = header
        for row_index, values in enumerate(rows, header_row + 1):
            for column, value in enumerate(values, 1):
                sheet.cell(row=row_index, column=column).value = value
        workbook.save(path)
        workbook.close()
        return path

    def test_current_report_uses_position_header_instead_of_fixed_column(self):
        with tempfile.TemporaryDirectory() as directory:
            path = self.create_report(directory, [
                "#", "Keyword", "Indexed?", "Ranked ASIN", "Badges",
                "Rank", "Position", "Search Volume",
            ], [
                [1, "cutting board", "Indexed", "B08PNTW3XB", "—", 112, "Page 3 · #16", 626183],
                [2, "small cutting board", "Not Indexed", "-", "—", "—", "—", 44269],
            ])
            data, metadata = worker.read_keyword_report(path)

        self.assertEqual(data, {
            "cutting board": "3 · #16",
            "small cutting board": "",
        })
        self.assertEqual(metadata["keywordColumn"], 2)
        self.assertEqual(metadata["positionColumn"], 7)
        self.assertEqual(metadata["rankedRows"], 1)
        self.assertEqual(metadata["unrankedRows"], 1)

    def test_reordered_and_renamed_columns_are_discovered_by_headers(self):
        with tempfile.TemporaryDirectory() as directory:
            path = self.create_report(directory, [
                "Page Position", "Search Volume", "Search Term", "Indexed?",
            ], [
                ["Page 2 · #4", 2000, "cutting board for kitchen", "Indexed"],
            ], header_row=5, title="Keyword Results")
            data, metadata = worker.read_keyword_report(path)

        self.assertEqual(data["cutting board for kitchen"], "2 · #4")
        self.assertEqual(metadata["sheet"], "Keyword Results")
        self.assertEqual(metadata["headerRow"], 5)
        self.assertEqual(metadata["keywordColumn"], 3)
        self.assertEqual(metadata["positionColumn"], 1)

    def test_legacy_position_column_remains_supported(self):
        with tempfile.TemporaryDirectory() as directory:
            path = self.create_report(directory, [
                "#", "Keyword", "Indexed?", "Ranked ASIN", "Badges", "Position",
            ], [
                [1, "plastic cutting board", "Indexed", "B08PNTW3XB", "—", "Page 1 · #25"],
            ])
            data, metadata = worker.read_keyword_report(path)

        self.assertEqual(data["plastic cutting board"], "1 · #25")
        self.assertEqual(metadata["positionColumn"], 6)

    def test_rank_column_is_a_safe_fallback_when_position_is_absent(self):
        with tempfile.TemporaryDirectory() as directory:
            path = self.create_report(directory, ["Search Term", "Rank"], [
                ["plastic cutting boards", 8],
            ])
            data, metadata = worker.read_keyword_report(path)

        self.assertEqual(data["plastic cutting boards"], "8")
        self.assertEqual(metadata["positionHeader"], "Rank")

    def test_parent_analysis_prefers_natural_page_position_over_rank_and_sp(self):
        with tempfile.TemporaryDirectory() as directory:
            path = self.create_report(directory, [
                "关键词 (数据来源于西柚洞察)",
                "自然排名",
                "自然排名(页码-页内排名)",
                "SP广告排名(页码-页内排名)",
            ], [
                ["wood cutting board", 18, "P1-18", "P1-5"],
                ["cutting board", 81, "P2-33", "P3-4"],
            ], header_row=1, title="2026-10-01~2026-10-07")
            data, metadata = worker.read_keyword_report(path)

        self.assertEqual(data["wood cutting board"], "1 · #18")
        self.assertEqual(data["cutting board"], "2 · #33")
        self.assertEqual(metadata["positionColumn"], 3)
        self.assertEqual(metadata["positionHeader"], "自然排名(页码-页内排名)")

    def test_page_shaped_values_are_a_fallback_for_an_unknown_position_header(self):
        with tempfile.TemporaryDirectory() as directory:
            path = self.create_report(directory, ["Keyword Phrase", "Placement"], [
                ["cutting boards", "Page 1 · #32"],
            ])
            data, metadata = worker.read_keyword_report(path)

        self.assertEqual(data["cutting boards"], "1 · #32")
        self.assertEqual(metadata["positionHeader"], "Placement")

    def test_keyword_matching_ignores_case_and_repeated_spaces(self):
        self.assertEqual(
            worker.normalize_keyword_key("  Cutting   Board "),
            worker.normalize_keyword_key("cutting board"),
        )

    def test_keyword_target_date_keeps_us_previous_day_logic(self):
        columns = [
            (28, "2026-10-07"),
            (29, "2026-10-08"),
            (30, "2026-10-09"),
        ]
        china_now = worker.datetime(2026, 10, 9, 12, 0, 0)
        self.assertEqual(
            worker.latest_target_column(columns, china_now),
            (29, "2026-10-08"),
        )
        self.assertEqual(
            worker.traffic_target_column(columns, china_now),
            (29, "2026-10-08"),
        )

    def test_process_group_reports_actual_written_and_unranked_counts(self):
        class FakeCell:
            def __init__(self, cells, key):
                self.cells = cells
                self.key = key

            @property
            def Value(self):
                return self.cells.get(self.key)

            @Value.setter
            def Value(self, value):
                self.cells[self.key] = value

        class FakeCells:
            def __init__(self, cells):
                self.cells = cells

            def __call__(self, row, column):
                return FakeCell(self.cells, (row, column))

        class FakeWorksheet:
            Name = "Sheet1"

            def __init__(self):
                self.values = {
                    (2, 5): datetime.now(),
                    (40, 2): "1",
                    (40, 4): "Cutting   Board",
                    (41, 2): "2",
                    (41, 4): "small cutting board",
                }
                self.Cells = FakeCells(self.values)

        class FakeWorkbook:
            Name = "运营日表.xlsx"

            def __init__(self):
                self.saved = False

            def Save(self):
                self.saved = True

        with tempfile.TemporaryDirectory() as directory:
            path = self.create_report(directory, ["Keyword", "Position"], [
                ["cutting board", "Page 3 · #16"],
                ["small cutting board", "—"],
            ])
            worksheet = FakeWorksheet()
            workbook = FakeWorkbook()
            original_choose = worker.choose_daily_worksheet
            try:
                worker.choose_daily_worksheet = lambda _wps, _asin="": {
                    "workbook": workbook,
                    "worksheet": worksheet,
                    "workbookName": workbook.Name,
                    "worksheetName": worksheet.Name,
                    "asin": "B0C1R4PH5T",
                    "usRow": 2,
                }
                result = worker.process_group(object(), {
                    "name": "回归测试",
                    "asin": "B0C1R4PH5T",
                    "keyword": path,
                }, 1, 1, False)
            finally:
                worker.choose_daily_worksheet = original_choose

        self.assertEqual(worksheet.values[(40, 5)], "3 · #16")
        self.assertEqual(worksheet.values[(41, 5)], "")
        self.assertEqual(result["keywordMatches"], 2)
        self.assertEqual(result["keywordWritten"], 1)
        self.assertEqual(result["keywordUnranked"], 1)
        self.assertEqual(result["keywordSourceRows"], 2)
        self.assertIn("关键词表有 1 条未收录", result["warnings"])
        self.assertTrue(workbook.saved)


if __name__ == "__main__":
    unittest.main()
