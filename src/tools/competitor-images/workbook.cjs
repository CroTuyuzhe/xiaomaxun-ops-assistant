const fs = require('node:fs/promises');
const path = require('node:path');
const { loadDependency } = require('./dependencies.cjs');

function xml(value) {
  return String(value ?? '').replace(/[<>&"']/g, (char) => ({
    '<': '&lt;',
    '>': '&gt;',
    '&': '&amp;',
    '"': '&quot;',
    "'": '&apos;',
  })[char]);
}

function columnName(number) {
  let name = '';
  let current = number;
  while (current > 0) {
    const remainder = (current - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    current = Math.floor((current - 1) / 26);
  }
  return name;
}

function imageSize(buffer, ext) {
  if (ext === 'png' && buffer.length >= 24) {
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  }
  if (ext === 'gif' && buffer.length >= 10) {
    return { width: buffer.readUInt16LE(6), height: buffer.readUInt16LE(8) };
  }
  if (ext === 'jpeg') {
    let offset = 2;
    while (offset + 9 < buffer.length) {
      if (buffer[offset] !== 0xff) {
        offset += 1;
        continue;
      }
      const marker = buffer[offset + 1];
      const length = buffer.readUInt16BE(offset + 2);
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
        return { height: buffer.readUInt16BE(offset + 5), width: buffer.readUInt16BE(offset + 7) };
      }
      if (!length || length < 2) break;
      offset += 2 + length;
    }
  }
  return { width: 800, height: 800 };
}

function fitImage(image, maxWidth, maxHeight) {
  const size = imageSize(image.buffer, image.ext);
  const scale = Math.min(maxWidth / Math.max(size.width, 1), maxHeight / Math.max(size.height, 1), 1);
  return {
    width: Math.max(1, Math.round(size.width * scale)),
    height: Math.max(1, Math.round(size.height * scale)),
  };
}

function inlineCell(ref, value, style) {
  const safe = String(value ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
  return `<c r="${ref}" t="inlineStr" s="${style}"><is><t xml:space="preserve">${xml(safe)}</t></is></c>`;
}

function createWorkbookLayout(results) {
  const maxGallery = Math.max(1, ...results.map((item) => item.galleryImages?.length || 0));
  const maxAplus = Math.max(1, ...results.map((item) => item.aplusImages?.length || 0));
  const galleryHeaderRow = 3;
  const galleryStartRow = 4;
  const aplusHeaderRow = galleryStartRow + maxGallery;
  const aplusStartRow = aplusHeaderRow + 1;
  const lastRow = aplusHeaderRow + maxAplus;
  return {
    maxGallery,
    maxAplus,
    galleryHeaderRow,
    galleryStartRow,
    aplusHeaderRow,
    aplusStartRow,
    lastRow,
  };
}

function stylesXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="3">
    <font><sz val="11"/><name val="Microsoft YaHei"/><family val="2"/></font>
    <font><b/><color rgb="FFFFFFFF"/><sz val="12"/><name val="Microsoft YaHei"/><family val="2"/></font>
    <font><b/><color rgb="FF16324F"/><sz val="11"/><name val="Microsoft YaHei"/><family val="2"/></font>
  </fonts>
  <fills count="5">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF16324F"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFF4F7FA"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFE3F4EE"/><bgColor indexed="64"/></patternFill></fill>
  </fills>
  <borders count="2">
    <border><left/><right/><top/><bottom/><diagonal/></border>
    <border><left style="thin"><color rgb="FFD5DEE8"/></left><right style="thin"><color rgb="FFD5DEE8"/></right><top style="thin"><color rgb="FFD5DEE8"/></top><bottom style="thin"><color rgb="FFD5DEE8"/></bottom><diagonal/></border>
  </borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="6">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="0" fillId="3" borderId="1" xfId="0" applyAlignment="1"><alignment horizontal="left" vertical="top" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
    <xf numFmtId="0" fontId="2" fillId="4" borderId="1" xfId="0" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
    <xf numFmtId="0" fontId="0" fillId="3" borderId="1" xfId="0" applyAlignment="1"><alignment horizontal="left" vertical="center" wrapText="1"/></xf>
  </cellXfs>
  <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;
}

async function buildWorkbook(results, outputPath) {
  if (!Array.isArray(results) || !results.length) throw new Error('没有可导出的采集结果');
  const JSZip = loadDependency('jszip');
  const zip = new JSZip();
  const layout = createWorkbookLayout(results);
  const rows = [];
  const drawings = [];
  const drawingRels = [];
  const contentDefaults = new Set();
  let mediaIndex = 0;

  for (let row = 1; row <= layout.lastRow; row += 1) {
    const cells = [];
    for (let col = 1; col <= results.length; col += 1) {
      const result = results[col - 1];
      const ref = `${columnName(col)}${row}`;
      if (row === 1) cells.push(inlineCell(ref, result.asin, 1));
      else if (row === 2) cells.push(inlineCell(ref, result.error ? `采集失败：${result.error}` : result.title, result.error ? 5 : 2));
      else if (row === layout.galleryHeaderRow) cells.push(inlineCell(ref, `商品图（${result.galleryImages?.length || 0} 张）`, 4));
      else if (row === layout.aplusHeaderRow) cells.push(inlineCell(ref, `A+ 图片（${result.aplusImages?.length || 0} 张）`, 4));
      else {
        let message = '';
        if (row === layout.galleryStartRow && !result.galleryImages?.length) message = '无商品图';
        if (row === layout.aplusStartRow && !result.aplusImages?.length) message = '无 A+ 图片';
        cells.push(inlineCell(ref, message, 3));
      }
    }
    const height = row === 1
      ? 28
      : row === 2
        ? 74
        : [layout.galleryHeaderRow, layout.aplusHeaderRow].includes(row)
          ? 26
          : row >= layout.galleryStartRow && row < layout.aplusHeaderRow
            ? 190
            : 165;
    rows.push(`<row r="${row}" ht="${height}" customHeight="1">${cells.join('')}</row>`);
  }

  function addImage(image, colIndex, rowIndex, maxWidth, maxHeight) {
    if (!image) return;
    mediaIndex += 1;
    const extension = image.ext === 'jpeg' ? 'jpeg' : image.ext;
    contentDefaults.add(extension);
    const mediaName = `image${mediaIndex}.${extension}`;
    zip.file(`xl/media/${mediaName}`, image.buffer);
    drawingRels.push(`<Relationship Id="rId${mediaIndex}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/${mediaName}"/>`);
    const fitted = fitImage(image, maxWidth, maxHeight);
    const colOffset = Math.round((maxWidth - fitted.width) / 2);
    const rowOffset = Math.round((maxHeight - fitted.height) / 2);
    const emu = 9525;
    drawings.push(`<xdr:oneCellAnchor>
      <xdr:from><xdr:col>${colIndex}</xdr:col><xdr:colOff>${colOffset * emu}</xdr:colOff><xdr:row>${rowIndex}</xdr:row><xdr:rowOff>${rowOffset * emu}</xdr:rowOff></xdr:from>
      <xdr:ext cx="${fitted.width * emu}" cy="${fitted.height * emu}"/>
      <xdr:pic><xdr:nvPicPr><xdr:cNvPr id="${mediaIndex}" name="Amazon image ${mediaIndex}"/><xdr:cNvPicPr/></xdr:nvPicPr><xdr:blipFill><a:blip r:embed="rId${mediaIndex}"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill><xdr:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${fitted.width * emu}" cy="${fitted.height * emu}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr></xdr:pic>
      <xdr:clientData/>
    </xdr:oneCellAnchor>`);
  }

  results.forEach((result, col) => {
    (result.galleryImages || []).forEach((image, index) => {
      addImage(image, col, layout.galleryStartRow - 1 + index, 265, 180);
    });
    (result.aplusImages || []).forEach((image, index) => {
      addImage(image, col, layout.aplusStartRow - 1 + index, 265, 155);
    });
  });

  const cols = results.map((_, index) => `<col min="${index + 1}" max="${index + 1}" width="38" customWidth="1"/>`).join('');
  const dimension = `A1:${columnName(Math.max(1, results.length))}${layout.lastRow}`;
  zip.file('xl/worksheets/sheet1.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <dimension ref="${dimension}"/><sheetViews><sheetView showGridLines="0" workbookViewId="0"><pane ySplit="2" topLeftCell="A3" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="15"/>
  <cols>${cols}</cols><sheetData>${rows.join('')}</sheetData><drawing r:id="rId1"/>
</worksheet>`);
  zip.file('xl/worksheets/_rels/sheet1.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing1.xml"/></Relationships>`);
  zip.file('xl/drawings/drawing1.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">${drawings.join('')}</xdr:wsDr>`);
  zip.file('xl/drawings/_rels/drawing1.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${drawingRels.join('')}</Relationships>`);
  zip.file('xl/styles.xml', stylesXml());
  zip.file('xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView/></bookViews><sheets><sheet name="竞品图片汇总" sheetId="1" r:id="rId1"/></sheets><calcPr calcId="191029"/></workbook>`);
  zip.file('xl/_rels/workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`);
  zip.file('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`);
  zip.file('docProps/core.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>Amazon 竞品图片汇总</dc:title><dc:creator>小呆</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${new Date().toISOString()}</dcterms:created></cp:coreProperties>`);
  zip.file('docProps/app.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>小马逊运营助手</Application></Properties>`);

  const defaults = [
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>',
    '<Default Extension="xml" ContentType="application/xml"/>',
    ...[...contentDefaults].sort().map((ext) => `<Default Extension="${ext}" ContentType="image/${ext === 'jpeg' ? 'jpeg' : ext}"/>`),
  ];
  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">${defaults.join('')}<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`);

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  const buffer = await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });
  await fs.writeFile(outputPath, buffer);
  return outputPath;
}

module.exports = { buildWorkbook, columnName, createWorkbookLayout, imageSize };
