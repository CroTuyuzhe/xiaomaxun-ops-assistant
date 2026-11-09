const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const manifest = require(path.join(root, 'src', 'main', 'tool-manifest.cjs'));
const { cloneDefaultState } = require(path.join(root, 'src', 'main', 'local-store.cjs'));
const { parseCounts } = require(path.join(root, 'src', 'tools', 'daily-report', 'xydc.cjs'));
const {
  extractAsin,
  resolveDailyTrafficTarget,
} = require(path.join(root, 'src', 'tools', 'daily-report', 'target.cjs'));
const worker = fs.readFileSync(path.join(root, 'src', 'tools', 'daily-report', 'python', 'worker.py'), 'utf8');
const runner = fs.readFileSync(path.join(root, 'src', 'tools', 'daily-report', 'runner.cjs'), 'utf8');
const html = fs.readFileSync(path.join(root, 'src', 'renderer', 'index.html'), 'utf8');
const renderer = fs.readFileSync(path.join(root, 'src', 'renderer', 'app.js'), 'utf8');
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

test('daily report is a ready toolbox module with an integrated Electron interface', () => {
  const tool = manifest.TOOLS.find((item) => item.id === 'daily-report');
  assert.equal(tool.status, 'ready');
  assert.match(html, /id="daily-dialog"/);
  assert.match(html, /id="daily-group-form"/);
  assert.match(html, /id="daily-traffic-start"/);
  assert.match(renderer, /openDailyReport/);
  assert.match(renderer, /api\.daily\.run/);
  assert.match(renderer, /api\.daily\.traffic/);
  assert.match(renderer, /open-daily-rating/);
  assert.match(renderer, /api\.daily\.openRating/);
});

test('daily report persists file groups and rating preference locally', () => {
  const state = cloneDefaultState();
  assert.deepEqual(state.settings.dailyReport, { groups: [], includeRatings: true });
  assert.match(renderer, /api\.daily\.saveConfig/);
});

test('daily report worker is headless and targets an already-open WPS workbook', () => {
  assert.doesNotMatch(worker, /tkinter|Tk\(/);
  assert.match(worker, /GetActiveObject\("Ket\.Application"\)/);
  assert.match(worker, /Dispatch\("Ket\.Application"\)/);
  assert.match(worker, /workbook\.Save\(\)/);
  assert.match(worker, /read_product_data/);
  assert.match(worker, /read_keyword_data/);
  assert.match(worker, /locate_keyword_report/);
  assert.match(worker, /自然排名页码页内排名/);
  assert.match(worker, /compact_match/);
  assert.match(worker, /def us_reporting_date\(now=None\)/);
  assert.match(worker, /POSITION_HEADER_ALIASES/);
  assert.match(worker, /keywordWritten/);
  assert.doesNotMatch(worker, /sheet\.cell\(row=row, column=6\)/);
  assert.match(worker, /scrape_ratings/);
  assert.match(worker, /page_load_strategy = "none"/);
  assert.match(worker, /rating_percentages_from_html/);
  assert.match(worker, /aria-label\*="percent"/);
  assert.match(worker, /ratingFallback/);
  assert.match(worker, /workbook\["isActive"\]/);
  assert.match(runner, /windowsHide: true/);
  assert.ok(packageJson.build.asarUnpack.includes('src/tools/daily-report/python/**'));
  assert.ok(packageJson.build.asarUnpack.includes('src/tools/daily-report/bin/**'));
  assert.match(renderer, /group\.keywordWritten \?\? group\.keywordMatches/);
});

test('xydc traffic counts are normalized from localized values', () => {
  assert.deepEqual(parseCounts(['共 1,245', '自然 986', '广告 259']), {
    total: 1245,
    organic: 986,
    ad: 259,
  });
  assert.equal(parseCounts(['-', '1']), null);
});

test('traffic target automatically resolves from groups and the active WPS sheet', () => {
  assert.equal(extractAsin('Amazon-B0FW4F6VTF-日表.xlsx'), 'B0FW4F6VTF');
  assert.deepEqual(resolveDailyTrafficTarget({
    asin: '',
    groups: [{ source: 'D:\\reports\\B0FW4F6VTF.xlsx' }],
  }, {
    workbooks: [
      { asin: 'B0AAAAAAAA', isActive: false },
      { asin: 'B0BBBBBBBB', isActive: true },
    ],
  }), { asin: 'B0FW4F6VTF', source: 'group' });

  assert.deepEqual(resolveDailyTrafficTarget({ groups: [] }, {
    workbooks: [
      { asin: 'B0AAAAAAAA', isActive: false },
      { asin: 'B0BBBBBBBB', isActive: true },
    ],
  }), { asin: 'B0BBBBBBBB', source: 'active-workbook' });
});

test('traffic target asks only when multiple WPS sheets remain ambiguous', () => {
  assert.deepEqual(resolveDailyTrafficTarget({}, {
    workbooks: [
      { asin: 'B0AAAAAAAA', isActive: false },
      { asin: 'B0AAAAAAAA', isActive: false },
    ],
  }), { asin: 'B0AAAAAAAA', source: 'only-asin' });
  assert.throws(() => resolveDailyTrafficTarget({}, {
    workbooks: [
      { asin: 'B0AAAAAAAA', isActive: false },
      { asin: 'B0BBBBBBBB', isActive: false },
    ],
  }), /切换到目标日表/);
});

test('daily failure includes group root cause', () => {
  const { formatWorkerError } = require('../src/tools/daily-report/runner.cjs');
  assert.equal(formatWorkerError({message: '已完成 0/1 组', groups: [
    {name: '组1', ok: false, error: "No module named 'win32timezone'"},
  ]}), "已完成 0/1 组\n组1：No module named 'win32timezone'");
  assert.equal(formatWorkerError({message: '无法连接 WPS'}), '无法连接 WPS');
});
