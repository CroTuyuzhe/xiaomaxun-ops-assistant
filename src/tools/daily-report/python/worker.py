# -*- coding: utf-8 -*-
"""小马逊运营助手：每日数据填报无界面工作进程。"""
import argparse
import html as html_lib
import json
import os
import re
import sys
import time
import unicodedata
from datetime import datetime, timedelta
from urllib.request import Request, urlopen

try:
    import openpyxl
except Exception:
    openpyxl = None

try:
    import pythoncom
    import win32com.client
except Exception:
    pythoncom = None
    win32com = None

try:
    from selenium import webdriver
    from selenium.webdriver.chrome.options import Options
    from selenium.webdriver.chrome.service import Service
    from selenium.webdriver.common.by import By
    from selenium.common.exceptions import TimeoutException, WebDriverException
    from selenium.webdriver.support.ui import WebDriverWait
except Exception:
    webdriver = None
    Options = None
    By = None
    TimeoutException = Exception
    WebDriverException = Exception
    WebDriverWait = None


ASIN_RE = re.compile(r"\b(B0[A-Z0-9]{8})\b", re.IGNORECASE)
PRODUCT_HEADERS = [
    "销量", "单量", "大类排名", "小类排名", "评分", "Sessions-Browser",
    "Sessions-Total", "PV-Browser", "点击", "广告单量", "自然订单",
]
KEYWORD_HEADER_ALIASES = {
    "keyword", "keywords", "searchterm", "searchterms", "query",
    "关键词", "关键字", "搜索词", "投放词",
}
POSITION_HEADER_ALIASES = {
    "position", "pageposition", "serpposition", "rankposition",
    "organicposition", "位置", "排名位置", "页码位置", "页码排名", "自然位置",
    "自然排名页码页内排名",
}
RANK_HEADER_ALIASES = {
    "rank", "ranking", "keywordrank", "organicrank",
    "排名", "关键词排名", "自然排名",
}
MISSING_POSITION_VALUES = {
    "", "na", "none", "null",
    "notindexed", "unranked", "notfound", "未收录", "未排名", "无排名",
}


def emit(payload):
    print(json.dumps(payload, ensure_ascii=False), flush=True)


def log(message, phase="working", group_index=None, group_total=None):
    payload = {"type": "progress", "phase": phase, "message": str(message)}
    if group_index is not None:
        payload["groupIndex"] = group_index
    if group_total is not None:
        payload["groupTotal"] = group_total
    emit(payload)


def result(ok, **kwargs):
    emit({"type": "result", "ok": bool(ok), **kwargs})


def normalized_asin(value):
    match = ASIN_RE.search(str(value or "").upper())
    return match.group(1) if match else ""


def group_asin(group):
    for value in (group.get("asin"), group.get("keyword"), group.get("source"), group.get("name")):
        asin = normalized_asin(value)
        if asin:
            return asin
    return ""


def find_us_time_row_and_asin(ws):
    for row in range(1, 10):
        a_value = str(ws.Cells(row, 1).Value or "")
        if "美国" in a_value:
            asin = normalized_asin(ws.Cells(row, 2).Value)
            if not asin:
                for nearby in (row + 1, row - 1, row + 2):
                    if nearby > 0:
                        asin = normalized_asin(ws.Cells(nearby, 2).Value)
                        if asin:
                            break
            return row, asin
    for row in range(1, 10):
        asin = normalized_asin(ws.Cells(row, 2).Value)
        if asin:
            return row, asin
    return 3, ""


def list_daily_worksheets(wps):
    candidates = []
    for workbook_index in range(1, wps.Workbooks.Count + 1):
        try:
            workbook = wps.Workbooks(workbook_index)
            for sheet_index in range(1, workbook.Worksheets.Count + 1):
                worksheet = workbook.Worksheets(sheet_index)
                if str(worksheet.Cells(1, 1).Value or "").strip() == "时间":
                    continue
                us_row, asin = find_us_time_row_and_asin(worksheet)
                if asin:
                    candidates.append({
                        "workbook": workbook,
                        "worksheet": worksheet,
                        "workbookName": str(workbook.Name),
                        "worksheetName": str(worksheet.Name),
                        "usRow": us_row,
                        "asin": asin,
                    })
        except Exception:
            continue
    return candidates


def choose_daily_worksheet(wps, preferred_asin=""):
    candidates = list_daily_worksheets(wps)
    preferred = normalized_asin(preferred_asin)
    if preferred:
        exact = [item for item in candidates if item["asin"] == preferred]
        if exact:
            return exact[0]
    try:
        active_name = str(wps.ActiveWorkbook.Name) if wps.ActiveWorkbook else ""
        active_sheet = str(wps.ActiveWorkbook.ActiveSheet.Name) if wps.ActiveWorkbook else ""
        active = [item for item in candidates
                  if item["workbookName"] == active_name and item["worksheetName"] == active_sheet]
        if active and (not preferred or len(candidates) == 1):
            return active[0]
    except Exception:
        pass
    if len(candidates) == 1:
        return candidates[0]
    if preferred and candidates:
        raise ValueError(f"已打开的日表中找不到 ASIN {preferred}")
    if len(candidates) > 1:
        raise ValueError("检测到多个 WPS 日表，请为文件组填写目标 ASIN")
    raise ValueError("找不到已打开的 WPS 日表，请先打开日表后重试")


def extract_number(value):
    if value is None:
        return None
    numbers = re.findall(r"\d+", str(value))
    return int(numbers[-1]) if numbers else None


def normalize_header(value):
    text = unicodedata.normalize("NFKC", str(value or "")).casefold().strip()
    return re.sub(r"[^0-9a-z\u4e00-\u9fff]+", "", text)


def normalize_keyword_key(value):
    text = unicodedata.normalize("NFKC", str(value or "")).casefold().strip()
    return re.sub(r"\s+", " ", text)


def keyword_header_role(value):
    normalized = normalize_header(value)
    if normalized in KEYWORD_HEADER_ALIASES:
        return "keyword"
    if (
        ("keyword" in normalized or "关键词" in normalized or "搜索词" in normalized)
        and not any(marker in normalized for marker in (
            "rank", "position", "volume", "count", "排名", "位置", "数量", "搜索量"
        ))
    ):
        return "keyword"
    if normalized in POSITION_HEADER_ALIASES:
        return "position"
    if "页码" in normalized and ("页内排名" in normalized or "position" in normalized):
        return "position"
    if normalized.endswith("position") or normalized.endswith("位置"):
        return "position"
    if normalized in RANK_HEADER_ALIASES:
        return "rank"
    if (
        (normalized.endswith("rank") or normalized.endswith("排名"))
        and "asin" not in normalized
    ):
        return "rank"
    return ""


def looks_like_page_position(value):
    text = unicodedata.normalize("NFKC", str(value or "")).strip()
    return bool(
        re.search(r"^page\s*\d+", text, re.IGNORECASE)
        or re.search(r"^第?\s*\d+\s*页", text)
        or re.search(r"^p\s*\d+\s*[-–—]\s*#?\s*\d+$", text, re.IGNORECASE)
    )


def normalized_position(value):
    if value is None:
        return "", "empty"
    if isinstance(value, float) and value.is_integer():
        text = str(int(value))
    else:
        text = unicodedata.normalize("NFKC", str(value)).strip()
    if not text:
        return "", "empty"
    missing_key = normalize_header(text)
    if missing_key in MISSING_POSITION_VALUES:
        return "", "unranked"
    compact_match = re.fullmatch(
        r"p\s*(\d+)\s*[-–—]\s*#?\s*(\d+)", text, re.IGNORECASE
    )
    if compact_match:
        return f"{int(compact_match.group(1))} · #{int(compact_match.group(2))}", "ranked"
    text = re.sub(r"^\s*page\s*", "", text, flags=re.IGNORECASE).strip()
    text = re.sub(r"^\s*第\s*(\d+)\s*页", r"\1", text).strip()
    return text, "ranked"


def find_keyword_report_schema(sheet):
    best = None
    max_header_row = min(sheet.max_row, 30)
    max_column = min(sheet.max_column, 100)
    for row in range(1, max_header_row + 1):
        roles = {"keyword": [], "position": [], "rank": []}
        for column in range(1, max_column + 1):
            role = keyword_header_role(sheet.cell(row=row, column=column).value)
            if role:
                roles[role].append(column)
        if not roles["keyword"]:
            continue
        keyword_column = roles["keyword"][0]
        def position_priority(column):
            header = normalize_header(sheet.cell(row=row, column=column).value)
            is_natural = "自然" in header or "organic" in header
            is_ad = "广告" in header or header.startswith("sp")
            return (0 if is_natural and not is_ad else 1 if not is_ad else 2, column)

        position_column = min(roles["position"], key=position_priority) if roles["position"] else None
        rank_column = roles["rank"][0] if roles["rank"] else None
        score = 10 + (10 if position_column else 0) + (4 if rank_column else 0)
        candidate = {
            "header_row": row,
            "keyword_column": keyword_column,
            "position_column": position_column,
            "rank_column": rank_column,
            "score": score,
        }
        if not best or candidate["score"] > best["score"]:
            best = candidate

    if not best:
        return None

    if not best["position_column"]:
        sample_start = best["header_row"] + 1
        sample_end = min(sheet.max_row, sample_start + 300)
        page_counts = []
        for column in range(1, max_column + 1):
            if column == best["keyword_column"]:
                continue
            count = sum(
                looks_like_page_position(sheet.cell(row=row, column=column).value)
                for row in range(sample_start, sample_end + 1)
            )
            if count:
                page_counts.append((count, column))
        if page_counts:
            best["position_column"] = max(page_counts)[1]
            best["score"] += 6

    if not best["position_column"]:
        best["position_column"] = best["rank_column"]
    return best


def locate_keyword_report(workbook):
    candidates = []
    for sheet in workbook.worksheets:
        schema = find_keyword_report_schema(sheet)
        if schema and schema.get("position_column"):
            candidates.append((schema["score"], sheet, schema))
    if not candidates:
        raise ValueError(
            "关键词排名表未找到可识别的 Keyword/Search Term 和 Position/Rank 表头"
        )
    _, sheet, schema = max(candidates, key=lambda item: item[0])
    return sheet, schema


def build_row_map(ws):
    labels = {}
    for row in range(1, 100):
        value = ws.Cells(row, 2).Value
        if value is not None:
            labels[str(value).strip()] = row
    rules = [
        ("总销量", ["总销"], "销量", False),
        ("总单量", ["总单"], "单量", False),
        ("自然订单", ["自然订"], "自然订单", False),
        ("广告单量", ["广告单"], "广告单量", False),
        ("广告访问量(点击)", ["广告访问量"], "点击", False),
        ("访客量session", ["session"], "Sessions-Browser", False),
        ("PV(PC)", ["PV(PC)", "PV（PC）"], "PV-Browser", False),
        ("Session Total", ["Session Total"], "Sessions-Total", False),
        ("大类排名", ["大类"], "大类排名", True),
        ("小类排名", ["小类"], "小类排名", True),
        ("评分", ["星级"], "评分", False),
        ("五星数", ["五星数"], "pct5", False),
        ("四星数", ["四星数"], "pct4", False),
        ("三星数", ["三星数"], "pct3", False),
        ("二星数", ["二星数"], "pct2", False),
        ("一星数", ["一星数"], "pct1", False),
    ]
    mapping = []
    for display_name, keywords, source_key, extract in rules:
        found = False
        for label, row in labels.items():
            if any(keyword in label for keyword in keywords):
                mapping.append((display_name, source_key, row, extract))
                found = True
                break
        if found:
            continue

    keyword_start = None
    for label, row in labels.items():
        if "投放词" in label and "关键词" in label:
            keyword_start = row + 1
            break
    if not keyword_start:
        for label, row in labels.items():
            if label == "1":
                keyword_start = row
                break
    keyword_rows = {}
    if keyword_start:
        for row in range(keyword_start, keyword_start + 100):
            name = ws.Cells(row, 4).Value
            if name is None:
                if ws.Cells(row, 2).Value is None:
                    break
                continue
            keyword_rows[normalize_keyword_key(name)] = row
    return mapping, keyword_rows


def date_columns(ws, us_row):
    columns = []
    # 日表每天向右新增一列。旧实现把第 500 列当成硬上限，导致日期走到
    # 2026-10-09（SF/第 500 列）后无法再被识别。优先按工作表实际使用区域
    # 扫描，并保留连续空列终止逻辑，既支持长期扩展也避免遍历整张工作表。
    try:
        used_range = ws.UsedRange
        last_column = int(used_range.Column) + int(used_range.Columns.Count) - 1
    except Exception:
        last_column = 16384
    last_column = max(5, min(last_column, 16384))
    for column in range(5, last_column + 1):
        value = ws.Cells(us_row, column).Value
        if value is None:
            has_later_value = any(ws.Cells(us_row, next_column).Value is not None
                                  for next_column in range(
                                      column + 1,
                                      min(column + 11, last_column + 1),
                                  ))
            if not has_later_value:
                break
            continue
        date_text = ""
        if hasattr(value, "strftime"):
            date_text = value.strftime("%Y-%m-%d")
        elif isinstance(value, str):
            candidate = value[:10]
            try:
                datetime.strptime(candidate, "%Y-%m-%d")
                date_text = candidate
            except Exception:
                pass
        if date_text:
            columns.append((column, date_text))
    return columns


def select_sheet(workbook, wanted_name):
    for name in workbook.sheetnames:
        if name.lower() == wanted_name.lower():
            return workbook[name]
    return workbook.active


def read_product_data(file_path):
    workbook = openpyxl.load_workbook(file_path, data_only=True)
    try:
        sheet = select_sheet(workbook, "sheet1")
        data = {}
        for row in range(2, sheet.max_row + 1):
            time_value = sheet.cell(row=row, column=1).value
            if time_value:
                date_text = str(time_value)[:10]
                data[date_text] = {
                    header: sheet.cell(row=row, column=index + 2).value
                    for index, header in enumerate(PRODUCT_HEADERS)
                }
        return data
    finally:
        workbook.close()


def read_keyword_report(file_path):
    workbook = openpyxl.load_workbook(file_path, data_only=True)
    try:
        sheet, schema = locate_keyword_report(workbook)
        data = {}
        states = {"ranked": 0, "unranked": 0, "empty": 0}
        unranked_keys = []
        empty_keys = []
        for row in range(schema["header_row"] + 1, sheet.max_row + 1):
            name = sheet.cell(row=row, column=schema["keyword_column"]).value
            if not name:
                continue
            position = sheet.cell(row=row, column=schema["position_column"]).value
            position_text, state = normalized_position(position)
            states[state] += 1
            keyword = str(name).strip()
            data[keyword] = position_text
            if state == "unranked":
                unranked_keys.append(normalize_keyword_key(keyword))
            elif state == "empty":
                empty_keys.append(normalize_keyword_key(keyword))
        if not data:
            raise ValueError("关键词排名表已识别到表头，但没有关键词数据")
        if data and not states["ranked"] and not states["unranked"]:
            raise ValueError(
                "关键词排名表已识别到关键词，但 Position/Rank 列没有可用数据"
            )
        position_header = sheet.cell(
            row=schema["header_row"], column=schema["position_column"]
        ).value
        return data, {
            "sheet": sheet.title,
            "headerRow": schema["header_row"],
            "keywordColumn": schema["keyword_column"],
            "positionColumn": schema["position_column"],
            "positionHeader": str(position_header or ""),
            "sourceRows": len(data),
            "rankedRows": states["ranked"],
            "unrankedRows": states["unranked"],
            "emptyRows": states["empty"],
            "unrankedKeys": unranked_keys,
            "emptyKeys": empty_keys,
        }
    finally:
        workbook.close()


def read_keyword_data(file_path):
    data, _ = read_keyword_report(file_path)
    return data


def parse_rating_percentages(labels):
    percentages = {}
    for label in labels:
        text = re.sub(r"\s+", " ", str(label or "")).strip()
        match = re.search(
            r"([1-5])\s*(?:stars?|星).*?(\d{1,3})\s*(?:%|percent\b)",
            text,
            re.IGNORECASE,
        )
        if match:
            percentages[int(match.group(1))] = int(match.group(2))
            continue
        # Amazon 2026 年新版文案示例：
        # "77 percent of reviews have 5 stars"。
        match = re.search(
            r"(\d{1,3})\s*(?:%|percent\b).*?([1-5])\s*(?:stars?|星)",
            text,
            re.IGNORECASE,
        )
        if match:
            percentages[int(match.group(2))] = int(match.group(1))
    return percentages


def amazon_rating_url(asin):
    return f"https://www.amazon.com/dp/{asin}?th=1#averageCustomerReviewsAnchor"


def rating_percentages_from_html(page_html):
    # 不再只选择带 % 符号的 aria-label；Amazon 现在常用英文单词
    # "percent"，先读取全部标签再交给格式解析器筛选。
    labels = re.findall(
        r"aria-label\s*=\s*['\"]([^'\"]*)['\"]",
        str(page_html or ""),
        re.IGNORECASE,
    )
    return parse_rating_percentages([html_lib.unescape(label) for label in labels])


def concise_browser_error(error):
    message = (str(error or "").strip().splitlines() or [error.__class__.__name__])[0]
    message = re.sub(r"\s*\(Session info:.*$", "", message, flags=re.IGNORECASE).strip()
    if not message:
        message = error.__class__.__name__
    return message[:180]


def request_rating_percentages(asin):
    # 商品页可能延迟加载评价区域；直接请求当前 ASIN 的评分摘要，
    # 不依赖商品页广告、推荐商品或浏览器驱动下载。
    urls = [
        f"https://www.amazon.com/gp/customer-reviews/widgets/average-customer-review/popover?contextId=dpx&asin={asin}",
        amazon_rating_url(asin),
    ]
    errors = []
    for url in urls:
        request = Request(url, headers={
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/131.0.0.0 Safari/537.36"
            ),
            "Accept-Language": "en-US,en;q=0.9",
            "Cookie": "lc-main=en_US; i18n-prefs=USD",
        })
        try:
            with urlopen(request, timeout=8) as response:
                page_html = response.read(3_000_000).decode("utf-8", errors="replace")
            if re.search(r"validateCaptcha|Robot Check|automated access", page_html, re.I):
                errors.append("Amazon 返回验证页面，请在浏览器完成验证后重试")
                continue
            percentages = rating_percentages_from_html(page_html)
            if len(percentages) == 5:
                return percentages
            errors.append("Amazon 页面未包含完整的五星至一星占比")
        except Exception as error:
            errors.append(concise_browser_error(error))
    raise RuntimeError("；".join(dict.fromkeys(errors)))


def cached_chrome_driver():
    # 优先使用与本机 Chrome 主版本匹配的缓存驱动，避免每次联网解析驱动。
    if sys.platform != "win32":
        return None
    try:
        import winreg
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, r"Software\Google\Chrome\BLBeacon") as key:
            version = winreg.QueryValueEx(key, "version")[0]
        from pathlib import Path
        candidates = list((Path.home() / ".cache" / "selenium" / "chromedriver" / "win64").glob(f"{version.split('.')[0]}.*/*chromedriver.exe"))
        return str(max(candidates, key=lambda item: tuple(int(x) for x in item.parent.name.split('.')))) if candidates else None
    except Exception:
        return None


def scrape_ratings(asin):
    # 先尝试直接读取服务端 HTML。多数页面不需要启动 Chrome，速度更快，
    # 也不会被页面图片、广告与推荐模块拖慢渲染进程。
    direct_error = "未获取到星级分布"
    try:
        percentages = request_rating_percentages(asin)
        if percentages:
            return {f"pct{star}": f"{percentages[star]}%" for star in range(5, 0, -1)
                    if star in percentages}
    except Exception as error:
        direct_error = concise_browser_error(error)

    if not webdriver:
        raise RuntimeError("内置评分抓取组件不可用")
    options = Options()
    options.add_argument("--headless=new")
    options.add_argument("--no-sandbox")
    options.add_argument("--lang=en-US")
    options.add_argument("--window-size=1280,900")
    options.add_argument("--disable-background-networking")
    options.add_argument("--disable-default-apps")
    options.add_argument("--disable-extensions")
    options.add_argument("--disable-sync")
    options.add_argument("--no-first-run")
    options.page_load_strategy = "none"
    options.add_experimental_option("prefs", {
        "intl.accept_languages": "en-US,en",
        "profile.managed_default_content_settings.images": 2,
        "profile.default_content_setting_values.notifications": 2,
    })
    os.environ.setdefault("SE_TIMEOUT", "15")
    os.environ.setdefault("SE_AVOID_STATS", "true")
    cached_driver = cached_chrome_driver()
    try:
        driver = webdriver.Chrome(service=Service(executable_path=cached_driver), options=options) if cached_driver else webdriver.Chrome(options=options)
    except Exception as error:
        raise RuntimeError(f"评分接口：{direct_error}；浏览器启动失败：{concise_browser_error(error)}") from error
    try:
        driver.set_page_load_timeout(20)
        driver.set_script_timeout(10)
        try:
            driver.get(amazon_rating_url(asin))
        except TimeoutException:
            try:
                driver.execute_script("window.stop();")
            except Exception:
                pass

        deadline = time.monotonic() + 18
        percentages = {}
        last_error = None
        scrolled = False
        while time.monotonic() < deadline and len(percentages) != 5:
            try:
                if not scrolled:
                    scrolled = bool(driver.execute_script("const el=document.querySelector('#customerReviews, #reviewsMedley, #averageCustomerReviews'); if(el){el.scrollIntoView();return true;} return false;"))
                elements = driver.find_elements(
                    By.CSS_SELECTOR,
                    '#histogramTable [aria-label*="%"], '
                    '#histogramTable [aria-label*="percent"], '
                    'a[aria-label*="%"], a[aria-label*="percent"]',
                )
                labels = [element.get_attribute("aria-label") or element.text for element in elements]
                percentages = parse_rating_percentages(labels)
                if not percentages:
                    percentages = rating_percentages_from_html(driver.page_source)
            except (TimeoutException, WebDriverException) as error:
                last_error = error
                break
            if not percentages:
                time.sleep(0.75)
        if len(percentages) != 5:
            if last_error:
                raise RuntimeError(
                    f"Amazon 页面加载超时或浏览器无响应：{concise_browser_error(last_error)}"
                )
            raise RuntimeError(f"评分接口：{direct_error}；浏览器页面未读取到完整星级分布")
        return {f"pct{star}": f"{percentages[star]}%" for star in range(5, 0, -1) if star in percentages}
    finally:
        try:
            driver.quit()
        except Exception:
            pass


def us_reporting_date(now=None):
    """运营日表沿用原逻辑：北京时间当天对应美国站前一自然日。"""
    reference = now or datetime.now()
    return (reference - timedelta(days=1)).strftime("%Y-%m-%d")


def latest_target_column(columns, now=None):
    reporting_date = us_reporting_date(now)
    for column, date_text in columns:
        if date_text == reporting_date:
            return column, date_text
    cutoff = datetime.strptime(reporting_date, "%Y-%m-%d")
    for column, date_text in reversed(columns):
        try:
            if datetime.strptime(date_text, "%Y-%m-%d") <= cutoff:
                return column, date_text
        except Exception:
            continue
    return columns[-1] if columns else (None, "")


def process_group(wps, group, index, total, include_ratings):
    name = str(group.get("name") or f"组{index}").strip()
    preferred_asin = group_asin(group)
    selected = choose_daily_worksheet(wps, preferred_asin)
    workbook = selected["workbook"]
    worksheet = selected["worksheet"]
    asin = selected["asin"]
    us_row = selected["usRow"]
    log(f"[{index}/{total}] {name} · {selected['workbookName']} · {asin}", "group", index, total)

    columns = date_columns(worksheet, us_row)
    if not columns:
        raise ValueError("日表未识别到日期列")
    mapping, keyword_rows = build_row_map(worksheet)
    target_column, target_date = latest_target_column(columns)
    matched_days = 0
    product_cells = 0
    keyword_matches = 0
    keyword_written = 0
    keyword_unranked = 0
    keyword_source_rows = 0
    rating_fields = 0
    rating_fallback = False
    warnings = []

    source_path = str(group.get("source") or "").strip()
    if source_path:
        product_data = read_product_data(source_path)
        matches = [(column, date_text) for column, date_text in columns if date_text in product_data]
        if matches:
            matched_days = len(matches)
            target_column, target_date = matches[-1]
            for column, date_text in matches:
                values = product_data[date_text]
                for _, source_key, row, extract in mapping:
                    if source_key.startswith("pct"):
                        continue
                    raw_value = values.get(source_key)
                    value = extract_number(raw_value) if extract else raw_value
                    if value is not None:
                        worksheet.Cells(row, column).Value = value
                        product_cells += 1
        else:
            warnings.append("产品表现表与日表日期无交集")

    if include_ratings and asin and target_column:
        log(f"正在抓取 {asin} 的 Amazon 星级分布…", "ratings", index, total)
        try:
            rating_data = scrape_ratings(asin)
            for _, source_key, row, _ in mapping:
                if source_key in rating_data:
                    worksheet.Cells(row, target_column).Value = rating_data[source_key]
                    rating_fields += 1
            if rating_data and rating_fields == 0:
                warnings.append("已获取星级分布，但日表未识别到五星数至一星数行")
                rating_fallback = True
            if not rating_data:
                warnings.append("Amazon 页面未读取到星级分布")
                rating_fallback = True
        except Exception as error:
            warnings.append(f"Amazon 星级抓取失败：{concise_browser_error(error)}")
            rating_fallback = True

    if not include_ratings:
        warnings.append("已关闭同步 Amazon 星级分布，本次未抓取")

    keyword_path = str(group.get("keyword") or "").strip()
    if keyword_path:
        keyword_data, keyword_meta = read_keyword_report(keyword_path)
        keyword_source_rows = keyword_meta["sourceRows"]
        keyword_unranked = keyword_meta["unrankedRows"]
        unranked_keys = set(keyword_meta["unrankedKeys"])
        log(
            f"关键词表已识别 {keyword_source_rows} 条 · "
            f"排名列 {keyword_meta['positionHeader'] or keyword_meta['positionColumn']}",
            "keywords", index, total,
        )
        for keyword, position in keyword_data.items():
            target_row = keyword_rows.get(normalize_keyword_key(keyword))
            if target_row:
                keyword_matches += 1
                if position:
                    worksheet.Cells(target_row, target_column).Value = position
                    keyword_written += 1
                elif normalize_keyword_key(keyword) in unranked_keys:
                    worksheet.Cells(target_row, target_column).Value = ""
        if keyword_data and not keyword_rows:
            warnings.append("日表未识别到投放关键词区域")
        elif keyword_data and not keyword_matches:
            warnings.append("关键词排名表与日表投放词没有匹配项")
        else:
            unmatched = keyword_source_rows - keyword_matches
            if unmatched > 0:
                warnings.append(f"关键词表有 {unmatched} 条未在日表中找到")
            if keyword_meta["emptyRows"] > 0:
                warnings.append(f"关键词表有 {keyword_meta['emptyRows']} 条排名为空")
            if keyword_unranked > 0:
                warnings.append(f"关键词表有 {keyword_unranked} 条未收录")

    workbook.Save()
    return {
        "name": name,
        "workbook": selected["workbookName"],
        "worksheet": selected["worksheetName"],
        "asin": asin,
        "targetDate": target_date,
        "matchedDays": matched_days,
        "productCells": product_cells,
        "ratingFields": rating_fields,
        "ratingFallback": rating_fallback,
        "ratingUrl": amazon_rating_url(asin) if rating_fallback and asin else "",
        "keywordMatches": keyword_matches,
        "keywordWritten": keyword_written,
        "keywordUnranked": keyword_unranked,
        "keywordSourceRows": keyword_source_rows,
        "warnings": warnings,
        "ok": True,
    }


def connect_wps():
    if not pythoncom or not win32com:
        raise RuntimeError("内置 WPS 连接组件不可用")
    pythoncom.CoInitialize()
    try:
        try:
            wps = win32com.client.GetActiveObject("Ket.Application")
        except Exception:
            # 与旧版每日数据填报工具保持兼容：部分 WPS 版本不会把当前
            # 实例发布到运行对象表，但 Dispatch 仍能连接到同一实例。
            try:
                wps = win32com.client.Dispatch("Ket.Application")
            except Exception as error:
                raise RuntimeError(
                    "无法连接 WPS 表格自动化接口；请确认已打开目标日表，"
                    "并在 WPS 中启用或安装 VBA/COM 支持"
                ) from error
        if wps.Workbooks.Count < 1:
            raise RuntimeError("WPS 当前没有打开任何工作簿")
        return wps
    except Exception:
        pythoncom.CoUninitialize()
        raise


def disconnect_wps():
    if pythoncom:
        try:
            pythoncom.CoUninitialize()
        except Exception:
            pass


def fill_command(payload_path):
    with open(payload_path, "r", encoding="utf-8") as stream:
        payload = json.load(stream)
    groups = payload.get("groups") or []
    if not groups:
        raise ValueError("没有待填写的文件组")
    wps = connect_wps()
    summaries = []
    try:
        for index, group in enumerate(groups, 1):
            try:
                summaries.append(process_group(
                    wps, group, index, len(groups), payload.get("includeRatings", True)
                ))
                log(f"第 {index} 组已写入并保存", "saved", index, len(groups))
            except Exception as error:
                asin = group_asin(group)
                summaries.append({
                    "name": str(group.get("name") or f"组{index}"),
                    "asin": asin,
                    "ok": False,
                    "error": str(error),
                    "warnings": [],
                    "ratingFallback": bool(asin),
                    "ratingUrl": amazon_rating_url(asin) if asin else "",
                })
                log(f"第 {index} 组失败：{error}", "group_failed", index, len(groups))
    finally:
        disconnect_wps()
    completed = sum(1 for item in summaries if item.get("ok"))
    result(completed > 0, message=f"已完成 {completed}/{len(groups)} 组", groups=summaries)


def inspect_command():
    wps = connect_wps()
    try:
        active_workbook = ""
        active_worksheet = ""
        try:
            active_workbook = str(wps.ActiveWorkbook.Name)
            active_worksheet = str(wps.ActiveWorkbook.ActiveSheet.Name)
        except Exception:
            pass
        workbooks = []
        for item in list_daily_worksheets(wps):
            workbook = {key: item[key] for key in ("workbookName", "worksheetName", "asin", "usRow")}
            workbook["isActive"] = (
                item["workbookName"] == active_workbook
                and item["worksheetName"] == active_worksheet
            )
            workbooks.append(workbook)
        result(bool(workbooks), message=f"识别到 {len(workbooks)} 个日表", workbooks=workbooks)
    finally:
        disconnect_wps()


def traffic_rows(ws):
    rows = {"total": None, "organic": None, "ad": None}
    for row in range(1, 100):
        label = str(ws.Cells(row, 2).Value or "").strip()
        if "总流量" in label and "白色" not in label and "黑色" not in label:
            rows["total"] = row
        if "自然流量" in label and "白色" not in label and "黑色" not in label:
            rows["organic"] = row
        if "广告流量" in label and "白色" not in label and "黑色" not in label:
            rows["ad"] = row
    return rows


def traffic_target_column(columns, now=None):
    us_date = us_reporting_date(now)
    for column, date_text in columns:
        if date_text == us_date:
            return column, date_text
    return columns[-1] if columns else (None, "")


def traffic_command(asin, total, organic, ad):
    wps = connect_wps()
    try:
        selected = choose_daily_worksheet(wps, asin)
        worksheet = selected["worksheet"]
        rows = traffic_rows(worksheet)
        column, date_text = traffic_target_column(date_columns(worksheet, selected["usRow"]))
        if not column or not any(rows.values()):
            raise ValueError("日表未识别到流量词行或日期列")
        values = {"total": int(total), "organic": int(organic), "ad": int(ad)}
        written = {}
        for key, row in rows.items():
            if row:
                worksheet.Cells(row, column).Value = values[key]
                written[key] = values[key]
        selected["workbook"].Save()
        result(True, message="流量词数据已写入并保存", asin=selected["asin"],
               workbook=selected["workbookName"], targetDate=date_text, values=written)
    finally:
        disconnect_wps()


def main():
    parser = argparse.ArgumentParser()
    subparsers = parser.add_subparsers(dest="command", required=True)
    subparsers.add_parser("check")
    subparsers.add_parser("inspect")
    fill_parser = subparsers.add_parser("fill")
    fill_parser.add_argument("--payload", required=True)
    traffic_parser = subparsers.add_parser("traffic")
    traffic_parser.add_argument("--asin", required=True)
    traffic_parser.add_argument("--total", required=True, type=int)
    traffic_parser.add_argument("--organic", required=True, type=int)
    traffic_parser.add_argument("--ad", required=True, type=int)
    args = parser.parse_args()

    if args.command == "check":
        capabilities = {
            "wps": bool(pythoncom and win32com),
            "excel": bool(openpyxl),
            "ratings": bool(webdriver),
        }
        result(capabilities["wps"] and capabilities["excel"],
               message="每日数据填报环境已就绪", capabilities=capabilities)
    elif args.command == "inspect":
        inspect_command()
    elif args.command == "fill":
        fill_command(os.path.abspath(args.payload))
    elif args.command == "traffic":
        traffic_command(args.asin, args.total, args.organic, args.ad)


if __name__ == "__main__":
    try:
        if hasattr(sys.stdout, "reconfigure"):
            sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        main()
    except Exception as error:
        result(False, message=f"处理失败：{error}")
        sys.exit(1)
