# -*- coding: utf-8 -*-
"""全局配置：路径常量、店铺列表、运输方式、字段规则、用户设置持久化"""
import json
import os
import sys

APP_VERSION = "1.3.1"  # 版本号（界面标题显示用）

# 软件根目录（源码运行=项目目录；exe运行=exe所在目录）
def app_root() -> str:
    if getattr(sys, "frozen", False):  # PyInstaller 打包
        return os.path.dirname(sys.executable)
    return os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# BTW 库目录（默认；可在界面手动修改并保存）
BTW_LIBRARY_DIR = ""  # BTW 库默认目录（其他电脑用户自行选择；本机已保存在 settings.json）

# Excel 原始模板
TEMPLATE_XLSX = os.environ.get("XIAOMAXUN_SHIPPING_TEMPLATE", "")

# 店铺三选一
STORES = ["StoreA", "StoreB", "StoreC"]

# 运输方式只负责显示与文件夹命名；运输时效由用户独立填写。
TRANSPORT_OPTIONS = ["普船", "快船", "空运"]

# 锁仓默认值
DEFAULT_LOCKED = True  # True=锁仓(AGL锁仓/AGL+运输方式)，False=非锁仓

# 输出命名
OUTPUT_XLSX_NAME = "工厂发货计划.xlsx"
PRODUCT_LABELS_SUBDIR = "产品标"   # BTW 复制到的子文件夹
OUTPUT_FOLDER_SUFFIX = "工厂发货计划"  # 输出文件夹核心名

# 产品库 JSON / 设置 JSON。统一桌面端会把目录指向 Electron userData，
# 避免向 asar 解包资源或安装目录写入用户数据。
DATA_DIR = os.environ.get("XIAOMAXUN_SHIPPING_DATA_DIR") or os.path.join(app_root(), "data")
PRODUCTS_JSON = os.path.join(DATA_DIR, "products.json")
SETTINGS_JSON = os.path.join(DATA_DIR, "settings.json")

# 国家中文 -> 缩写（FBA仓库字段用）
COUNTRY_MAP = {
    "美国": "US",
    "加拿大": "CA",
    "英国": "GB",
    "德国": "DE",
    "法国": "FR",
    "意大利": "IT",
    "西班牙": "ES",
    "日本": "JP",
    "澳大利亚": "AU",
    "墨西哥": "MX",
    "荷兰": "NL",
    "波兰": "PL",
    "瑞典": "SE",
    "比利时": "BE",
    "新加坡": "SG",
    "沙特阿拉伯": "SA",
    "阿联酋": "AE",
    "巴西": "BR",
    "中国": "CN",
}
DEFAULT_COUNTRY = "US"

# ---------- 用户设置 ----------
_DEFAULT_SETTINGS = {
    "btw_dir": BTW_LIBRARY_DIR,
    "output_base": "",
    "last_transport": "普船",
    "last_person": "",
    "last_locked": True,
}


def load_settings() -> dict:
    s = dict(_DEFAULT_SETTINGS)
    try:
        if os.path.exists(SETTINGS_JSON):
            with open(SETTINGS_JSON, "r", encoding="utf-8") as f:
                saved = json.load(f)
                if isinstance(saved, dict):
                    s.update({k: v for k, v in saved.items() if k in _DEFAULT_SETTINGS})
    except Exception:
        pass
    return s


def save_settings(settings: dict):
    try:
        os.makedirs(DATA_DIR, exist_ok=True)
        with open(SETTINGS_JSON, "w", encoding="utf-8") as f:
            json.dump(settings, f, ensure_ascii=False, indent=2)
    except Exception:
        pass


# ---------- 打包兼容：onefile 模式下内置资源解析 ----------
def _bundle_root() -> str:
    # PyInstaller 解压临时目录（onefile 内置资源实际位置）；源码运行=项目根
    if getattr(sys, 'frozen', False):
        return getattr(sys, '_MEIPASS', os.path.dirname(sys.executable))
    return os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def resolve_template() -> str:
    # Excel 模板：优先外部模板（原E盘路径），否则依次查找内置/程序目录/项目目录模板
    if os.path.exists(TEMPLATE_XLSX):
        return TEMPLATE_XLSX
    for p in (
        os.environ.get("XIAOMAXUN_SHIPPING_TEMPLATE", ""),
        os.path.join(_bundle_root(), '工厂发货计划.xlsx'),
        os.path.join(app_root(), '工厂发货计划.xlsx'),
        os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), '工厂发货计划.xlsx'),
    ):
        if os.path.exists(p):
            return p
    return os.path.join(_bundle_root(), '工厂发货计划.xlsx')
