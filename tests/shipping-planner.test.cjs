const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const runner = fs.readFileSync(path.join(root, 'src', 'tools', 'shipping-planner', 'runner.cjs'), 'utf8');
const main = fs.readFileSync(path.join(root, 'src', 'main', 'index.cjs'), 'utf8');
const worker = fs.readFileSync(path.join(root, 'src', 'tools', 'shipping-planner', 'python', 'worker.py'), 'utf8');
const pipeline = fs.readFileSync(path.join(root, 'src', 'tools', 'shipping-planner', 'python', 'app', 'pipeline.py'), 'utf8');
const pdfParser = fs.readFileSync(path.join(root, 'src', 'tools', 'shipping-planner', 'python', 'app', 'pdf_parser.py'), 'utf8');
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

test('shipping planner reuses only the headless business layer and packaged template', () => {
  assert.match(worker, /from app\.pipeline import merge_batch_skus, run_batch_pipeline, run_pipeline/);
  assert.match(worker, /parser\.add_argument\("--pdf", action="append"/);
  assert.match(worker, /--inspect-only/);
  assert.match(worker, /--products-json/);
  assert.match(worker, /--delivery-days/);
  assert.doesNotMatch(worker, /PySide6|tkinter/);
  assert.match(runner, /windowsHide: true/);
  assert.match(runner, /app\.asar\.unpacked/);
  assert.ok(packageJson.build.asarUnpack.includes('src/tools/shipping-planner/python/**'));
  assert.ok(packageJson.build.asarUnpack.includes('src/tools/shipping-planner/bin/**'));
  assert.equal(packageJson.build.win.target[0], 'nsis');
  assert.equal(packageJson.build.nsis.oneClick, false);
  assert.equal(packageJson.build.nsis.allowToChangeInstallationDirectory, true);
  assert.match(packageJson.build.win.artifactName, /安装版/);
  assert.match(runner, /内置货件处理组件缺失，请重新安装小马逊运营助手/);
});

test('shipping planner checks its three required Python libraries before processing', () => {
  assert.match(runner, /import pdfplumber, fitz, openpyxl/);
  assert.match(runner, /XIAOMAXUN_SHIPPING_DATA_DIR/);
  assert.match(runner, /XIAOMAXUN_SHIPPING_TEMPLATE/);
  assert.match(runner, /outputEncoding: 'gbk'/);
  assert.match(runner, /inspectShippingPdfs/);
  assert.match(runner, /'--delivery-days'/);
  assert.match(pipeline, /resolve_product/);
  assert.match(pipeline, /not product\.get\("fnsku"\) or not product\.get\("name"\)/);
});

test('shipping planner accepts Amazon dot and hyphen SKU prefixes and uses standalone delivery days', () => {
  assert.match(pdfParser, /\[\.\-\]/);
  assert.match(pdfParser, /US\\d\*\[\.\-\]/);
  assert.match(pdfParser, /US1\.DEMO-SKU-16/);
  assert.match(pdfParser, /def normalize_sku\(value: str\)/);
  assert.match(pipeline, /normalized_sku = normalize_sku\(summary\.sku\)/);
  assert.match(pipeline, /def compute_fba_delivery_range\(date_str: str, delivery_days: int = 45\)/);
  assert.doesNotMatch(pipeline, /def transport_days\(/);
  assert.match(pipeline, /compute_fba_delivery_range\(folder_date, delivery_days\)/);
  assert.match(main, /Number\.isSafeInteger\(deliveryDays\)/);
  assert.match(main, /deliveryDays:\s*normalized\.deliveryDays/);
});

test('shipping planner batches PDFs and merges only matching warehouse and SKU rows', () => {
  assert.match(runner, /pdfPaths\.flatMap\(\(pdfPath\) => \['--pdf', pdfPath\]\)/);
  assert.match(worker, /action="append"/);
  assert.match(pipeline, /key = \(warehouse_key, normalized_sku\.upper\(\)\)/);
  assert.match(pipeline, /row\.box_count \+= summary\.box_count/);
  assert.match(pipeline, /row\.total_qty \+= summary\.total_qty/);
  assert.match(pipeline, /report\.output_pdfs\.append\(dst_pdf\)/);
  assert.match(pipeline, /compact_serial_ranges\(self\.serial_ranges\)/);
  assert.match(pipeline, /start_number <= merged\[-1\]\[1\] \+ 1/);
});

test('shipping planner recognizes US ZIP+4 warehouse addresses', () => {
  assert.match(pdfParser, /\\d\{5\}\(\?:-\\d\{4\}\)\?/);
  assert.match(pdfParser, /self\.dest_city}, \{self\.dest_state} \{self\.dest_zip}/);
});

test('Windows launch at login uses Electron login item settings', () => {
  assert.match(main, /app\.setLoginItemSettings/);
  assert.match(main, /app\.getLoginItemSettings/);
  assert.match(main, /launchAtLogin/);
  assert.match(main, /process\.env\.PORTABLE_EXECUTABLE_FILE \|\| process\.execPath/);
});
