const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const JSZip = require('jszip');

const { MAX_ASINS, parseAsins, validateAsins } = require('../src/tools/competitor-images/asins.cjs');
const { canonicalUrl, challengeDetected, detectImage } = require('../src/tools/competitor-images/scraper.cjs');
const { buildWorkbook, columnName, createWorkbookLayout, imageSize } = require('../src/tools/competitor-images/workbook.cjs');

test('competitor ASIN input is normalized, deduplicated, and validated', () => {
  assert.deepEqual(parseAsins('b0fbfr5wlx, B0F1BX6N4M\nB0FBFR5WLX'), {
    valid: ['B0FBFR5WLX', 'B0F1BX6N4M'],
    invalid: [],
  });
  assert.deepEqual(validateAsins('B0FBFR5WLX；B0F1BX6N4M'), ['B0FBFR5WLX', 'B0F1BX6N4M']);
  assert.throws(() => validateAsins('not-an-asin'), /不是 10 位 ASIN/);
  assert.throws(() => validateAsins(Array.from({ length: MAX_ASINS + 1 }, (_, index) => `B${String(index).padStart(9, '0')}`).join(' ')), /最多采集 25 个/);
});

test('Amazon image URLs are canonicalized and challenge pages are detected', () => {
  assert.equal(
    canonicalUrl('https://m.media-amazon.com/images/I/demo._AC_SL1500_.jpg?x=1#image'),
    'https://m.media-amazon.com/images/I/demo.jpg',
  );
  assert.equal(challengeDetected({ pageTitle: 'Robot Check', bodyText: '' }), true);
  assert.equal(challengeDetected({ pageTitle: 'Amazon.com', bodyText: 'Product details' }), false);
});

test('supported image formats and dimensions are recognized', () => {
  const png = Buffer.alloc(24);
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(png);
  png.writeUInt32BE(1200, 16);
  png.writeUInt32BE(800, 20);
  assert.deepEqual(detectImage(png), { ext: 'png', mime: 'image/png' });
  assert.deepEqual(imageSize(png, 'png'), { width: 1200, height: 800 });
});

test('workbook layout keeps every product in a column and all image rows', () => {
  assert.equal(columnName(1), 'A');
  assert.equal(columnName(26), 'Z');
  assert.equal(columnName(27), 'AA');
  const layout = createWorkbookLayout([
    { galleryImages: [1, 2, 3], aplusImages: [1, 2] },
    { galleryImages: [1], aplusImages: [1, 2, 3, 4] },
  ]);
  assert.deepEqual(layout, {
    maxGallery: 3,
    maxAplus: 4,
    galleryHeaderRow: 3,
    galleryStartRow: 4,
    aplusHeaderRow: 7,
    aplusStartRow: 8,
    lastRow: 11,
  });
});

test('workbook export produces a valid XLSX package with gallery and A+ images', async () => {
  const output = path.join(os.tmpdir(), `xiaomaxun-competitor-${crypto.randomUUID()}.xlsx`);
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
  try {
    await buildWorkbook([
      { asin: 'B0FBFR5WLX', title: 'Product A', galleryImages: [{ ext: 'png', buffer: png }], aplusImages: [{ ext: 'png', buffer: png }] },
      { asin: 'B0F1BX6N4M', title: '', error: '测试错误', galleryImages: [], aplusImages: [] },
    ], output);
    const zip = await JSZip.loadAsync(await fs.readFile(output));
    assert.ok(zip.file('xl/workbook.xml'));
    assert.ok(zip.file('xl/worksheets/sheet1.xml'));
    assert.ok(zip.file('xl/media/image1.png'));
    assert.ok(zip.file('xl/media/image2.png'));
    const sheet = await zip.file('xl/worksheets/sheet1.xml').async('string');
    assert.match(sheet, /B0FBFR5WLX/);
    assert.match(sheet, /B0F1BX6N4M/);
    assert.match(sheet, /A\+ 图片（1 张）/);
  } finally {
    await fs.rm(output, { force: true });
  }
});
