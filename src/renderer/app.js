const api = window.xiaomaxun;
const converter = window.unitConverter;
const todoViews = window.todoViews;

const todoList = document.querySelector('#todo-list');
const productList = document.querySelector('#product-list');
const todoDialog = document.querySelector('#todo-dialog');
const productDialog = document.querySelector('#product-dialog');
const toolsDialog = document.querySelector('#tools-dialog');
const settingsDialog = document.querySelector('#settings-dialog');
const historyDialog = document.querySelector('#history-dialog');
const historyList = document.querySelector('#history-list');
const toolsList = document.querySelector('#tools-list');
const settingsList = document.querySelector('#settings-list');
const avatarButton = document.querySelector('#avatar-button');
const avatarImage = document.querySelector('#avatar-image');
const avatarInput = document.querySelector('#avatar-input');
const toastElement = document.querySelector('#toast');
const competitorDialog = document.querySelector('#competitor-dialog');
const competitorAsins = document.querySelector('#competitor-asins');
const competitorCount = document.querySelector('#competitor-count');
const competitorShowBrowser = document.querySelector('#competitor-show-browser');
const competitorStart = document.querySelector('#competitor-start');
const competitorStatus = document.querySelector('#competitor-status');
const competitorProgress = document.querySelector('#competitor-progress');
const competitorProgressCount = document.querySelector('#competitor-progress-count');
const competitorDetail = document.querySelector('#competitor-detail');
const competitorResults = document.querySelector('#competitor-results');
const competitorSave = document.querySelector('#competitor-save');
const keywordRankDialog = document.querySelector('#keyword-rank-dialog');
const keywordRankForm = document.querySelector('#keyword-rank-form');
const keywordRankAsin = document.querySelector('#keyword-rank-asin');
const keywordRankPostcode = document.querySelector('#keyword-rank-postcode');
const keywordRankKeywords = document.querySelector('#keyword-rank-keywords');
const keywordRankKeywordCount = document.querySelector('#keyword-rank-keyword-count');
const keywordRankExclude = document.querySelector('#keyword-rank-exclude');
const keywordRankCancelEdit = document.querySelector('#keyword-rank-cancel-edit');
const keywordRankAdd = document.querySelector('#keyword-rank-add');
const keywordRankJobCount = document.querySelector('#keyword-rank-job-count');
const keywordRankJobList = document.querySelector('#keyword-rank-job-list');
const keywordRankOutput = document.querySelector('#keyword-rank-output');
const keywordRankEnvironment = document.querySelector('#keyword-rank-environment');
const keywordRankStart = document.querySelector('#keyword-rank-start');
const keywordRankStatus = document.querySelector('#keyword-rank-status');
const keywordRankProgress = document.querySelector('#keyword-rank-progress');
const keywordRankProgressCount = document.querySelector('#keyword-rank-progress-count');
const keywordRankDetail = document.querySelector('#keyword-rank-detail');
const keywordRankResults = document.querySelector('#keyword-rank-results');
const keywordRankOpenOutput = document.querySelector('#keyword-rank-open-output');
const shippingDialog = document.querySelector('#shipping-dialog');
const shippingForm = document.querySelector('#shipping-form');
const shippingPdf = document.querySelector('#shipping-pdf');
const shippingFileList = document.querySelector('#shipping-file-list');
const shippingStore = document.querySelector('#shipping-store');
const shippingDate = document.querySelector('#shipping-date');
const shippingTransport = document.querySelector('#shipping-transport');
const shippingDeliveryDays = document.querySelector('#shipping-delivery-days');
const shippingPerson = document.querySelector('#shipping-person');
const shippingLocked = document.querySelector('#shipping-locked');
const shippingBtw = document.querySelector('#shipping-btw');
const shippingOutput = document.querySelector('#shipping-output');
const shippingEnvironment = document.querySelector('#shipping-environment');
const shippingStart = document.querySelector('#shipping-start');
const shippingResult = document.querySelector('#shipping-result');
const shippingProductsDialog = document.querySelector('#shipping-products-dialog');
const shippingProductSearch = document.querySelector('#shipping-product-search');
const shippingProductCount = document.querySelector('#shipping-product-count');
const shippingProductList = document.querySelector('#shipping-product-list');
const shippingProductEditorDialog = document.querySelector('#shipping-product-editor-dialog');
const shippingProductEditorForm = document.querySelector('#shipping-product-editor-form');
const shippingProductEditorTitle = document.querySelector('#shipping-product-editor-title');
const shippingProductSku = document.querySelector('#shipping-product-sku');
const shippingProductFnsku = document.querySelector('#shipping-product-fnsku');
const shippingProductName = document.querySelector('#shipping-product-name');
const shippingMissingProductsDialog = document.querySelector('#shipping-missing-products-dialog');
const shippingMissingProductsList = document.querySelector('#shipping-missing-products-list');
const shippingSaveMissingProducts = document.querySelector('#shipping-save-missing-products');
const dailyDialog = document.querySelector('#daily-dialog');
const dailyGroupForm = document.querySelector('#daily-group-form');
const dailyGroupName = document.querySelector('#daily-group-name');
const dailyGroupAsin = document.querySelector('#daily-group-asin');
const dailyProductFile = document.querySelector('#daily-product-file');
const dailyKeywordFile = document.querySelector('#daily-keyword-file');
const dailyGroupList = document.querySelector('#daily-group-list');
const dailyGroupCount = document.querySelector('#daily-group-count');
const dailyIncludeRatings = document.querySelector('#daily-include-ratings');
const dailyTrafficAsin = document.querySelector('#daily-traffic-asin');
const dailyTrafficStart = document.querySelector('#daily-traffic-start');
const dailyEnvironment = document.querySelector('#daily-environment');
const dailyStart = document.querySelector('#daily-start');
const dailyRunPanel = document.querySelector('#daily-run-panel');
const dailyStatus = document.querySelector('#daily-status');
const dailyProgressCount = document.querySelector('#daily-progress-count');
const dailyResultList = document.querySelector('#daily-result-list');
const dailyLog = document.querySelector('#daily-log');
const converterDialog = document.querySelector('#converter-dialog');
const smartConverterInput = document.querySelector('#smart-converter-input');
const smartConverterSource = document.querySelector('#smart-converter-source');
const smartConverterTarget = document.querySelector('#smart-converter-target');
const smartConverterResult = document.querySelector('#smart-converter-result');
const smartConverterMeta = document.querySelector('#smart-converter-meta');

let appState = { settings: {}, todos: [], products: [] };
let tools = [];
let dockState = { docked: false, revealed: false, pinned: false };
let refreshProgress = null;
let competitorJob = null;
let keywordRankJob = null;
let keywordRankJobs = [];
let keywordRankEditingIndex = -1;
let keywordRankEnvironmentReady = false;
let shippingLastResult = null;
let shippingPdfPaths = [];
let shippingProducts = [];
let shippingEditingSku = '';
let dailyGroups = [];
let dailyRunning = false;
let dailyLogs = [];
let toastTimer = null;
let renderedAvatarSource = '';
let historyFilter = 'all';

const DEFAULT_AVATAR_SOURCE = '../assets/app-icon.png';

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function cryptoRandomId() {
  return globalThis.crypto?.randomUUID?.() || `daily-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function iconSvg(name, className = '') {
  return `<svg class="icon ${className}" aria-hidden="true"><use href="#icon-${name}"></use></svg>`;
}

function renderAvatar() {
  const customAvatar = typeof appState.settings.profileAvatar === 'string'
    ? appState.settings.profileAvatar
    : '';
  const source = customAvatar || DEFAULT_AVATAR_SOURCE;
  if (source !== renderedAvatarSource) {
    avatarImage.src = source;
    renderedAvatarSource = source;
  }
  avatarButton.title = customAvatar ? '点击更换头像' : '点击上传自定义头像';
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('load', () => resolve(String(reader.result || '')));
    reader.addEventListener('error', () => reject(new Error('无法读取这张图片')));
    reader.readAsDataURL(file);
  });
}

function loadAvatarImage(source) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener('load', () => resolve(image), { once: true });
    image.addEventListener('error', () => reject(new Error('图片无法解码，请换一张重试')), { once: true });
    image.src = source;
  });
}

async function createAvatarDataUrl(file) {
  const supportedType = /^(image\/png|image\/jpeg|image\/webp)$/i.test(file?.type || '');
  const supportedName = /\.(png|jpe?g|webp)$/i.test(file?.name || '');
  if (!supportedType && !supportedName) throw new Error('请选择 PNG、JPG 或 WebP 图片');
  if (file.size > 10 * 1024 * 1024) throw new Error('原图不能超过 10 MB');
  const image = await loadAvatarImage(await readFileAsDataUrl(file));
  const canvas = document.createElement('canvas');
  const outputSize = 256;
  canvas.width = outputSize;
  canvas.height = outputSize;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('无法处理这张图片');
  const sourceSize = Math.min(image.naturalWidth, image.naturalHeight);
  const sourceX = (image.naturalWidth - sourceSize) / 2;
  const sourceY = (image.naturalHeight - sourceSize) / 2;
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.clearRect(0, 0, outputSize, outputSize);
  context.drawImage(image, sourceX, sourceY, sourceSize, sourceSize, 0, 0, outputSize, outputSize);
  return canvas.toDataURL('image/webp', .9);
}

function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatDateTime(value, fallback = '未设置提醒') {
  if (!value) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

function formatToday() {
  const date = new Date();
  const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  return `${date.getMonth() + 1}月${date.getDate()}日 · ${weekdays[date.getDay()]}`;
}

function getTodayTodos() {
  return todoViews.classify(appState.todos).today;
}

function recurrenceLabel(todo) {
  if (todo.kind !== 'fixed') return '临时';
  if (todo.recurrence === 'weekly') {
    const days = Array.isArray(todo.weekdays) && todo.weekdays.length
      ? todo.weekdays
      : [new Date(todo.dueAt || todo.createdAt).getDay()];
    const names = ['日', '一', '二', '三', '四', '五', '六'];
    return `每周${days.filter((day) => Number.isInteger(day) && day >= 0 && day <= 6)
      .sort((a, b) => (a || 7) - (b || 7)).map((day) => names[day]).join('、')}`;
  }
  return { daily: '每天', weekly: '每周', monthly: '每月' }[todo.recurrence] || '固定';
}

function todoReminderLabel(todo) {
  if (todo.kind !== 'fixed' || todo.recurrence !== 'weekly') return formatDateTime(todo.dueAt);
  if (!todo.dueAt) return '未设置提醒时间';
  const due = new Date(todo.dueAt);
  if (Number.isNaN(due.getTime())) return '未设置提醒时间';
  return `提醒 ${String(due.getHours()).padStart(2, '0')}:${String(due.getMinutes()).padStart(2, '0')}`;
}

function showToast(message) {
  clearTimeout(toastTimer);
  toastElement.textContent = message;
  toastElement.classList.add('show');
  toastTimer = setTimeout(() => toastElement.classList.remove('show'), 2400);
}

function emptyState(title, text, action, buttonText) {
  return `<div class="empty-state"><div><strong>${escapeHtml(title)}</strong><p>${escapeHtml(text)}</p><button data-action="${action}">${escapeHtml(buttonText)}</button></div></div>`;
}

function renderTodos() {
  const todos = getTodayTodos();
  if (!todos.length) {
    todoList.innerHTML = emptyState('今天的事项已清空', '保持节奏，或添加一个新任务', 'add-todo', '新增待办');
    return;
  }
  todoList.innerHTML = `<div class="todo-list">${todos.map((todo) => {
    const deadlineReminder = todo.systemType === 'product-deadline';
    return `<div class="todo-row">
      ${deadlineReminder
        ? `<span class="todo-deadline-alert" aria-hidden="true">!</span>`
        : `<input class="todo-check" type="checkbox" data-action="toggle-todo" data-id="${escapeHtml(todo.id)}" aria-label="完成待办">`}
      <div class="todo-main">
        <div class="todo-title">${escapeHtml(todo.title)}</div>
        <div class="todo-meta">${deadlineReminder ? '产品监控已到期，请设置新的截止日期' : todoReminderLabel(todo)}</div>
      </div>
      <div class="todo-actions">
        ${deadlineReminder
          ? `<button class="deadline-todo-action" data-action="set-product-deadline" data-id="${escapeHtml(todo.productId)}">设置日期</button>`
          : `<span class="tag ${todo.kind === 'fixed' ? 'fixed' : 'temporary'}">${recurrenceLabel(todo)}</span>
            <button class="icon-delete" data-action="delete-todo" data-id="${escapeHtml(todo.id)}" title="删除" aria-label="删除待办">${iconSvg('trash')}</button>`}
      </div>
    </div>`;
  }).join('')}</div>`;
}

function renderHistory() {
  const { history } = todoViews.classify(appState.todos);
  const overdueCount = history.filter((item) => item.status === 'overdue').length;
  document.querySelector('#history-all-count').textContent = history.length;
  document.querySelector('#history-overdue-count').textContent = overdueCount;
  document.querySelector('#history-completed-count').textContent = history.length - overdueCount;
  document.querySelectorAll('[data-history-filter]').forEach((button) => {
    button.classList.toggle('active', button.dataset.historyFilter === historyFilter);
  });
  const visible = historyFilter === 'all' ? history : history.filter((item) => item.status === historyFilter);
  if (!visible.length) {
    historyList.innerHTML = '<div class="history-empty">这里暂时没有记录</div>';
    return;
  }
  historyList.innerHTML = visible.map(({ todo, status, dateKey, fixed }) => {
    const isToday = dateKey === localDateKey();
    const statusText = status === 'overdue' ? '已过期' : '已完成';
    const restoreAction = fixed
      ? (isToday ? `<button data-action="toggle-todo" data-id="${escapeHtml(todo.id)}">撤销完成</button>` : '')
      : `<button data-action="restore-todo" data-id="${escapeHtml(todo.id)}">${status === 'overdue' ? '移到今日' : '重新启用'}</button>`;
    const meta = fixed ? `${dateKey} · ${recurrenceLabel(todo)}`
      : `${status === 'overdue' ? '原定' : '记录于'} ${status === 'overdue' ? formatDateTime(todo.dueAt) : dateKey} · 临时待办`;
    return `<article class="history-row">
      <span class="history-status ${status}">${statusText}</span>
      <div class="history-copy"><strong>${escapeHtml(todo.title)}</strong><small>${escapeHtml(meta)}</small></div>
      <div class="history-actions">${restoreAction}<button class="history-delete" data-action="delete-todo" data-id="${escapeHtml(todo.id)}" data-fixed="${fixed}" aria-label="删除${escapeHtml(todo.title)}">${iconSvg('trash')}</button></div>
    </article>`;
  }).join('');
}

function flag(label, value, negativeIsAlert = false) {
  const className = value === true ? 'yes' : value === false ? (negativeIsAlert ? 'no' : 'off') : 'unknown';
  return `<span class="flag ${className}"><i></i>${label}</span>`;
}

function queryStateText(product) {
  if (refreshProgress?.current === product.id) return ['查询中…', ''];
  const status = product.status;
  if (!status) return ['待查询', ''];
  if (status.queryState === 'ok') return ['已更新', 'ok'];
  if (status.queryState === 'blocked') return ['遇到验证码', 'blocked'];
  return ['查询失败', 'failed'];
}

function renderProducts() {
  if (!appState.products.length) {
    productList.innerHTML = emptyState('还没有产品', '添加美国站 ASIN 查看关键状态', 'add-product', '添加产品');
    productList.className = '';
    return;
  }
  productList.className = 'product-list';
  productList.innerHTML = appState.products.map((product) => {
    const status = product.status || {};
    const [stateText, stateClass] = queryStateText(product);
    const checkedTime = status.checkedAt ? formatDateTime(status.checkedAt, '') : '';
    const nonUsdPrice = status.price && (/CNY|CN\s*[¥￥]|[¥￥]/i.test(status.price)
      || (status.currency && status.currency !== 'USD'));
    const displayPrice = nonUsdPrice ? '需刷新' : (status.price || '—');
    const deadlineDue = Boolean(product.deadline && product.deadline <= localDateKey());
    const deadlineText = product.deadline ? product.deadline.slice(5).replace('-', '/') : '设截止日';
    return `<article class="product-card compact${deadlineDue ? ' deadline-due' : ''}" title="${escapeHtml(product.name || product.asin)}">
      <div class="product-compact-head">
        <div class="product-id-line">
          <strong>${escapeHtml(product.asin)}</strong>
          <button class="icon-external" data-action="open-product" data-asin="${escapeHtml(product.asin)}" title="在浏览器打开" aria-label="在浏览器打开 ${escapeHtml(product.asin)}">${iconSvg('external')}</button>
        </div>
        <span class="query-state ${stateClass}">${stateText}${checkedTime ? ` · ${checkedTime}` : ''}</span>
        <div class="product-head-actions">
          <button class="product-deadline-button${deadlineDue ? ' due' : ''}" data-action="set-product-deadline" data-id="${escapeHtml(product.id)}" title="${deadlineDue ? '截止日期已到，请设置新日期' : '设置截止日期'}">${escapeHtml(deadlineText)}</button>
          <button class="icon-refresh" data-action="refresh-product" data-id="${escapeHtml(product.id)}" title="刷新" aria-label="刷新产品">${iconSvg('refresh')}</button>
          <button class="icon-delete" data-action="delete-product" data-id="${escapeHtml(product.id)}" title="删除" aria-label="删除产品">${iconSvg('trash')}</button>
        </div>
      </div>
      <div class="product-compact-body">
        <strong class="compact-price">${escapeHtml(displayPrice)}</strong>
        <span class="compact-rating">${status.rating == null ? '★ —' : `★ ${status.rating}`}<small>${status.reviewCount == null ? '' : ` · ${Number(status.reviewCount).toLocaleString('en-US')}`}</small></span>
        <div class="product-flags">
          ${flag('购物车', status.hasBuyBox, true)}
          ${flag('Prime折扣', status.hasPrimeDiscount)}
          ${flag('Deal', status.hasLimitedTimeDeal)}
        </div>
      </div>
    </article>`;
  }).join('');
}

function renderTools() {
  const icons = {
    'shipping-planner': 'package',
    'daily-report': 'table',
    'competitor-images': 'image',
    'keyword-rank': 'search',
    'unit-converter': 'calculator',
  };
  toolsList.innerHTML = tools.map((tool) => {
    const action = tool.status === 'ready'
      ? `<button class="tool-open" data-action="open-${escapeHtml(tool.id)}">打开</button>`
      : `<span class="tool-status">${tool.status === 'next' ? '优先接入' : '规划中'}</span>`;
    return `<div class="tool-row">
      <span class="tool-icon">${iconSvg(icons[tool.id] || 'toolbox')}</span>
      <div class="tool-copy"><strong>${escapeHtml(tool.name)}</strong><small>${escapeHtml(tool.description)}</small></div>
      ${action}
    </div>`;
  }).join('');
}

function renderManualConverter(kind) {
  const valueInput = document.querySelector(`#${kind}-converter-value`);
  const fromInput = document.querySelector(`#${kind}-converter-from`);
  const toInput = document.querySelector(`#${kind}-converter-to`);
  const result = document.querySelector(`#${kind}-converter-result`);
  const resultBox = result.closest('.converter-result');
  const rawValue = valueInput.value.trim().replace(',', '.');
  if (!rawValue) {
    result.textContent = '请输入数值';
    resultBox.classList.add('invalid');
    return;
  }
  try {
    const converted = converter.convert(Number(rawValue), fromInput.value, toInput.value);
    const unit = converter.UNITS[toInput.value];
    result.textContent = `${converter.formatNumber(converted)} ${unit.label}`;
    resultBox.classList.remove('invalid');
  } catch (error) {
    result.textContent = error.message || String(error);
    resultBox.classList.add('invalid');
  }
}

function renderSmartConverter() {
  const text = smartConverterInput.value.trim();
  const resultBox = smartConverterResult.closest('.converter-result');
  if (!text) {
    smartConverterMeta.textContent = '输入后自动识别';
    smartConverterResult.textContent = '等待输入尺寸或重量文本';
    resultBox.classList.remove('invalid');
    return;
  }
  try {
    const sourceCode = converter.detectUnit(text) || smartConverterSource.value;
    const sourceUnit = converter.UNITS[sourceCode];
    const currentTarget = converter.UNITS[smartConverterTarget.value];
    if (sourceUnit.kind !== currentTarget.kind) {
      smartConverterTarget.value = sourceUnit.kind === 'length' ? 'in' : 'lb';
    }
    const converted = converter.smartConvert(text, smartConverterTarget.value, smartConverterSource.value);
    smartConverterMeta.textContent = `已识别 ${converter.UNITS[converted.sourceCode].label} · ${converted.values.length} 个数值`;
    smartConverterResult.textContent = converted.output;
    resultBox.classList.remove('invalid');
  } catch (error) {
    smartConverterMeta.textContent = '暂时无法换算';
    smartConverterResult.textContent = error.message || String(error);
    resultBox.classList.add('invalid');
  }
}

function openUnitConverter() {
  toolsDialog.close();
  renderManualConverter('length');
  renderManualConverter('weight');
  renderSmartConverter();
  converterDialog.showModal();
  smartConverterInput.focus();
}

function countCompetitorAsins() {
  const values = String(competitorAsins.value || '')
    .toUpperCase()
    .split(/[\s,，;；]+/)
    .filter(Boolean);
  const count = new Set(values).size;
  competitorCount.textContent = `${count} / 25`;
  competitorCount.classList.toggle('over-limit', count > 25);
}

function competitorPhaseLabel(phase) {
  return {
    queued: '等待启动',
    launching: '启动浏览器',
    scraping: '读取商品页',
    redirect: '锁定美国站',
    captcha: '等待处理验证码',
    loading_aplus: '加载完整内容',
    images: '下载图片',
    result: '已完成一个商品',
    exporting: '生成 Excel',
    completed: '采集完成',
    failed: '采集失败',
  }[phase] || '采集中';
}

function competitorProgressValue(job) {
  if (!job) return 0;
  if (job.status === 'completed') return 100;
  if (job.status === 'exporting') return 96;
  const total = Number(job.progress?.total) || 0;
  const completed = Number(job.progress?.completed) || 0;
  const base = job.progress?.phase === 'queued' ? 2 : 6;
  return total ? Math.min(92, Math.round(base + (completed / total) * 86)) : base;
}

function renderCompetitorJob(job = competitorJob) {
  const progress = job?.progress || {};
  const total = Number(progress.total) || 0;
  const completed = Number(progress.completed) || 0;
  const active = Boolean(job && ['queued', 'running', 'exporting'].includes(job.status));
  competitorStatus.textContent = job ? competitorPhaseLabel(progress.phase || job.status) : '等待开始';
  competitorProgressCount.textContent = `${completed} / ${total}`;
  competitorProgress.value = competitorProgressValue(job);
  competitorDetail.textContent = job?.error
    || progress.message
    || '将采集标题、全部商品图与 A+ 图片，并自动排除 From the brand。';
  competitorStart.disabled = active;
  competitorAsins.disabled = active;
  competitorShowBrowser.disabled = active;
  competitorStart.textContent = active ? '采集中，请稍候…' : job ? '再次采集并生成 Excel' : '开始采集并生成 Excel';
  competitorSave.disabled = !(job?.status === 'completed' && job.downloadReady);
  competitorResults.innerHTML = (job?.results || []).map((result) => {
    const warnings = (result.warnings || []).join('；');
    return `<div class="result-row ${result.error ? 'failed' : ''}" title="${escapeHtml(result.error || warnings)}">
      <span class="result-asin">${escapeHtml(result.asin)}</span>
      <span class="result-title">${escapeHtml(result.error || result.title || '未读取到标题')}</span>
      <span class="result-counts">商品图 ${result.galleryCount || 0} · A+ ${result.aplusCount || 0}</span>
    </div>`;
  }).join('');
}

function parseKeywordRankKeywords(value = keywordRankKeywords.value) {
  const deduped = new Map();
  String(value || '').split(/\r?\n/).forEach((raw) => {
    const keyword = raw
      .replace(/[\u0000-\u001f\u007f\ufffc]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!keyword) return;
    const key = keyword.toLocaleLowerCase('en-US');
    if (!deduped.has(key)) deduped.set(key, keyword);
  });
  return [...deduped.values()];
}

function updateKeywordRankKeywordCount() {
  const count = parseKeywordRankKeywords().length;
  keywordRankKeywordCount.textContent = `${count} 个`;
  keywordRankKeywordCount.classList.toggle('over-limit', count > 300);
}

function resetKeywordRankEditor(job = null, index = -1) {
  keywordRankEditingIndex = index;
  keywordRankAsin.value = job?.asin || '';
  keywordRankPostcode.value = job?.postcode || '10110';
  keywordRankKeywords.value = Array.isArray(job?.keywords) ? job.keywords.join('\n') : '';
  keywordRankExclude.checked = job ? Boolean(job.excludePreviouslyViewed) : true;
  keywordRankCancelEdit.hidden = index < 0;
  keywordRankAdd.textContent = index < 0 ? '加入查询队列' : '保存任务修改';
  updateKeywordRankKeywordCount();
}

async function saveKeywordRankConfig() {
  appState = await api.keywordRank.saveConfig({
    jobs: keywordRankJobs,
    outputDir: keywordRankOutput.value.trim(),
  });
}

function renderKeywordRankJobs() {
  keywordRankJobCount.textContent = `${keywordRankJobs.length} 个 ASIN`;
  keywordRankJobList.innerHTML = keywordRankJobs.length
    ? keywordRankJobs.map((job, index) => `<div class="keyword-rank-job-row">
      <div><strong>${escapeHtml(job.asin)}</strong><small>邮编 ${escapeHtml(job.postcode)} · ${job.keywords.length} 词 · ${job.excludePreviouslyViewed ? '排除浏览记录' : '保留浏览记录'}</small></div>
      <div class="keyword-rank-job-actions">
        <button type="button" data-action="edit-keyword-rank-job" data-index="${index}" title="编辑">${iconSvg('edit')}</button>
        <button type="button" data-action="remove-keyword-rank-job" data-index="${index}" title="删除">${iconSvg('trash')}</button>
      </div>
    </div>`).join('')
    : '<div class="keyword-rank-empty">尚未添加任务，请先填写上方配置。</div>';
}

function keywordRankPhaseLabel(phase) {
  return {
    queued: '等待启动',
    launching: '启动 Chrome',
    extension_setup: '安装插件',
    login: '等待登录',
    preparing: '填写配置',
    verifying: '复核选项',
    querying: '查询排名',
    retrying: '准备重试',
    exporting: '生成 Excel',
    result: '完成一个任务',
    completed: '全部完成',
    failed: '任务失败',
  }[phase] || '处理中';
}

function keywordRankProgressValue(job) {
  if (!job) return 0;
  if (job.status === 'completed') return 100;
  const completed = Number(job.progress?.completedJobs) || 0;
  const total = Number(job.progress?.totalJobs) || 0;
  const phaseBonus = {
    queued: 1,
    launching: 2,
    extension_setup: 3,
    login: 4,
    preparing: 5,
    verifying: 8,
    querying: 45,
    retrying: 12,
    exporting: 88,
    result: 96,
  }[job.progress?.phase] || 0;
  return total ? Math.min(99, Math.round(((completed + phaseBonus / 100) / total) * 100)) : 0;
}

function renderKeywordRankJob(job = keywordRankJob) {
  const active = Boolean(job && ['queued', 'running'].includes(job.status));
  const completed = Number(job?.progress?.completedJobs) || 0;
  const total = Number(job?.progress?.totalJobs) || keywordRankJobs.length;
  keywordRankStatus.textContent = job
    ? keywordRankPhaseLabel(job.progress?.phase || job.status)
    : '等待开始';
  keywordRankProgressCount.textContent = `${completed} / ${total}`;
  keywordRankProgress.value = keywordRankProgressValue(job);
  keywordRankDetail.textContent = job?.error
    || job?.progress?.message
    || '首次使用会打开独立 Chrome，请安装并登录 Amazon Keyword-Ranking-Tracker 插件。';
  keywordRankForm.querySelectorAll('input, textarea, button').forEach((element) => {
    element.disabled = active;
  });
  keywordRankJobList.querySelectorAll('button').forEach((button) => { button.disabled = active; });
  const chooseOutput = keywordRankDialog.querySelector('[data-action="choose-keyword-rank-output"]');
  if (chooseOutput) chooseOutput.disabled = active;
  keywordRankStart.disabled = active || !keywordRankEnvironmentReady || !keywordRankJobs.length;
  keywordRankStart.textContent = active ? '查询运行中，请在 Chrome 中完成必要操作…' : '开始查询全部';
  keywordRankOpenOutput.disabled = !(job?.outputDir && (job.results || []).length);
  keywordRankResults.innerHTML = (job?.results || []).map((result) => `<div class="keyword-rank-result-row">
    <div><strong>${escapeHtml(result.asin)}</strong><small>${result.keywordCount} 个关键词 · Indexed ${result.indexedCount}</small></div>
    <span>第 ${result.attempts} 次成功</span>
  </div>`).join('');
}

async function openKeywordRank() {
  toolsDialog.close();
  const saved = appState.settings.keywordRank || {};
  keywordRankJobs = Array.isArray(saved.jobs) ? saved.jobs.map((job) => ({
    ...job,
    keywords: Array.isArray(job.keywords) ? [...job.keywords] : [],
  })) : [];
  keywordRankOutput.value = saved.outputDir || '';
  keywordRankJob = await api.keywordRank.get();
  keywordRankEnvironmentReady = false;
  resetKeywordRankEditor();
  renderKeywordRankJobs();
  renderKeywordRankJob();
  keywordRankEnvironment.textContent = '正在检查系统 Chrome…';
  keywordRankEnvironment.className = 'environment-state working';
  keywordRankDialog.showModal();
  const environment = await api.keywordRank.check();
  keywordRankEnvironmentReady = Boolean(environment.ready);
  keywordRankEnvironment.textContent = environment.ready ? environment.message : environment.error;
  keywordRankEnvironment.className = `environment-state ${environment.ready ? 'ready' : 'failed'}`;
  renderKeywordRankJob();
  if (!keywordRankJobs.length) keywordRankAsin.focus();
}

function setShippingDefaults() {
  const saved = appState.settings.shippingPlanner || {};
  shippingStore.value = saved.store || 'StoreA';
  shippingTransport.value = saved.transport || '普船';
  shippingDeliveryDays.value = Number.isInteger(saved.deliveryDays) && saved.deliveryDays >= 0
    ? saved.deliveryDays
    : 45;
  shippingPerson.value = saved.person || '';
  shippingLocked.checked = saved.locked !== false;
  shippingBtw.value = saved.btwDir || '';
  shippingOutput.value = saved.outputDir || '';
  shippingDate.value = localDateKey();
}

function shippingFileName(filePath) {
  return String(filePath || '').split(/[\\/]/).pop() || filePath;
}

function renderShippingFiles() {
  shippingPdf.value = shippingPdfPaths.length
    ? `${shippingPdfPaths.length} 个 PDF：${shippingPdfPaths.map(shippingFileName).join('、')}`
    : '';
  shippingFileList.hidden = !shippingPdfPaths.length;
  shippingFileList.innerHTML = shippingPdfPaths.map((filePath, index) => `<div class="shipping-file-row">
    <span>${iconSvg('file')}<strong>${escapeHtml(shippingFileName(filePath))}</strong></span>
    <button type="button" data-remove-shipping-file="${index}" title="移除" aria-label="移除 ${escapeHtml(shippingFileName(filePath))}">${iconSvg('close')}</button>
  </div>`).join('');
}

function renderShippingResult(result = shippingLastResult) {
  shippingResult.hidden = !result;
  if (!result) {
    shippingResult.innerHTML = '';
    return;
  }
  const skuRows = (result.skus || []).map((item) => `<div class="shipping-sku-row">
    <div><strong>${escapeHtml(item.sku)}</strong><small>${escapeHtml(item.fbaWarehouse || '未识别仓库')}</small></div><span>${Number(item.boxCount) || 0} 箱</span><span>${Number(item.totalQty) || 0} PCS</span>
  </div>`).join('');
  const notes = [
    result.btwMissing?.length ? `缺少 BTW：${result.btwMissing.join('、')}` : '',
    result.productMissing?.length ? `产品库缺失：${result.productMissing.join('、')}` : '',
    ...(result.warnings || []),
  ].filter(Boolean);
  shippingResult.innerHTML = `<div class="shipping-result-head"><div><strong>处理完成 · ${(result.pdfs || []).length || 1} 份 PDF / ${(result.skus || []).length} 条货品</strong><small>${escapeHtml(result.outputDir)}</small></div>
    <button type="button" data-action="open-shipping-output">打开文件夹</button></div>
    <div class="shipping-sku-list">${skuRows || '<p>未返回 SKU 明细</p>'}</div>
    ${notes.length ? `<div class="shipping-warnings">${notes.map((note) => `<p>${escapeHtml(note)}</p>`).join('')}</div>` : ''}`;
}

function renderShippingProducts() {
  const query = shippingProductSearch.value.trim().toLowerCase();
  const filtered = shippingProducts.filter((product) => !query || [product.sku, product.fnsku, product.name]
    .some((value) => String(value || '').toLowerCase().includes(query)));
  shippingProductCount.textContent = query
    ? `${filtered.length} / ${shippingProducts.length} 条`
    : `${shippingProducts.length} 条`;
  shippingProductList.innerHTML = filtered.length ? filtered.map((product) => `<div class="shipping-product-row">
    <span title="${escapeHtml(product.sku)}">${escapeHtml(product.sku)}</span>
    <span title="${escapeHtml(product.fnsku)}">${escapeHtml(product.fnsku)}</span>
    <span title="${escapeHtml(product.name)}">${escapeHtml(product.name)}</span>
    <div class="shipping-product-actions">
      <button type="button" data-action="edit-shipping-product" data-sku="${escapeHtml(product.sku)}" title="编辑" aria-label="编辑 ${escapeHtml(product.sku)}"><svg class="icon"><use href="#icon-edit"></use></svg></button>
      <button type="button" data-action="delete-shipping-product" data-sku="${escapeHtml(product.sku)}" title="删除" aria-label="删除 ${escapeHtml(product.sku)}"><svg class="icon"><use href="#icon-trash"></use></svg></button>
    </div>
  </div>`).join('') : '<div class="shipping-product-empty">没有匹配的产品资料</div>';
}

async function refreshShippingProducts() {
  const result = await api.shipping.listProducts();
  shippingProducts = result.products || [];
  renderShippingProducts();
  return result;
}

async function openShippingProducts() {
  shippingProductSearch.value = '';
  await refreshShippingProducts();
  shippingProductsDialog.showModal();
  shippingProductSearch.focus();
}

function openShippingProductEditor(product = null) {
  shippingEditingSku = product?.sku || '';
  shippingProductEditorForm.reset();
  shippingProductEditorTitle.textContent = product ? '编辑产品' : '新增产品';
  shippingProductSku.value = product?.sku || '';
  shippingProductSku.readOnly = Boolean(product);
  shippingProductFnsku.value = product?.fnsku || '';
  shippingProductName.value = product?.name || '';
  shippingProductEditorDialog.showModal();
  (product ? shippingProductFnsku : shippingProductSku).focus();
}

function requestMissingShippingProducts(missing) {
  shippingMissingProductsDialog.returnValue = '';
  shippingSaveMissingProducts.checked = true;
  shippingMissingProductsList.innerHTML = missing.map((product, index) => `<div class="shipping-missing-row" data-missing-product="${index}">
    <strong>${escapeHtml(product.sku)}</strong>
    <input data-missing-field="fnsku" value="${escapeHtml(product.fnsku || '')}" maxlength="80" required autocomplete="off" aria-label="${escapeHtml(product.sku)} 的 FNSKU" placeholder="FNSKU">
    <input data-missing-field="name" value="${escapeHtml(product.name || '')}" maxlength="120" required autocomplete="off" aria-label="${escapeHtml(product.sku)} 的产品名称" placeholder="产品名称">
  </div>`).join('');
  return new Promise((resolve) => {
    shippingMissingProductsDialog.addEventListener('close', () => {
      if (shippingMissingProductsDialog.returnValue !== 'confirm') {
        resolve(null);
        return;
      }
      const products = missing.map((product, index) => {
        const row = shippingMissingProductsList.querySelector(`[data-missing-product="${index}"]`);
        return {
          sku: product.sku,
          fnsku: row.querySelector('[data-missing-field="fnsku"]').value.trim(),
          name: row.querySelector('[data-missing-field="name"]').value.trim(),
        };
      });
      resolve({ products, save: shippingSaveMissingProducts.checked });
    }, { once: true });
    shippingMissingProductsDialog.showModal();
    shippingMissingProductsList.querySelector('input')?.focus();
  });
}

async function openShippingPlanner() {
  toolsDialog.close();
  setShippingDefaults();
  shippingLastResult = null;
  renderShippingResult();
  shippingEnvironment.textContent = '正在检查处理环境…';
  shippingEnvironment.className = 'environment-state';
  shippingStart.disabled = true;
  shippingDialog.showModal();
  renderShippingFiles();
  const [status, library] = await Promise.all([
    api.shipping.check(),
    api.shipping.listProducts(),
  ]);
  shippingProducts = library.products || [];
  shippingStart.disabled = !status.ready;
  shippingEnvironment.textContent = status.ready
    ? `${status.runtime === 'bundled' ? '内置' : '本机'}处理环境已就绪 · 产品库 ${shippingProducts.length} 条`
    : status.error;
  shippingEnvironment.className = `environment-state ${status.ready ? 'ready' : 'failed'}`;
}

function dailyFileName(filePath) {
  return String(filePath || '').split(/[\\/]/).pop() || '';
}

function inferDailyAsin(...values) {
  for (const value of values) {
    const match = String(value || '').toUpperCase().match(/\bB0[A-Z0-9]{8}\b/);
    if (match) return match[0];
  }
  return '';
}

function uniqueDailyGroupAsin() {
  const asins = [...new Set(dailyGroups.map((group) => inferDailyAsin(
    group.asin,
    group.name,
    group.keyword,
    group.source,
  )).filter(Boolean))];
  return asins.length === 1 ? asins[0] : '';
}

function renderDailyGroups() {
  dailyGroupCount.textContent = `${dailyGroups.length} 组`;
  dailyGroupList.innerHTML = dailyGroups.length ? dailyGroups.map((group, index) => `
    <div class="daily-group-row">
      <div>
        <div class="daily-group-title"><strong>${escapeHtml(group.name || `组${index + 1}`)}</strong><span>${escapeHtml(group.asin || '自动匹配日表')}</span></div>
        <div class="daily-group-files"><span title="${escapeHtml(group.source)}">表现：${escapeHtml(dailyFileName(group.source) || '未选择')}</span><span title="${escapeHtml(group.keyword)}">关键词：${escapeHtml(dailyFileName(group.keyword) || '未选择')}</span></div>
      </div>
      <button type="button" data-remove-daily-group="${index}" title="移除" aria-label="移除 ${escapeHtml(group.name || `组${index + 1}`)}">${iconSvg('trash')}</button>
    </div>`).join('') : '<div class="daily-group-empty">选择产品表现表或关键词表，加入一个待处理组</div>';
}

function resetDailyRunPanel() {
  dailyLogs = [];
  dailyRunPanel.hidden = true;
  dailyStatus.textContent = '准备中';
  dailyProgressCount.textContent = `0 / ${dailyGroups.length}`;
  dailyResultList.innerHTML = '';
  dailyLog.innerHTML = '';
}

function setDailyBusy(busy, label = '开始填写全部') {
  dailyRunning = busy;
  dailyStart.disabled = busy || !dailyGroups.length;
  dailyTrafficStart.disabled = busy;
  dailyStart.textContent = busy ? label : '开始填写全部';
  dailyGroupForm.querySelectorAll('input, button').forEach((element) => { element.disabled = busy; });
}

function handleDailyProgress(progress) {
  dailyRunPanel.hidden = false;
  dailyStatus.textContent = progress?.message || '处理中…';
  const current = Number(progress?.groupIndex) || 0;
  const total = Number(progress?.groupTotal) || dailyGroups.length;
  dailyProgressCount.textContent = `${current} / ${total}`;
  if (progress?.message) {
    dailyLogs.push(progress.message);
    dailyLogs = dailyLogs.slice(-40);
    dailyLog.innerHTML = dailyLogs.map((line) => `<p>${escapeHtml(line)}</p>`).join('');
    dailyLog.scrollTop = dailyLog.scrollHeight;
  }
  if (progress?.phase?.startsWith('traffic_')) {
    dailyEnvironment.textContent = progress.message;
    dailyEnvironment.className = 'environment-state working';
  }
}

function renderDailyResult(result) {
  const groups = result?.groups || [];
  dailyRunPanel.hidden = false;
  dailyStatus.textContent = result?.message || '处理完成';
  dailyProgressCount.textContent = `${groups.filter((group) => group.ok).length} / ${groups.length}`;
  dailyResultList.innerHTML = groups.map((group) => {
    const warning = (group.warnings || []).join('；');
    const keywordWritten = group.keywordWritten ?? group.keywordMatches ?? 0;
    const keywordSourceRows = group.keywordSourceRows || 0;
    const keywordSummary = keywordSourceRows
      ? `${keywordWritten}/${keywordSourceRows} 条`
      : `${keywordWritten} 条`;
    const notes = group.ok
      ? `${group.targetDate || '未定位日期'} · 表现 ${group.productCells || 0} 格 · 关键词 ${keywordSummary} · 评分 ${group.ratingFields || 0} 项${warning ? ` · ${warning}` : ''}`
      : group.error || '处理失败';
    const ratingButton = group.ratingFallback && group.asin
      ? `<button type="button" class="daily-manual-rating" data-action="open-daily-rating" data-asin="${escapeHtml(group.asin)}" title="在浏览器打开 Amazon 评价区域">${iconSvg('external')}浏览器查看</button>`
      : '';
    return `<div class="daily-result-row ${group.ok ? '' : 'failed'}"><div><strong>${escapeHtml(group.name || '未命名组')}</strong><small>${escapeHtml(group.workbook || group.asin || '')}</small></div><div class="daily-result-summary"><span>${escapeHtml(notes)}</span>${ratingButton}</div></div>`;
  }).join('');
}

async function saveDailyConfig() {
  appState = await api.daily.saveConfig({
    groups: dailyGroups,
    includeRatings: dailyIncludeRatings.checked,
  });
}

async function openDailyReport() {
  toolsDialog.close();
  const saved = appState.settings.dailyReport || {};
  dailyGroups = Array.isArray(saved.groups) ? saved.groups.map((group) => ({ ...group })) : [];
  dailyIncludeRatings.checked = saved.includeRatings !== false;
  dailyProductFile.value = '';
  dailyKeywordFile.value = '';
  dailyGroupName.value = '';
  dailyGroupAsin.value = '';
  dailyTrafficAsin.value = uniqueDailyGroupAsin();
  renderDailyGroups();
  resetDailyRunPanel();
  setDailyBusy(false);
  dailyEnvironment.textContent = '正在检查处理环境…';
  dailyEnvironment.className = 'environment-state';
  dailyDialog.showModal();
  const status = await api.daily.check();
  dailyEnvironment.textContent = status.ready
    ? `${status.runtime === 'bundled' ? '内置' : '本机'}填报环境已就绪 · 请保持目标 WPS 日表打开`
    : status.error;
  dailyEnvironment.className = `environment-state ${status.ready ? 'ready' : 'failed'}`;
  dailyStart.disabled = !status.ready || !dailyGroups.length;
}

function renderSettings() {
  settingsList.innerHTML = `
    <div class="setting-row">
      <div class="setting-copy"><strong>窗口模式</strong><small>悬浮球模式：收起或关闭后显示桌面悬浮球，点击恢复</small></div>
      <select data-setting="windowMode" aria-label="窗口模式">
        <option value="float" ${appState.settings.windowMode !== 'ball' ? 'selected' : ''}>浮窗</option>
        <option value="ball" ${appState.settings.windowMode === 'ball' ? 'selected' : ''}>悬浮球</option>
      </select>
    </div>
    <div class="setting-row">
      <div class="setting-copy"><strong>左上角头像</strong><small>点击主界面头像即可上传或更换</small></div>
      <button type="button" class="avatar-reset-button" data-action="reset-avatar" ${appState.settings.profileAvatar ? '' : 'disabled'}>恢复默认</button>
    </div>
    <div class="setting-row">
      <div class="setting-copy"><strong>Windows 待办通知</strong><small>驻留托盘时继续发送提醒</small></div>
      <label class="switch"><input type="checkbox" data-setting="notificationsEnabled" ${appState.settings.notificationsEnabled ? 'checked' : ''}></label>
    </div>
    <div class="setting-row">
      <div class="setting-copy"><strong>开机自启动</strong><small>登录 Windows 后自动启动并继续接收提醒</small></div>
      <label class="switch"><input type="checkbox" data-setting="launchAtLogin" ${appState.settings.launchAtLogin ? 'checked' : ''}></label>
    </div>
    <div class="setting-row">
      <div class="setting-copy"><strong>启动时刷新产品</strong><small>每次启动只查询一次</small></div>
      <label class="switch"><input type="checkbox" data-setting="startupProductRefresh" ${appState.settings.startupProductRefresh ? 'checked' : ''}></label>
    </div>
    <div class="setting-row">
      <div class="setting-copy"><strong>${appState.settings.windowMode === 'ball' ? '关闭到悬浮球' : '关闭到系统托盘'}</strong><small>从托盘菜单彻底退出软件</small></div>
      <span class="tool-status">已启用</span>
    </div>
    <div class="setting-row">
      <div class="setting-copy"><strong>吸顶自动隐藏</strong><small>顶部触发展开，离开立即收起</small></div>
      <span class="tool-status">${appState.settings.windowMode === 'ball' ? '悬浮球模式不启用' : dockState.docked ? '吸顶中' : '未吸顶'}</span>
    </div>
    <div class="setting-row">
      <div class="setting-copy"><strong>窗口始终置顶</strong><small>在其他软件窗口上方保持显示</small></div>
      <span class="tool-status">${dockState.pinned ? '已置顶' : '未置顶'}</span>
    </div>`;
}

function render() {
  renderAvatar();
  renderTodos();
  renderProducts();
  const pinButton = document.querySelector('#pin-button');
  pinButton.classList.toggle('active', dockState.pinned);
  pinButton.title = dockState.pinned ? '取消窗口置顶' : '窗口置顶';
  pinButton.setAttribute('aria-label', pinButton.title);
  pinButton.setAttribute('aria-pressed', String(Boolean(dockState.pinned)));
  for (const [id, label] of [['close-button', appState.settings.windowMode === 'ball' ? '收起到悬浮球' : '缩到系统托盘'], ['minimize-button', appState.settings.windowMode === 'ball' ? '收起到悬浮球' : '最小化']]) {
    const control = document.getElementById(id);
    control.title = label;
    control.setAttribute('aria-label', label);
  }
  const dockButton = document.querySelector('#dock-button');
  dockButton.style.display = appState.settings.windowMode === 'ball' ? 'none' : '';
  dockButton.classList.toggle('active', dockState.docked);
  dockButton.title = dockState.docked ? '退出吸顶' : '吸顶并自动隐藏';
  dockButton.setAttribute('aria-label', dockButton.title);
  dockButton.setAttribute('aria-pressed', String(dockState.docked));
  document.querySelector('#product-refresh-label').textContent = refreshProgress
    ? `正在查询 ${refreshProgress.completed}/${refreshProgress.total}`
    : '启动查询一次 · 后续手动刷新';
  if (settingsDialog.open) renderSettings();
  if (historyDialog.open) renderHistory();
}

function openTodoDialog() {
  document.querySelector('#todo-form').reset();
  document.querySelector(`input[name="todo-weekday"][value="${new Date().getDay()}"]`).checked = true;
  syncTodoRecurrenceFields();
  todoDialog.showModal();
  document.querySelector('#todo-title').focus();
}

function openProductDialog() {
  document.querySelector('#product-form').reset();
  productDialog.showModal();
  document.querySelector('#product-name').focus();
}

function openProductDeadlineDialog(product) {
  if (!product) return;
  document.querySelector('#product-deadline-id').value = product.id;
  document.querySelector('#product-deadline-label').textContent = `${product.name || product.asin} · ${product.asin}`;
  document.querySelector('#product-deadline-value').value = product.deadline || '';
  document.querySelector('#product-deadline-dialog').showModal();
  document.querySelector('#product-deadline-value').focus();
}

document.addEventListener('click', async (event) => {
  const closeButton = event.target.closest('[data-close-dialog]');
  if (closeButton) {
    document.querySelector(`#${closeButton.dataset.closeDialog}`).close();
    return;
  }
  const historyTab = event.target.closest('[data-history-filter]');
  if (historyTab) {
    historyFilter = historyTab.dataset.historyFilter;
    renderHistory();
    return;
  }
  const dailyPick = event.target.closest('[data-daily-pick]');
  if (dailyPick) {
    try {
      const kind = dailyPick.dataset.dailyPick;
      const selected = await api.daily.chooseExcel(kind);
      if (selected) {
        if (kind === 'source') dailyProductFile.value = selected;
        if (kind === 'keyword') dailyKeywordFile.value = selected;
        if (!dailyGroupAsin.value) dailyGroupAsin.value = inferDailyAsin(selected);
      }
    } catch (error) {
      showToast(error.message || String(error));
    }
    return;
  }
  const removeDailyGroup = event.target.closest('[data-remove-daily-group]');
  if (removeDailyGroup) {
    dailyGroups.splice(Number(removeDailyGroup.dataset.removeDailyGroup), 1);
    dailyTrafficAsin.value = uniqueDailyGroupAsin();
    await saveDailyConfig();
    renderDailyGroups();
    setDailyBusy(false);
    return;
  }
  const shippingPick = event.target.closest('[data-shipping-pick]');
  if (shippingPick) {
    try {
      const kind = shippingPick.dataset.shippingPick;
      const selected = kind === 'pdf' ? await api.shipping.choosePdfs() : await api.shipping.chooseFolder(kind);
      if (Array.isArray(selected) ? selected.length : selected) {
        if (kind === 'pdf') {
          const combined = [...shippingPdfPaths, ...selected];
          shippingPdfPaths = [...new Map(combined.map((filePath) => [filePath.toLowerCase(), filePath])).values()];
          renderShippingFiles();
        }
        if (kind === 'btw') shippingBtw.value = selected;
        if (kind === 'output') shippingOutput.value = selected;
      }
    } catch (error) {
      showToast(error.message || String(error));
    }
    return;
  }
  const removeShippingFile = event.target.closest('[data-remove-shipping-file]');
  if (removeShippingFile) {
    shippingPdfPaths.splice(Number(removeShippingFile.dataset.removeShippingFile), 1);
    renderShippingFiles();
    return;
  }
  const converterSwap = event.target.closest('[data-converter-swap]');
  if (converterSwap) {
    const kind = converterSwap.dataset.converterSwap;
    const fromInput = document.querySelector(`#${kind}-converter-from`);
    const toInput = document.querySelector(`#${kind}-converter-to`);
    [fromInput.value, toInput.value] = [toInput.value, fromInput.value];
    renderManualConverter(kind);
    return;
  }
  const target = event.target.closest('[data-action]');
  if (!target) return;
  try {
    const action = target.dataset.action;
    if (action === 'add-todo') openTodoDialog();
    if (action === 'reset-avatar') {
      appState = await api.settings.update({ profileAvatar: '' });
      render();
      showToast('已恢复默认头像');
    }
    if (action === 'add-product') openProductDialog();
    if (action === 'set-product-deadline') {
      openProductDeadlineDialog(appState.products.find((product) => product.id === target.dataset.id));
    }
    if (action === 'clear-product-deadline') {
      const id = document.querySelector('#product-deadline-id').value;
      appState = await api.products.setDeadline(id, '');
      document.querySelector('#product-deadline-dialog').close();
      showToast('已清除截止日期');
    }
    if (action === 'toggle-todo') appState = await api.todos.toggle(target.dataset.id);
    if (action === 'restore-todo') {
      appState = await api.todos.restore(target.dataset.id);
      showToast(target.textContent.trim() === '移到今日' ? '已移到今日，原提醒时间已清除' : '待办已重新启用');
    }
    if (action === 'delete-todo' && confirm(target.dataset.fixed === 'true' ? '确定删除整个固定待办计划及其历史记录吗？' : '确定删除这项待办吗？')) appState = await api.todos.remove(target.dataset.id);
    if (action === 'delete-product' && confirm('确定删除这个产品吗？')) appState = await api.products.remove(target.dataset.id);
    if (action === 'refresh-all') {
      showToast('正在刷新产品状态…');
      appState = await api.products.refreshAll();
    }
    if (action === 'refresh-product') {
      showToast('正在刷新该产品…');
      appState = await api.products.refreshOne(target.dataset.id);
    }
    if (action === 'open-product') await api.products.open(target.dataset.asin);
    if (action === 'open-daily-rating') await api.daily.openRating(target.dataset.asin);
    if (action === 'open-daily-report') await openDailyReport();
    if (action === 'daily-launch-pages') {
      await api.daily.launchPages();
      showToast('已打开领星 ERP 与浏览器插件');
    }
    if (action === 'daily-inspect-wps') {
      dailyEnvironment.textContent = '正在识别已打开的 WPS 日表…';
      dailyEnvironment.className = 'environment-state working';
      const inspected = await api.daily.inspectWps();
      const labels = (inspected.workbooks || []).map((item) => `${item.asin} · ${item.workbookName}`);
      dailyEnvironment.textContent = labels.length ? `已识别：${labels.join('；')}` : '未识别到 WPS 日表';
      dailyEnvironment.className = `environment-state ${labels.length ? 'ready' : 'failed'}`;
    }
    if (action === 'open-shipping-planner') await openShippingPlanner();
    if (action === 'open-shipping-products') await openShippingProducts();
    if (action === 'add-shipping-product') openShippingProductEditor();
    if (action === 'edit-shipping-product') {
      const product = shippingProducts.find((item) => item.sku === target.dataset.sku);
      if (product) openShippingProductEditor(product);
    }
    if (action === 'delete-shipping-product' && confirm(`确定删除 SKU ${target.dataset.sku} 吗？`)) {
      const result = await api.shipping.deleteProduct(target.dataset.sku);
      shippingProducts = result.products || [];
      renderShippingProducts();
      showToast('产品资料已删除');
    }
    if (action === 'open-shipping-output') await api.shipping.openOutput(shippingLastResult?.outputDir);
    if (action === 'open-unit-converter') openUnitConverter();
    if (action === 'open-keyword-rank') await openKeywordRank();
    if (action === 'choose-keyword-rank-output') {
      const selected = await api.keywordRank.chooseOutput();
      if (selected) {
        keywordRankOutput.value = selected;
        await saveKeywordRankConfig();
      }
    }
    if (action === 'edit-keyword-rank-job') {
      const index = Number(target.dataset.index);
      if (keywordRankJobs[index]) {
        resetKeywordRankEditor(keywordRankJobs[index], index);
        keywordRankAsin.focus();
      }
    }
    if (action === 'cancel-keyword-rank-edit') resetKeywordRankEditor();
    if (action === 'remove-keyword-rank-job') {
      const index = Number(target.dataset.index);
      if (keywordRankJobs[index]) {
        const previous = keywordRankJobs.map((job) => ({ ...job, keywords: [...job.keywords] }));
        keywordRankJobs.splice(index, 1);
        try {
          await saveKeywordRankConfig();
          resetKeywordRankEditor();
          renderKeywordRankJobs();
          renderKeywordRankJob();
        } catch (error) {
          keywordRankJobs = previous;
          throw error;
        }
      }
    }
    if (action === 'open-keyword-rank-output') {
      await api.keywordRank.openOutput(keywordRankJob?.outputDir || keywordRankOutput.value);
    }
    if (action === 'open-competitor-images') {
      toolsDialog.close();
      competitorJob = await api.competitor.get();
      renderCompetitorJob();
      competitorDialog.showModal();
      if (!competitorJob) competitorAsins.focus();
    }
    render();
  } catch (error) {
    showToast(error.message || String(error));
  }
});

function syncTodoRecurrenceFields() {
  const fixed = document.querySelector('#todo-kind').value === 'fixed';
  document.querySelector('#recurrence-field').hidden = !fixed;
  document.querySelector('#weekday-field').hidden = !fixed || document.querySelector('#todo-recurrence').value !== 'weekly';
}

document.querySelector('#todo-kind').addEventListener('change', syncTodoRecurrenceFields);
document.querySelector('#todo-recurrence').addEventListener('change', syncTodoRecurrenceFields);

document.querySelector('#todo-form').addEventListener('submit', async (event) => {
  if (event.submitter?.value === 'cancel') return;
  event.preventDefault();
  try {
    const due = document.querySelector('#todo-due').value;
    appState = await api.todos.add({
      title: document.querySelector('#todo-title').value,
      kind: document.querySelector('#todo-kind').value,
      recurrence: document.querySelector('#todo-recurrence').value,
      weekdays: [...document.querySelectorAll('input[name="todo-weekday"]:checked')]
        .map((input) => Number(input.value)),
      dueAt: due ? new Date(due).toISOString() : null,
    });
    todoDialog.close();
    render();
    showToast('待办已保存');
  } catch (error) {
    showToast(error.message || String(error));
  }
});

document.querySelector('#product-form').addEventListener('submit', async (event) => {
  if (event.submitter?.value === 'cancel') return;
  event.preventDefault();
  try {
    const existingIds = new Set(appState.products.map((product) => product.id));
    appState = await api.products.add({
      name: document.querySelector('#product-name').value,
      asin: document.querySelector('#product-asin').value,
      deadline: document.querySelector('#product-deadline').value,
    });
    productDialog.close();
    render();
    const added = appState.products.find((product) => !existingIds.has(product.id));
    if (!added) {
      showToast('该 ASIN 已经存在');
      return;
    }
    showToast('产品已添加，正在首次查询…');
    appState = await api.products.refreshOne(added.id);
    render();
  } catch (error) {
    showToast(error.message || String(error));
  }
});

document.querySelector('#product-deadline-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    appState = await api.products.setDeadline(
      document.querySelector('#product-deadline-id').value,
      document.querySelector('#product-deadline-value').value,
    );
    document.querySelector('#product-deadline-dialog').close();
    render();
    showToast('截止日期已更新');
  } catch (error) {
    showToast(error.message || String(error));
  }
});

dailyGroupForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const source = dailyProductFile.value.trim();
  const keyword = dailyKeywordFile.value.trim();
  if (!source && !keyword) {
    showToast('请至少选择产品表现表或关键词表');
    return;
  }
  const asinInput = dailyGroupAsin.value.trim();
  const asin = inferDailyAsin(asinInput, keyword, source);
  if (asinInput && !inferDailyAsin(asinInput)) {
    showToast('目标 ASIN 格式不正确');
    return;
  }
  dailyGroups.push({
    id: cryptoRandomId(),
    name: dailyGroupName.value.trim() || asin || `组${dailyGroups.length + 1}`,
    asin,
    source,
    keyword,
  });
  if (!dailyTrafficAsin.value.trim()) dailyTrafficAsin.value = uniqueDailyGroupAsin();
  try {
    await saveDailyConfig();
    dailyGroupForm.reset();
    dailyProductFile.value = '';
    dailyKeywordFile.value = '';
    renderDailyGroups();
    resetDailyRunPanel();
    setDailyBusy(false);
  } catch (error) {
    dailyGroups.pop();
    showToast(error.message || String(error));
  }
});

dailyIncludeRatings.addEventListener('change', () => {
  saveDailyConfig().catch((error) => showToast(error.message || String(error)));
});

dailyStart.addEventListener('click', async () => {
  if (!dailyGroups.length) return;
  resetDailyRunPanel();
  dailyRunPanel.hidden = false;
  dailyEnvironment.textContent = '正在连接 WPS 并准备写入…';
  dailyEnvironment.className = 'environment-state working';
  setDailyBusy(true, '正在填写，请稍候…');
  try {
    const result = await api.daily.run({
      groups: dailyGroups,
      includeRatings: dailyIncludeRatings.checked,
    });
    renderDailyResult(result);
    dailyEnvironment.textContent = result.message || '每日数据已填写并保存';
    dailyEnvironment.className = 'environment-state ready';
  } catch (error) {
    renderDailyResult({
      message: '处理失败',
      groups: dailyGroups.map((group) => ({
        ...group,
        ok: false,
        error: error.message || String(error),
        ratingFallback: Boolean(group.asin),
      })),
    });
    dailyEnvironment.textContent = error.message || String(error);
    dailyEnvironment.className = 'environment-state failed';
  } finally {
    setDailyBusy(false);
  }
});

dailyTrafficStart.addEventListener('click', async () => {
  resetDailyRunPanel();
  dailyRunPanel.hidden = false;
  setDailyBusy(true, '流量词处理中…');
  dailyEnvironment.textContent = '正在准备 xydc 流量词抓取…';
  dailyEnvironment.className = 'environment-state working';
  try {
    const result = await api.daily.traffic({
      asin: dailyTrafficAsin.value.trim(),
      groups: dailyGroups,
    });
    dailyStatus.textContent = '流量词已写入';
    dailyProgressCount.textContent = `${result.asin || ''}`;
    dailyResultList.innerHTML = `<div class="daily-result-row"><div><strong>${escapeHtml(result.asin)}</strong><small>${escapeHtml(result.workbook || '')} · ${escapeHtml(result.targetDate || '')}</small></div><span>总 ${result.total} · 自然 ${result.organic} · 广告 ${result.ad}</span></div>`;
    dailyEnvironment.textContent = 'xydc 流量词已写入 WPS 并保存';
    dailyEnvironment.className = 'environment-state ready';
  } catch (error) {
    dailyStatus.textContent = '流量词处理失败';
    dailyEnvironment.textContent = error.message || String(error);
    dailyEnvironment.className = 'environment-state failed';
  } finally {
    setDailyBusy(false);
  }
});

keywordRankKeywords.addEventListener('input', updateKeywordRankKeywordCount);

keywordRankForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const asin = keywordRankAsin.value.trim().toUpperCase();
  const postcode = keywordRankPostcode.value.trim();
  const keywords = parseKeywordRankKeywords();
  if (!/^[A-Z0-9]{10}$/.test(asin)) {
    showToast('请输入正确的 10 位 ASIN');
    return;
  }
  if (!/^\d{5}(?:-\d{4})?$/.test(postcode)) {
    showToast('请输入正确的美国邮编');
    return;
  }
  if (!keywords.length || keywords.length > 300) {
    showToast(keywords.length ? '单个 ASIN 最多 300 个关键词' : '请至少输入一个关键词');
    return;
  }
  const duplicateIndex = keywordRankJobs.findIndex((job, index) =>
    job.asin === asin && index !== keywordRankEditingIndex);
  if (duplicateIndex >= 0) {
    showToast('该 ASIN 已在队列中，请编辑原任务');
    return;
  }

  const previous = keywordRankJobs.map((job) => ({ ...job, keywords: [...job.keywords] }));
  const wasEditing = keywordRankEditingIndex >= 0;
  const next = {
    asin,
    postcode,
    keywords,
    excludePreviouslyViewed: keywordRankExclude.checked,
  };
  if (keywordRankEditingIndex >= 0) keywordRankJobs[keywordRankEditingIndex] = next;
  else keywordRankJobs.push(next);
  try {
    await saveKeywordRankConfig();
    resetKeywordRankEditor();
    renderKeywordRankJobs();
    renderKeywordRankJob();
    showToast(wasEditing ? '查询任务已更新' : '已加入查询队列');
  } catch (error) {
    keywordRankJobs = previous;
    showToast(error.message || String(error));
  }
});

keywordRankStart.addEventListener('click', async () => {
  if (!keywordRankJobs.length || !keywordRankEnvironmentReady) return;
  try {
    await saveKeywordRankConfig();
    keywordRankJob = await api.keywordRank.start({
      jobs: keywordRankJobs,
      outputDir: keywordRankOutput.value.trim(),
    });
    renderKeywordRankJobs();
    renderKeywordRankJob();
  } catch (error) {
    showToast(error.message || String(error));
  }
});

competitorAsins.addEventListener('input', countCompetitorAsins);

document.querySelector('#competitor-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    competitorJob = await api.competitor.start({
      asins: competitorAsins.value,
      showBrowser: competitorShowBrowser.checked,
    });
    renderCompetitorJob();
  } catch (error) {
    showToast(error.message || String(error));
  }
});

competitorSave.addEventListener('click', async () => {
  try {
    const result = await api.competitor.save(competitorJob?.id);
    if (!result.canceled) showToast('Excel 已保存到所选位置');
  } catch (error) {
    showToast(error.message || String(error));
  }
});

shippingProductSearch.addEventListener('input', renderShippingProducts);

shippingProductEditorForm.addEventListener('submit', async (event) => {
  if (event.submitter?.value !== 'save') return;
  event.preventDefault();
  try {
    const result = await api.shipping.saveProduct({
      sku: shippingEditingSku || shippingProductSku.value,
      fnsku: shippingProductFnsku.value,
      name: shippingProductName.value,
    });
    shippingProducts = result.products || [];
    shippingProductEditorDialog.close('saved');
    renderShippingProducts();
    showToast(shippingEditingSku ? '产品资料已更新' : '产品资料已添加');
  } catch (error) {
    showToast(error.message || String(error));
  }
});

shippingForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  shippingStart.disabled = true;
  shippingStart.textContent = '正在检查产品库…';
  shippingEnvironment.textContent = '正在解析 PDF 并核对 SKU、FNSKU 与产品名称…';
  shippingEnvironment.className = 'environment-state working';
  shippingLastResult = null;
  renderShippingResult();
  try {
    const inspected = await api.shipping.inspect({ pdfPaths: shippingPdfPaths });
    let productOverrides = [];
    if ((inspected.missing || []).length) {
      shippingEnvironment.textContent = `发现 ${inspected.missing.length} 个产品资料不完整，请先补全`;
      const supplemented = await requestMissingShippingProducts(inspected.missing);
      if (!supplemented) {
        shippingEnvironment.textContent = '已取消生成，未修改产品库';
        shippingEnvironment.className = 'environment-state';
        return;
      }
      productOverrides = supplemented.products;
      if (supplemented.save) {
        const saved = await api.shipping.saveProducts(productOverrides);
        shippingProducts = saved.products || [];
      }
    }
    shippingStart.textContent = '正在解析并生成…';
    shippingEnvironment.textContent = '产品资料已齐全，正在处理 PDF、匹配 BTW 并写入 Excel…';
    shippingLastResult = await api.shipping.run({
      pdfPaths: shippingPdfPaths,
      store: shippingStore.value,
      date: shippingDate.value,
      transport: shippingTransport.value,
      deliveryDays: Number(shippingDeliveryDays.value),
      person: shippingPerson.value,
      locked: shippingLocked.checked,
      btwDir: shippingBtw.value,
      outputDir: shippingOutput.value,
      productOverrides,
    });
    shippingEnvironment.textContent = `已生成 ${(shippingLastResult.skus || []).length} 个 SKU 的发货计划`;
    shippingEnvironment.className = 'environment-state ready';
    renderShippingResult();
  } catch (error) {
    shippingEnvironment.textContent = error.message || String(error);
    shippingEnvironment.className = 'environment-state failed';
  } finally {
    shippingStart.disabled = false;
    shippingStart.textContent = '开始生成发货计划';
  }
});

for (const kind of ['length', 'weight']) {
  document.querySelector(`#${kind}-converter-value`).addEventListener('input', () => renderManualConverter(kind));
  document.querySelector(`#${kind}-converter-from`).addEventListener('change', () => renderManualConverter(kind));
  document.querySelector(`#${kind}-converter-to`).addEventListener('change', () => renderManualConverter(kind));
}

smartConverterInput.addEventListener('input', renderSmartConverter);
smartConverterSource.addEventListener('change', renderSmartConverter);
smartConverterTarget.addEventListener('change', renderSmartConverter);

avatarButton.addEventListener('click', () => avatarInput.click());
avatarImage.addEventListener('error', () => {
  avatarImage.src = DEFAULT_AVATAR_SOURCE;
  renderedAvatarSource = DEFAULT_AVATAR_SOURCE;
});
avatarInput.addEventListener('change', async () => {
  const [file] = avatarInput.files || [];
  if (!file) return;
  try {
    const profileAvatar = await createAvatarDataUrl(file);
    appState = await api.settings.update({ profileAvatar });
    render();
    showToast('头像已更新');
  } catch (error) {
    showToast(error.message || String(error));
  } finally {
    avatarInput.value = '';
  }
});

settingsList.addEventListener('change', async (event) => {
  const input = event.target.closest('[data-setting]');
  if (!input) return;
  try {
    appState = await api.settings.update({ [input.dataset.setting]: input.tagName === 'SELECT' ? input.value : input.checked });
    render();
  } catch (error) {
    showToast(error.message || String(error));
  }
});

document.querySelector('#tools-button').addEventListener('click', () => {
  renderTools();
  toolsDialog.showModal();
});

document.querySelector('#history-button').addEventListener('click', () => {
  historyFilter = 'all';
  renderHistory();
  historyDialog.showModal();
});

document.querySelector('#settings-button').addEventListener('click', () => {
  renderSettings();
  settingsDialog.showModal();
});

document.querySelector('#dock-button').addEventListener('click', async () => {
  dockState = await api.window.toggleDock();
  render();
});

document.querySelector('#pin-button').addEventListener('click', async () => {
  dockState = await api.window.togglePin();
  render();
  showToast(dockState.pinned ? '窗口已置顶' : '已取消窗口置顶');
});

document.querySelector('#minimize-button').addEventListener('click', () => api.window.minimize());
document.querySelector('#close-button').addEventListener('click', () => api.window.closeToTray());

function requestDockHide() {
  if (dockState.docked && !dockState.pinned) {
    api.window.hideDocked();
  }
}

const dockDialogs = [...document.querySelectorAll('dialog')];
const syncDockDialogState = () => {
  // HTML 工具窗口属于当前工作台：吸顶状态下允许一起收起，重新展开时保留现场。
  // 置顶拥有更高优先级，本身就会阻止 DockController 自动收起。
  api.window.setAutoHidePaused(false);
};
const dockDialogObserver = new MutationObserver(syncDockDialogState);
dockDialogs.forEach((dialog) => dockDialogObserver.observe(dialog, {
  attributes: true,
  attributeFilter: ['open'],
}));

document.documentElement.addEventListener('mouseleave', requestDockHide);
document.querySelector('.app-window').addEventListener('pointerleave', requestDockHide);

async function start() {
  document.querySelector('#today-label').textContent = `${formatToday()} · 今天需要处理的事项`;
  [appState, tools, dockState] = await Promise.all([
    api.state.get(),
    api.tools.list(),
    api.window.getDockState(),
  ]);
  syncDockDialogState();
  api.state.onChanged((state) => {
    appState = state;
    render();
  });
  api.products.onRefreshProgress((progress) => {
    refreshProgress = progress?.total ? progress : null;
    render();
  });
  api.window.onDockState((state) => {
    dockState = state;
    syncDockDialogState();
    render();
  });
  api.competitor.onProgress((job) => {
    competitorJob = job;
    renderCompetitorJob();
  });
  api.keywordRank.onProgress((job) => {
    keywordRankJob = job;
    if (keywordRankDialog.open) {
      renderKeywordRankJobs();
      renderKeywordRankJob();
    }
  });
  api.daily.onProgress((progress) => {
    if (dailyDialog.open) handleDailyProgress(progress);
  });
  countCompetitorAsins();
  renderCompetitorJob();
  render();
  api.products.startupRefresh().then((state) => {
    appState = state;
    render();
  }).catch((error) => showToast(error.message || String(error)));
}

start().catch((error) => {
  document.querySelector('#main-content').innerHTML = `<div class="empty-state"><strong>初始化失败</strong><p>${escapeHtml(error.message || String(error))}</p></div>`;
});
