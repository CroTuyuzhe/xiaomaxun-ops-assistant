# -*- coding: utf-8 -*-
"""PDF 文本处理模块：将每页 'FBA: <公司名> Ltd.' 精确替换为 'FBA:'。

实现方式：直接修改页面内容流中的文本字符串（PDF 字面量 (...) 或十六进制 <...>），
只替换目标文本，不重写页面其他内容 —— 因此：
- 不会像 bbox 红色删除那样误删上下行（真实箱唛各行 bbox 互相重叠）；
- 不会重排/加粗其他文字（条码等完全保持原样）；
- FBA: 使用原字体、原字号（同一文本矩阵）渲染，与原位置一致。
"""
import os
import re
import sys

if __package__ in (None, ""):
    sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import fitz  # PyMuPDF

# 内容流中的目标文本模式：FBA: <公司名> Ltd.（公司名可含空格/逗号/点号/连字符）
_FBA_TEXT_RE = re.compile(r"FBA:[^()\\]*?Ltd\.", re.IGNORECASE)

# PDF 字面量字符串： (FBA: ... Ltd.)
_FBA_LITERAL_RE = re.compile(r"\(FBA:[^()\\]*?Ltd\.\)", re.IGNORECASE)

# PDF 十六进制字符串： <...>（如 fitz 生成的 [<4642413a...>]TJ）
_HEX_STR_RE = re.compile(r"<[0-9A-Fa-f\s]+>")

_FBA_HEX = bytes("FBA:", "latin-1").hex().upper()


def _make_hex_replacer(counter):
    """返回 hex 字符串替换回调：内容解码后若匹配 FBA: ... Ltd. 则替换为 FBA: 的 hex"""
    def _replace_hex(m):
        h = m.group(0)
        inner = "".join(h[1:-1].split())
        if len(inner) % 2 != 0:
            return h
        try:
            decoded = bytes.fromhex(inner).decode("latin-1")
        except Exception:
            return h
        if _FBA_TEXT_RE.fullmatch(decoded):
            counter["n"] += 1
            return "<" + _FBA_HEX + ">"
        return h
    return _replace_hex


def process_pdf_fba_text(src_pdf: str, dst_pdf: str) -> dict:
    """打开 src_pdf，逐页把内容流中的 'FBA: <公司名> Ltd.' 替换为 'FBA:'，保存到 dst_pdf。
    返回 {"replaced_pages": int, "total_replacements": int}
    """
    result = {"replaced_pages": 0, "total_replacements": 0}
    doc = fitz.open(src_pdf)
    try:
        for page in doc:
            page_replaced = False
            for xref in page.get_contents():
                data = doc.xref_stream(xref)
                if not data:
                    continue
                dec = data.decode("latin-1", errors="replace")
                # 1) 字面量字符串： (FBA: ... Ltd.)Tj
                new_dec, n1 = _FBA_LITERAL_RE.subn("(FBA:)", dec)
                # 2) 十六进制字符串： <FBA...Ltd.的hex>
                counter = {"n": 0}
                new_dec = _HEX_STR_RE.sub(_make_hex_replacer(counter), new_dec)
                n2 = counter["n"]
                n = n1 + n2
                if n:
                    doc.update_stream(xref, new_dec.encode("latin-1"))
                    result["total_replacements"] += n
                    page_replaced = True
            if page_replaced:
                result["replaced_pages"] += 1
        doc.save(dst_pdf)
    finally:
        doc.close()
    return result


