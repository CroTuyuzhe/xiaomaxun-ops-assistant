const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const rendererDir = path.join(__dirname, '..', 'src', 'renderer');
const html = fs.readFileSync(path.join(rendererDir, 'index.html'), 'utf8');
const script = fs.readFileSync(path.join(rendererDir, 'app.js'), 'utf8');
const todoViews = fs.readFileSync(path.join(rendererDir, 'todo-views.js'), 'utf8');
const styles = fs.readFileSync(path.join(rendererDir, 'styles.css'), 'utf8');

test('renderer keeps a single main view without ERP-style navigation', () => {
  assert.doesNotMatch(html, /sidebar|nav-item|data-view=/i);
  assert.doesNotMatch(html, /quick-summary|summary-total|summary-pending|summary-alerts/i);
  assert.match(html, /id="todo-list"/);
  assert.match(html, /id="product-list"/);
  assert.match(html, /id="tools-button"/);
  assert.match(html, /id="settings-button"/);
});

test('custom window controls are connected', () => {
  assert.match(html, /id="dock-button"/);
  assert.match(html, /id="pin-button"/);
  assert.match(html, /id="minimize-button"/);
  assert.match(html, /id="close-button"/);
  assert.match(script, /api\.window\.closeToTray\(\)/);
  assert.match(script, /function requestDockHide\(\)[\s\S]*api\.window\.hideDocked\(\)/);
  assert.doesNotMatch(script, /requestDockHide\(\)[\s\S]{0,180}dialog\[open\]/);
  assert.match(script, /syncDockDialogState[\s\S]*setAutoHidePaused\(false\)/);
  assert.match(script, /addEventListener\('pointerleave', requestDockHide\)/);
  assert.match(html, /id="icon-panel-top"/);
  assert.match(html, /id="icon-pin"/);
  assert.match(html, /id="icon-toolbox"/);
  assert.match(html, /id="icon-settings"/);
  assert.doesNotMatch(html, />[⌃⌄▦⚙] </);
});

test('frameless window uses only native rounded corners without an inner border', () => {
  const windowRules = [...styles.matchAll(/\.app-window\s*\{([^}]+)\}/g)];
  assert.ok(windowRules.length >= 1);
  assert.ok(windowRules.every((match) => /border-radius:\s*0\s*;/.test(match[1])));
  assert.ok(windowRules.every((match) => /border:\s*0\s*;/.test(match[1])));
});

test('weekly fixed todo lets users choose one or more weekdays', () => {
  assert.match(html, /id="weekday-field"/);
  assert.equal((html.match(/name="todo-weekday"/g) || []).length, 7);
  assert.match(script, /function syncTodoRecurrenceFields\(\)/);
  assert.match(script, /input\[name="todo-weekday"\]:checked/);
  assert.match(todoViews, /todo\.weekdays\.includes\(now\.getDay\(\)\)/);
  assert.match(styles, /\.weekday-options input:checked \+ span/);
});

test('header avatar uses the branded app icon and supports persistent customization', () => {
  assert.match(html, /id="avatar-button"/);
  assert.match(html, /id="avatar-image" src="\.\.\/assets\/app-icon\.png"/);
  assert.match(html, /id="avatar-input"[^>]+accept="image\/png,image\/jpeg,image\/webp"/);
  assert.match(script, /createAvatarDataUrl/);
  assert.match(script, /api\.settings\.update\(\{ profileAvatar \}\)/);
  assert.match(script, /data-action="reset-avatar"/);
  assert.match(styles, /\.avatar-edit-badge/);
});

test('always-on-top control is visible, stateful, and connected', () => {
  assert.match(script, /api\.window\.togglePin\(\)/);
  assert.match(script, /pinButton\.classList\.toggle\('active', dockState\.pinned\)/);
  assert.match(script, /窗口已置顶/);
  assert.match(styles, /#pin-button\.active/);
  assert.match(script, /dockState\.docked && !dockState\.pinned/);
});

test('settings expose Windows launch at login control', () => {
  assert.match(script, /data-setting="launchAtLogin"/);
  assert.match(script, /登录 Windows 后自动启动/);
});

test('dimension and weight converter is integrated as a compact toolbox sheet', () => {
  assert.match(html, /id="converter-dialog"/);
  assert.match(html, /id="length-converter-from"/);
  assert.match(html, /id="weight-converter-from"/);
  assert.match(html, /id="smart-converter-input"/);
  assert.match(html, /src="unit-converter\.js"/);
  assert.match(script, /openUnitConverter/);
  assert.match(script, /converter\.smartConvert/);
});

test('todo and product dialogs can close without required-field validation', () => {
  assert.match(html, /type="button" data-close-dialog="todo-dialog" class="button muted"/);
  assert.match(html, /type="button" data-close-dialog="product-dialog" class="button muted"/);
  assert.match(html, /type="button" data-close-dialog="todo-dialog" aria-label="关闭"/);
  assert.match(html, /type="button" data-close-dialog="product-dialog" aria-label="关闭"/);
});

test('every secondary-window close icon is centered inside its real hit target', () => {
  const closeButtons = [...html.matchAll(/<button type="button" data-close-dialog="[^"]+" aria-label="关闭">/g)];
  assert.equal(closeButtons.length, 14);
  assert.match(styles, /\.dialog-head > button\[data-close-dialog\][\s\S]*position:\s*absolute/);
  assert.match(styles, /\.dialog-head > button\[data-close-dialog\] \.icon[\s\S]*top:\s*50%[\s\S]*left:\s*50%[\s\S]*translate\(-50%, -50%\)/);
});

test('competitor image collector opens from the toolbox without adding navigation tabs', () => {
  assert.match(html, /id="competitor-dialog"/);
  assert.match(html, /id="competitor-asins"/);
  assert.match(html, /id="competitor-progress"/);
  assert.match(script, /data-action="open-\$\{escapeHtml\(tool\.id\)\}"/);
  assert.match(script, /api\.competitor\.start/);
  assert.match(script, /api\.competitor\.save/);
});

test('keyword rank automation is integrated as a configurable toolbox sheet', () => {
  assert.match(html, /id="keyword-rank-dialog"/);
  assert.match(html, /id="keyword-rank-asin"/);
  assert.match(html, /id="keyword-rank-postcode"/);
  assert.match(html, /id="keyword-rank-keywords"/);
  assert.match(html, /id="keyword-rank-exclude"/);
  assert.match(script, /api\.keywordRank\.saveConfig/);
  assert.match(script, /api\.keywordRank\.start/);
  assert.match(script, /api\.keywordRank\.onProgress/);
  assert.match(styles, /#keyword-rank-dialog/);
});

test('shipping planner is integrated as a toolbox sheet instead of a separate desktop UI', () => {
  assert.match(html, /id="shipping-dialog"/);
  assert.match(html, /id="shipping-pdf"/);
  assert.match(html, /id="shipping-file-list"/);
  assert.match(html, /id="shipping-store"/);
  assert.match(html, /id="shipping-transport"/);
  assert.match(html, /id="shipping-delivery-days"[^>]*type="number"[^>]*value="45"/);
  assert.match(html, /id="shipping-btw"/);
  assert.match(html, /id="shipping-output"/);
  assert.match(html, /id="shipping-products-dialog"/);
  assert.match(html, /id="shipping-missing-products-dialog"/);
  assert.match(html, /id="shipping-product-name"/);
  assert.match(script, /api\.shipping\.run/);
  assert.match(script, /deliveryDays:\s*Number\(shippingDeliveryDays\.value\)/);
  assert.match(script, /api\.shipping\.inspect/);
  assert.match(script, /api\.shipping\.listProducts/);
  assert.match(script, /api\.shipping\.saveProducts/);
  assert.match(script, /api\.shipping\.choosePdfs/);
  assert.match(script, /api\.shipping\.chooseFolder/);
});

test('workspace prioritizes tasks and price monitoring without a redundant banner', () => {
  assert.doesNotMatch(html, /dashboard-hero|hero-metrics|运营概览/);
  assert.match(html, /产品价格监控/);
  assert.match(html, /id="history-button"/);
  assert.match(html, /id="history-dialog"/);
  assert.match(script, /function renderHistory\(\)/);
  assert.doesNotMatch(html, /TODAY'S FOCUS/);
  assert.match(styles, /\.main-content\s*\{[\s\S]*display:\s*flex[\s\S]*flex-direction:\s*column/);
  assert.match(styles, /\.todo-section\s*\{[\s\S]*max-height:\s*235px[\s\S]*flex:\s*0 1 auto/);
  assert.match(styles, /\.product-section\s*\{[\s\S]*flex:\s*1 1 0/);
  assert.match(styles, /\.app-header\s*\{[\s\S]*linear-gradient/);
  assert.match(styles, /\.product-section \.section-title[\s\S]*background:\s*transparent/);
});

test('main view uses Amazon colors and keeps both information areas visible', () => {
  assert.match(styles, /--navy:\s*#131921/i);
  assert.match(styles, /--orange:\s*#ff9900/i);
  assert.match(styles, /grid-template-rows:\s*minmax\(190px/);
  assert.match(styles, /#todo-list,[\s\S]*#product-list[\s\S]*overflow-y:\s*auto/);
});

test('product status uses a dense ASIN-first row with one browser icon', () => {
  assert.match(html, /id="icon-external"/);
  assert.match(script, /class="product-card compact/);
  assert.match(script, /class="product-id-line"/);
  assert.match(script, /class="icon-external"/);
  assert.match(script, /const displayPrice = nonUsdPrice \? '需刷新'/);
  assert.match(script, /flag\('Prime折扣', status\.hasPrimeDiscount\)/);
  assert.doesNotMatch(script, /flag\('Prime', status\.isPrime\)/);
  assert.doesNotMatch(script, /class="product-name"/);
  assert.doesNotMatch(script, /class="product-metrics"/);
});

test('product deadline is editable and expired products surface in today todos', () => {
  assert.match(html, /id="product-deadline" type="date"/);
  assert.match(html, /id="product-deadline-dialog"/);
  assert.match(script, /product\.deadline <= localDateKey\(\)/);
  assert.match(script, /class="product-card compact\$\{deadlineDue \? ' deadline-due' : ''\}"/);
  assert.match(script, /todo\.systemType === 'product-deadline'/);
  assert.match(script, /api\.products\.setDeadline/);
  assert.match(styles, /\.product-card\.compact\.deadline-due/);
});
