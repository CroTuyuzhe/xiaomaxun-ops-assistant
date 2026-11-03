const path = require('node:path');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const crypto = require('node:crypto');
const {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  nativeImage,
  Notification,
  shell,
  Tray,
  screen,
} = require('electron');
const { DockController } = require('./dock-controller.cjs');
const { LocalStore } = require('./local-store.cjs');
const { todoOccursOnDate } = require('./todo-schedule.cjs');
const { normalizeProfileAvatar } = require('./profile-avatar.cjs');
const { normalizeAsin, queryAmazonProduct } = require('./product-status.cjs');
const { TOOLS } = require('./tool-manifest.cjs');
const {
  checkShippingPlanner,
  inspectShippingPdfs,
  runShippingPlanner,
} = require('../tools/shipping-planner/runner.cjs');
const {
  ShippingProductLibrary,
  normalizeProduct: normalizeShippingProduct,
  shippingProductDataDir,
} = require('../tools/shipping-planner/product-library.cjs');
const {
  checkDailyReport,
  inspectDailyWps,
  runDailyFill,
  writeDailyTraffic,
} = require('../tools/daily-report/runner.cjs');
const {
  launchWorkPages,
  scrapeXydcTraffic,
} = require('../tools/daily-report/xydc.cjs');
const { resolveDailyTrafficTarget } = require('../tools/daily-report/target.cjs');
const {
  checkKeywordRankEnvironment,
  normalizeKeywordJobs,
  runKeywordRank,
} = require('../tools/keyword-rank/runner.cjs');

app.setName('小马逊运营助手');
app.setAppUserModelId('com.xiaodai.xiaomaxun');
// 运营工具不依赖 3D 渲染；关闭硬件加速可减少旧显卡或远程桌面环境中的 GPU 崩溃。
app.disableHardwareAcceleration();
const smokeMode = process.env.XIAOMAXUN_SMOKE === '1';
if (process.env.XIAOMAXUN_USER_DATA) {
  app.setPath('userData', path.resolve(process.env.XIAOMAXUN_USER_DATA));
}

let ballWindow = null;
let ballDrag = null;
let ballDragTimer = null;
function ballMode() { return store?.getState().settings.windowMode === 'ball'; }
function openMain() {
  ballWindow?.hide();
  return dockController?.openNormal();
}
function collapseMain() {
  if (!ballMode()) return dockController?.hideToTray();
  if (!ballWindow) {
    const area = screen.getDisplayMatching(mainWindow.getBounds()).workArea;
    ballWindow = new BrowserWindow({
      width: 48, height: 48, x: area.x + area.width - 64, y: area.y + 120,
      frame: false, transparent: true, resizable: false, skipTaskbar: true,
      alwaysOnTop: true, show: false, hasShadow: false,
      webPreferences: { preload: path.join(__dirname, '..', 'preload', 'ball.cjs'),
        contextIsolation: true, nodeIntegration: false, sandbox: true },
    });
    ballWindow.loadFile(path.join(__dirname, '..', 'renderer', 'ball.html'));
    ballWindow.on('closed', () => { ballWindow = null; });
    ballWindow.once('ready-to-show', () => {
      if (ballMode() && !mainWindow.isVisible()) ballWindow.showInactive();
    });
  }
  dockController?.undock({ show: false });
  dockController?.hideToTray();
  const bounds = ballWindow.getBounds();
  const area = screen.getDisplayMatching(bounds).workArea;
  ballWindow.setPosition(Math.round(Math.max(area.x, Math.min(bounds.x, area.x + area.width - 48))),
    Math.round(Math.max(area.y, Math.min(bounds.y, area.y + area.height - 48))));
  if (!ballWindow.webContents.isLoading()) ballWindow.showInactive();
}
let mainWindow = null;
let tray = null;
let store = null;
let dockController = null;
let isQuitting = false;
let startupRefreshStarted = false;
let refreshingProducts = false;
let competitorJob = null;
let keywordRankJob = null;
let shippingPlannerRunning = false;
let dailyReportRunning = false;
let dailyTrafficRunning = false;

function shippingProductLibrary() {
  return new ShippingProductLibrary(shippingProductDataDir(app));
}

function normalizeShippingPdfPaths(input) {
  const rawPaths = Array.isArray(input?.pdfPaths) ? input.pdfPaths : [input?.pdfPath].filter(Boolean);
  const pdfPaths = [...new Map(rawPaths.map((value) => {
    const resolved = path.resolve(String(value || ''));
    return [resolved.toLowerCase(), resolved];
  })).values()];
  if (!pdfPaths.length || pdfPaths.some((pdfPath) => !fs.existsSync(pdfPath) || path.extname(pdfPath).toLowerCase() !== '.pdf')) {
    throw new Error('请选择有效的箱唛 PDF 文件');
  }
  return pdfPaths;
}

function appIconPath() {
  return path.join(__dirname, '..', 'assets', 'app-icon.png');
}

function createTrayIcon() {
  const brandedIcon = nativeImage.createFromPath(appIconPath());
  if (!brandedIcon.isEmpty()) return brandedIcon.resize({ width: 20, height: 20 });
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><rect width="32" height="32" rx="7" fill="#131921"/><path d="M7 21c5 4 13 4 18 0" fill="none" stroke="#ff9900" stroke-width="2.5" stroke-linecap="round"/><path d="M22 20l4 1-2 3" fill="#ff9900"/><text x="16" y="18" text-anchor="middle" font-family="Arial" font-weight="700" font-size="13" fill="white">XM</text></svg>`;
  const dataUrl = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
  return nativeImage.createFromDataURL(dataUrl).resize({ width: 20, height: 20 });
}

function sendToRenderer(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, payload);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 500,
    height: 820,
    minWidth: 430,
    minHeight: 700,
    show: false,
    title: '小马逊运营助手',
    icon: appIconPath(),
    backgroundColor: '#eaeded',
    frame: false,
    roundedCorners: true,
    thickFrame: true,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'index.cjs'),
      // WPS/浏览器会遮挡主窗口；后台也持续渲染任务进度和完成状态。
      backgroundThrottling: false,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  dockController = new DockController(
    mainWindow,
    (state) => sendToRenderer('window:dock-state', state),
    { pinned: Boolean(store.getState().settings.alwaysOnTop) },
  );
  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  mainWindow.once('ready-to-show', () => {
    if (smokeMode) {
      setTimeout(() => {
        isQuitting = true;
        app.quit();
      }, 500);
    } else {
      mainWindow.show();
    }
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url !== mainWindow.webContents.getURL()) event.preventDefault();
  });
  mainWindow.on('close', (event) => {
    if (isQuitting) return;
    event.preventDefault();
    collapseMain();
  });
  mainWindow.on('show', () => ballWindow?.hide());
  mainWindow.on('minimize', (event) => {
    if (ballMode()) { event.preventDefault(); collapseMain(); }
  });
  mainWindow.on('closed', () => {
    dockController?.destroy();
    dockController = null;
    mainWindow = null;
  });
}

function createTray() {
  if (!tray) {
    tray = new Tray(createTrayIcon());
    tray.on('double-click', () => openMain());
  }
  tray.setToolTip('小马逊运营助手');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '打开主界面', click: () => openMain() },
    { label: '吸顶隐藏', visible: !ballMode(), click: () => dockController?.dock() },
    { type: 'separator' },
    {
      label: '退出软件',
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]));
}

function dateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function loginExecutablePath() {
  return process.env.PORTABLE_EXECUTABLE_FILE || process.execPath;
}

function updateLaunchAtLogin(enabled) {
  if (!app.isPackaged) {
    return store.update((state) => {
      state.settings.launchAtLogin = Boolean(enabled);
      return state;
    });
  }
  app.setLoginItemSettings({
    openAtLogin: Boolean(enabled),
    path: loginExecutablePath(),
  });
  const actual = app.getLoginItemSettings({ path: loginExecutablePath() }).openAtLogin;
  return store.update((state) => {
    state.settings.launchAtLogin = actual;
    return state;
  });
}

function syncLaunchAtLoginState() {
  if (!app.isPackaged) return store.getState();
  const actual = app.getLoginItemSettings({ path: loginExecutablePath() }).openAtLogin;
  return store.update((state) => {
    state.settings.launchAtLogin = actual;
    return state;
  });
}

function todoCompletedToday(todo, today) {
  return todo.kind === 'fixed' ? (todo.completedDates || []).includes(today) : Boolean(todo.completed);
}

function checkTodoNotifications() {
  if (!store) return;
  const now = new Date();
  const today = dateKey(now);
  const previousTodos = store.getState().todos;
  const state = store.syncProductDeadlineTodos(today);
  if (JSON.stringify(previousTodos) !== JSON.stringify(state.todos)) {
    sendToRenderer('state:changed', state);
  }
  if (!Notification.isSupported()) return;
  if (!state.settings.notificationsEnabled) return;
  const due = state.todos.filter((todo) => {
    if (todoCompletedToday(todo, today) || !todoOccursOnDate(todo, now)) return false;
    if (!todo.dueAt) return false;
    const dueAt = new Date(todo.dueAt);
    if (Number.isNaN(dueAt.getTime())) return false;
    const effectiveDue = todo.kind === 'fixed'
      ? new Date(now.getFullYear(), now.getMonth(), now.getDate(), dueAt.getHours(), dueAt.getMinutes())
      : dueAt;
    return effectiveDue <= now && todo.lastNotifiedAt !== today;
  });
  if (!due.length) return;

  new Notification({
    title: '小马逊运营助手',
    body: due.length === 1 ? `待办：${due[0].title}` : `有 ${due.length} 项待办需要处理`,
  }).show();
  store.update((draft) => {
    const ids = new Set(due.map((item) => item.id));
    draft.todos.forEach((todo) => {
      if (ids.has(todo.id)) todo.lastNotifiedAt = today;
    });
    return draft;
  });
}

async function refreshProducts(ids = null) {
  if (refreshingProducts) return store.getState();
  refreshingProducts = true;
  try {
    const state = store.getState();
    const selected = state.products.filter((product) => !ids || ids.includes(product.id));
    for (let index = 0; index < selected.length; index += 1) {
      const product = selected[index];
      sendToRenderer('products:refresh-progress', {
        current: product.id,
        completed: index,
        total: selected.length,
      });
      const status = await queryAmazonProduct(product.asin);
      store.updateProductStatus(product.id, status);
      sendToRenderer('state:changed', store.getState());
    }
    sendToRenderer('products:refresh-progress', {
      current: null,
      completed: selected.length,
      total: selected.length,
    });
    return store.getState();
  } finally {
    refreshingProducts = false;
  }
}

function competitorResultPreview(result) {
  return {
    asin: result.asin,
    title: result.title || '',
    error: result.error || null,
    galleryCount: result.galleryImages?.length || 0,
    aplusCount: result.aplusImages?.length || 0,
    warnings: result.warnings || [],
  };
}

function publicCompetitorJob(job = competitorJob) {
  if (!job) return null;
  return {
    id: job.id,
    status: job.status,
    progress: job.progress,
    results: job.previewResults || [],
    error: job.error || null,
    downloadReady: Boolean(job.outputPath),
    createdAt: job.createdAt,
  };
}

function emitCompetitorJob() {
  sendToRenderer('competitor:progress', publicCompetitorJob());
}

function publicKeywordRankJob(job = keywordRankJob) {
  if (!job) return null;
  return {
    id: job.id,
    status: job.status,
    progress: job.progress,
    results: job.results || [],
    error: job.error || null,
    outputDir: job.outputDir || '',
    createdAt: job.createdAt,
  };
}

function emitKeywordRankJob() {
  sendToRenderer('keyword-rank:progress', publicKeywordRankJob());
}

async function runKeywordRankJob(job, options) {
  try {
    job.status = 'running';
    emitKeywordRankJob();
    const dataDir = path.join(app.getPath('userData'), 'tools', 'keyword-rank');
    const completed = await runKeywordRank({
      jobs: options.jobs,
      outputDir: options.outputDir,
      dataDir,
    }, (progress) => {
      job.progress = { ...progress };
      if (progress.result) {
        const next = { ...progress.result };
        const current = job.results.findIndex((item) => item.asin === next.asin);
        if (current >= 0) job.results[current] = next;
        else job.results.push(next);
        delete job.progress.result;
      }
      emitKeywordRankJob();
    });
    job.status = 'completed';
    job.outputDir = completed.outputDir;
    job.results = completed.results;
    job.progress = {
      phase: 'completed',
      message: `全部完成，已生成 ${completed.results.length} 份 Excel`,
      completedJobs: completed.results.length,
      totalJobs: completed.results.length,
    };
  } catch (error) {
    job.status = 'failed';
    job.error = error.message || String(error);
    job.progress = {
      ...(job.progress || {}),
      phase: 'failed',
      message: job.error,
    };
  }
  emitKeywordRankJob();
}

async function runCompetitorJob(job, options) {
  try {
    const { scrapeProducts } = require('../tools/competitor-images/scraper.cjs');
    const { buildWorkbook } = require('../tools/competitor-images/workbook.cjs');
    job.status = 'running';
    emitCompetitorJob();
    const dataDir = path.join(app.getPath('userData'), 'tools', 'competitor-images');
    const results = await scrapeProducts({
      asins: options.asins,
      headless: options.headless,
      includeBrandStory: false,
      dataDir,
      onProgress: (progress) => {
        job.progress = { ...progress };
        delete job.progress.result;
        if (progress.result) {
          const preview = competitorResultPreview(progress.result);
          const current = job.previewResults.findIndex((item) => item.asin === preview.asin);
          if (current >= 0) job.previewResults[current] = preview;
          else job.previewResults.push(preview);
        }
        emitCompetitorJob();
      },
    });
    job.status = 'exporting';
    job.progress = {
      phase: 'exporting',
      message: '图片采集完成，正在生成 Excel…',
      completed: options.asins.length,
      total: options.asins.length,
    };
    emitCompetitorJob();
    const exportDir = path.join(dataDir, 'exports');
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    job.outputPath = path.join(exportDir, `Amazon竞品图片汇总_${stamp}.xlsx`);
    await buildWorkbook(results, job.outputPath);
    job.status = 'completed';
    job.progress = {
      phase: 'completed',
      message: '采集完成，可以保存 Excel。',
      completed: options.asins.length,
      total: options.asins.length,
    };
  } catch (error) {
    job.status = 'failed';
    job.error = error.message || String(error);
    job.progress = {
      phase: 'failed',
      message: job.error,
      completed: job.progress?.completed || 0,
      total: job.progress?.total || options.asins.length,
    };
  }
  emitCompetitorJob();
}

function registerIpc() {
  ipcMain.handle('ball:avatar', (event) => {
    if (event.sender !== ballWindow?.webContents) return '';
    return store.getState().settings.profileAvatar || '';
  });
  ipcMain.on('ball:start', (event) => {
    if (event.sender !== ballWindow?.webContents) return;
    clearInterval(ballDragTimer);
    ballDrag = { cursor: screen.getCursorScreenPoint(), bounds: ballWindow.getBounds(), moved: false };
    ballDragTimer = setInterval(() => {
      if (!ballDrag || !ballWindow || ballWindow.isDestroyed()) return;
      const cursor = screen.getCursorScreenPoint();
      const dx = cursor.x - ballDrag.cursor.x, dy = cursor.y - ballDrag.cursor.y;
      if (Math.abs(dx) + Math.abs(dy) > 5) ballDrag.moved = true;
      if (!ballDrag.moved) return;
      const area = screen.getDisplayNearestPoint(cursor).workArea;
      ballWindow.setPosition(Math.round(Math.max(area.x, Math.min(ballDrag.bounds.x + dx, area.x + area.width - 48))),
        Math.round(Math.max(area.y, Math.min(ballDrag.bounds.y + dy, area.y + area.height - 48))));
    }, 16);
  });
  ipcMain.on('ball:end', (event, cancelled) => {
    if (event.sender !== ballWindow?.webContents) return;
    clearInterval(ballDragTimer);
    const clicked = ballDrag && !ballDrag.moved && !cancelled;
    ballDrag = null;
    if (clicked) openMain();
  });
  ipcMain.handle('state:get' , () => store.syncProductDeadlineTodos(dateKey()));
  ipcMain.handle('settings:update', (_event, changes) => {
    const next = store.update((state) => {
      const allowed = ['notificationsEnabled', 'startupProductRefresh'];
      for (const key of allowed) {
        if (Object.hasOwn(changes || {}, key)) state.settings[key] = Boolean(changes[key]);
      }
      if (Object.hasOwn(changes || {}, 'profileAvatar')) {
        state.settings.profileAvatar = normalizeProfileAvatar(changes.profileAvatar);
      }
      if (Object.hasOwn(changes || {}, 'windowMode')) {
        if (!['float', 'ball'].includes(changes.windowMode)) throw new Error('请选择有效的窗口模式');
        state.settings.windowMode = changes.windowMode;
      }
      return state;
    });
    if (Object.hasOwn(changes || {}, 'profileAvatar')) {
      ballWindow?.webContents.send('ball:avatar-changed', next.settings.profileAvatar || '');
    }
    if (Object.hasOwn(changes || {}, 'windowMode')) {
      if (ballMode()) dockController?.undock();
      else ballWindow?.hide();
      createTray();
    }
    if (Object.hasOwn(changes || {}, 'launchAtLogin')) {
      return updateLaunchAtLogin(Boolean(changes.launchAtLogin));
    }
    return next;
  });

  ipcMain.handle('todos:add', (_event, input) => {
    const title = String(input?.title || '').trim();
    if (!title || title.length > 100) throw new Error('待办标题需为 1–100 个字符');
    return store.addTodo({ ...input, title });
  });
  ipcMain.handle('todos:toggle', (_event, id) => store.toggleTodo(String(id), dateKey()));
  ipcMain.handle('todos:restore', (_event, id) => store.restoreTodo(String(id)));
  ipcMain.handle('todos:delete', (_event, id) => store.deleteTodo(String(id)));

  ipcMain.handle('products:add', (_event, input) => {
    const asin = normalizeAsin(input?.asin);
    if (!asin) throw new Error('请输入美国站 ASIN 或 amazon.com 商品链接');
    const deadline = String(input?.deadline || '').trim();
    if (deadline && !/^\d{4}-\d{2}-\d{2}$/.test(deadline)) throw new Error('截止日期格式不正确');
    store.addProduct({ asin, name: input?.name, deadline });
    return store.syncProductDeadlineTodos(dateKey());
  });
  ipcMain.handle('products:set-deadline', (_event, id, value) => {
    const deadline = String(value || '').trim();
    if (deadline && !/^\d{4}-\d{2}-\d{2}$/.test(deadline)) throw new Error('截止日期格式不正确');
    store.setProductDeadline(String(id), deadline);
    return store.syncProductDeadlineTodos(dateKey());
  });
  ipcMain.handle('products:delete', (_event, id) => {
    store.deleteProduct(String(id));
    return store.syncProductDeadlineTodos(dateKey());
  });
  ipcMain.handle('products:refresh-all', () => refreshProducts());
  ipcMain.handle('products:refresh-one', (_event, id) => refreshProducts([String(id)]));
  ipcMain.handle('products:startup-refresh', () => {
    if (startupRefreshStarted) return store.getState();
    startupRefreshStarted = true;
    if (!store.getState().settings.startupProductRefresh) return store.getState();
    return refreshProducts();
  });
  ipcMain.handle('products:open', (_event, asin) => {
    const normalized = normalizeAsin(asin);
    if (normalized) shell.openExternal(`https://www.amazon.com/dp/${normalized}?th=1`);
  });

  ipcMain.handle('tools:list', () => TOOLS);
  ipcMain.handle('keyword-rank:check', async () => checkKeywordRankEnvironment());
  ipcMain.handle('keyword-rank:choose-output', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: '选择关键词排名 Excel 输出目录',
      defaultPath: store.getState().settings.keywordRank?.outputDir || app.getPath('downloads'),
      properties: ['openDirectory', 'createDirectory'],
    });
    return result.canceled ? '' : (result.filePaths[0] || '');
  });
  ipcMain.handle('keyword-rank:save-config', (_event, input) => {
    const jobs = normalizeKeywordJobs(input?.jobs, { allowEmpty: true });
    const outputDir = String(input?.outputDir || '').trim();
    return store.update((state) => {
      state.settings.keywordRank = { jobs, outputDir };
      return state;
    });
  });
  ipcMain.handle('keyword-rank:start', (_event, input) => {
    if (keywordRankJob && ['queued', 'running'].includes(keywordRankJob.status)) {
      throw new Error('已有关键词排名任务正在运行');
    }
    const jobs = normalizeKeywordJobs(input?.jobs);
    const outputDir = String(input?.outputDir || '').trim() || app.getPath('downloads');
    store.update((state) => {
      state.settings.keywordRank = { jobs, outputDir };
      return state;
    });
    keywordRankJob = {
      id: crypto.randomUUID(),
      status: 'queued',
      progress: {
        phase: 'queued',
        message: '关键词排名任务已创建',
        completedJobs: 0,
        totalJobs: jobs.length,
      },
      results: [],
      error: null,
      outputDir,
      createdAt: new Date().toISOString(),
    };
    setImmediate(() => runKeywordRankJob(keywordRankJob, { jobs, outputDir }));
    return publicKeywordRankJob();
  });
  ipcMain.handle('keyword-rank:get', (_event, id) => {
    if (!keywordRankJob || (id && keywordRankJob.id !== id)) return null;
    return publicKeywordRankJob();
  });
  ipcMain.handle('keyword-rank:open-output', async (_event, outputDir) => {
    const target = String(outputDir || '').trim();
    if (!target || !fs.existsSync(target)) throw new Error('输出目录不存在');
    const error = await shell.openPath(target);
    if (error) throw new Error(error);
    return true;
  });
  ipcMain.handle('daily:check', async () => {
    try {
      return await checkDailyReport(app);
    } catch (error) {
      return { ready: false, error: error.message || String(error) };
    }
  });
  ipcMain.handle('daily:choose-excel', async (_event, kind) => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: kind === 'keyword' ? '选择关键词排名表' : '选择产品表现表',
      properties: ['openFile'],
      filters: [{ name: 'Excel 工作簿', extensions: ['xlsx'] }],
    });
    return result.canceled ? '' : (result.filePaths[0] || '');
  });
  ipcMain.handle('daily:save-config', (_event, input) => {
    const groups = Array.isArray(input?.groups) ? input.groups.slice(0, 30).map((group, index) => ({
      id: String(group?.id || crypto.randomUUID()),
      name: String(group?.name || `组${index + 1}`).trim().slice(0, 60),
      asin: normalizeAsin(group?.asin) || '',
      source: String(group?.source || '').trim(),
      keyword: String(group?.keyword || '').trim(),
    })).filter((group) => group.source || group.keyword) : [];
    return store.update((state) => {
      state.settings.dailyReport = {
        groups,
        includeRatings: input?.includeRatings !== false,
      };
      return state;
    });
  });
  ipcMain.handle('daily:inspect-wps', async () => {
    if (dailyReportRunning || dailyTrafficRunning) throw new Error('每日填报任务正在运行');
    return inspectDailyWps(app);
  });
  ipcMain.handle('daily:launch-pages', () => launchWorkPages());
  ipcMain.handle('daily:open-rating', (_event, asin) => {
    const normalized = normalizeAsin(asin);
    if (!normalized) throw new Error('无法打开：ASIN 格式不正确');
    return shell.openExternal(
      `https://www.amazon.com/dp/${normalized}?th=1#averageCustomerReviewsAnchor`,
    );
  });
  ipcMain.handle('daily:run', async (_event, input) => {
    if (dailyReportRunning || dailyTrafficRunning) throw new Error('已有每日填报任务正在运行');
    const rawGroups = Array.isArray(input?.groups) ? input.groups : [];
    const groups = rawGroups.slice(0, 30).map((group, index) => {
      const source = String(group?.source || '').trim();
      const keyword = String(group?.keyword || '').trim();
      const asinInput = String(group?.asin || '').trim();
      const asin = asinInput ? normalizeAsin(asinInput) : '';
      if (!source && !keyword) throw new Error(`第 ${index + 1} 组至少需要一个 Excel 文件`);
      if (asinInput && !asin) throw new Error(`第 ${index + 1} 组的 ASIN 格式不正确`);
      for (const filePath of [source, keyword].filter(Boolean)) {
        if (!fs.existsSync(filePath) || path.extname(filePath).toLowerCase() !== '.xlsx') {
          throw new Error(`Excel 文件不存在：${filePath}`);
        }
      }
      return {
        id: String(group?.id || crypto.randomUUID()),
        name: String(group?.name || `组${index + 1}`).trim().slice(0, 60),
        asin,
        source,
        keyword,
      };
    });
    if (!groups.length) throw new Error('请先添加至少一个文件组');
    store.update((state) => {
      state.settings.dailyReport = { groups, includeRatings: input?.includeRatings !== false };
      return state;
    });
    dailyReportRunning = true;
    try {
      return await runDailyFill(app, {
        groups,
        includeRatings: input?.includeRatings !== false,
      }, (progress) => sendToRenderer('daily:progress', progress));
    } finally {
      dailyReportRunning = false;
    }
  });
  ipcMain.handle('daily:traffic', async (_event, input) => {
    if (dailyReportRunning || dailyTrafficRunning) throw new Error('已有每日填报任务正在运行');
    dailyTrafficRunning = true;
    try {
      const inspected = await inspectDailyWps(app);
      const savedGroups = store.getState().settings.dailyReport?.groups || [];
      const target = resolveDailyTrafficTarget({
        asin: input?.asin,
        groups: Array.isArray(input?.groups) && input.groups.length ? input.groups : savedGroups,
      }, inspected);
      const asin = target.asin;
      sendToRenderer('daily:progress', {
        phase: 'traffic_target',
        message: target.source === 'active-workbook'
          ? `已自动使用当前 WPS 日表：${asin}`
          : `已确定流量词目标：${asin}`,
      });
      const dataDir = path.join(app.getPath('userData'), 'tools', 'daily-report');
      const traffic = await scrapeXydcTraffic({
        asin,
        dataDir,
        onProgress: (progress) => sendToRenderer('daily:progress', progress),
      });
      sendToRenderer('daily:progress', { phase: 'traffic_writing', message: '正在写入 WPS 日表…' });
      const written = await writeDailyTraffic(app, traffic,
        (progress) => sendToRenderer('daily:progress', progress));
      return { ...traffic, ...written, ok: true };
    } finally {
      dailyTrafficRunning = false;
    }
  });
  ipcMain.handle('shipping:check', async () => {
    try {
      return await checkShippingPlanner(app);
    } catch (error) {
      return { ready: false, error: error.message || String(error) };
    }
  });
  ipcMain.handle('shipping:choose-pdfs', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: '选择一个或多个工厂发货计划箱唛 PDF',
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'PDF 文件', extensions: ['pdf'] }],
    });
    return result.canceled ? [] : result.filePaths;
  });
  ipcMain.handle('shipping:choose-folder', async (_event, kind) => {
    const title = kind === 'btw' ? '选择 BTW 标签库' : '选择输出目录';
    const result = await dialog.showOpenDialog(mainWindow, {
      title,
      properties: ['openDirectory', 'createDirectory'],
    });
    return result.canceled ? '' : (result.filePaths[0] || '');
  });
  ipcMain.handle('shipping:products:list', () => {
    const library = shippingProductLibrary();
    const products = library.list();
    return { products, count: products.length, filePath: library.filePath };
  });
  ipcMain.handle('shipping:products:save', (_event, input) => {
    const library = shippingProductLibrary();
    const saved = library.upsert(input);
    return { saved, products: library.list() };
  });
  ipcMain.handle('shipping:products:save-many', (_event, inputs) => {
    const library = shippingProductLibrary();
    const products = library.upsertMany(inputs);
    return { products, count: products.length };
  });
  ipcMain.handle('shipping:products:delete', (_event, sku) => {
    const library = shippingProductLibrary();
    library.delete(sku);
    const products = library.list();
    return { products, count: products.length };
  });
  ipcMain.handle('shipping:inspect', async (_event, input) => {
    const pdfPaths = normalizeShippingPdfPaths(input);
    const inspected = await inspectShippingPdfs(app, pdfPaths);
    const library = shippingProductLibrary();
    return {
      ...inspected,
      missing: library.missing(inspected.skus),
      productCount: library.list().length,
    };
  });
  ipcMain.handle('shipping:run', async (_event, input) => {
    if (shippingPlannerRunning) throw new Error('已有货件处理任务正在运行');
    const pdfPaths = normalizeShippingPdfPaths(input);
    const stores = new Set(['StoreA', 'StoreB', 'StoreC']);
    const transports = new Set(['普船', '快船', '空运']);
    const deliveryDays = Number(input?.deliveryDays ?? 45);
    if (!Number.isSafeInteger(deliveryDays) || deliveryDays < 0) {
      throw new Error('运输时效必须填写 0 或正整数天数');
    }
    const libraryProducts = shippingProductLibrary().list();
    const productMap = new Map(libraryProducts.map((product) => [product.sku, product]));
    for (const inputProduct of Array.isArray(input?.productOverrides) ? input.productOverrides : []) {
      const product = normalizeShippingProduct(inputProduct);
      productMap.set(product.sku, product);
    }
    const normalized = {
      pdfPaths,
      store: stores.has(input?.store) ? input.store : 'StoreA',
      date: String(input?.date || '').trim(),
      transport: transports.has(input?.transport) ? input.transport : '普船',
      deliveryDays,
      person: String(input?.person || '').trim().slice(0, 40),
      locked: input?.locked !== false,
      btwDir: String(input?.btwDir || '').trim(),
      outputDir: String(input?.outputDir || '').trim(),
      products: [...productMap.values()],
    };
    if (!normalized.date) throw new Error('请选择发货日期');
    if (normalized.btwDir && !fs.existsSync(normalized.btwDir)) throw new Error('BTW 标签库目录不存在');
    if (normalized.outputDir && !fs.existsSync(normalized.outputDir)) throw new Error('输出目录不存在');
    store.update((state) => {
      state.settings.shippingPlanner = {
        store: normalized.store,
        transport: normalized.transport,
        deliveryDays: normalized.deliveryDays,
        person: normalized.person,
        locked: normalized.locked,
        btwDir: normalized.btwDir,
        outputDir: normalized.outputDir,
      };
      return state;
    });
    shippingPlannerRunning = true;
    try {
      return await runShippingPlanner(app, normalized);
    } finally {
      shippingPlannerRunning = false;
    }
  });
  ipcMain.handle('shipping:open-output', async (_event, outputDir) => {
    const target = String(outputDir || '');
    if (!target || !fs.existsSync(target)) throw new Error('输出目录不存在');
    const error = await shell.openPath(target);
    if (error) throw new Error(error);
    return true;
  });
  ipcMain.handle('competitor:start', (_event, input) => {
    if (competitorJob && ['queued', 'running', 'exporting'].includes(competitorJob.status)) {
      throw new Error('已有竞品采集任务正在运行');
    }
    const { validateAsins } = require('../tools/competitor-images/asins.cjs');
    const asins = validateAsins(input?.asins);
    competitorJob = {
      id: crypto.randomUUID(),
      status: 'queued',
      progress: { phase: 'queued', message: '任务已创建', completed: 0, total: asins.length },
      previewResults: [],
      error: null,
      outputPath: null,
      createdAt: new Date().toISOString(),
    };
    setImmediate(() => runCompetitorJob(competitorJob, {
      asins,
      headless: input?.showBrowser === false,
    }));
    return publicCompetitorJob();
  });
  ipcMain.handle('competitor:get', (_event, id) => {
    if (!competitorJob || (id && competitorJob.id !== id)) return null;
    return publicCompetitorJob();
  });
  ipcMain.handle('competitor:save', async (_event, id) => {
    if (!competitorJob || competitorJob.id !== id || !competitorJob.outputPath || !fs.existsSync(competitorJob.outputPath)) {
      throw new Error('Excel 尚未生成');
    }
    const result = await dialog.showSaveDialog(mainWindow, {
      title: '保存 Amazon 竞品图片汇总表',
      defaultPath: path.join(app.getPath('downloads'), path.basename(competitorJob.outputPath)),
      filters: [{ name: 'Excel 工作簿', extensions: ['xlsx'] }],
      properties: ['showOverwriteConfirmation'],
    });
    if (result.canceled || !result.filePath) return { canceled: true };
    await fsp.copyFile(competitorJob.outputPath, result.filePath);
    return { canceled: false, filePath: result.filePath };
  });
  ipcMain.handle('window:get-dock-state', () => dockController?.getState()
    || { docked: false, revealed: false, pinned: false });
  ipcMain.handle('window:toggle-dock', () => ballMode() ? dockController?.getState() : dockController?.toggle());
  ipcMain.handle('window:toggle-pin', () => {
    const next = dockController?.togglePinned()
      || { docked: false, revealed: false, pinned: false };
    store.update((state) => {
      state.settings.alwaysOnTop = next.pinned;
      return state;
    });
    return next;
  });
  ipcMain.handle('window:hide-docked', () => dockController?.hideDocked());
  ipcMain.handle('window:set-auto-hide-paused', (_event, paused) =>
    dockController?.setAutoHidePaused(Boolean(paused)));
  ipcMain.handle('window:minimize', () => ballMode() ? collapseMain() : mainWindow?.minimize());
  ipcMain.handle('window:close-to-tray', () => collapseMain());
}

const singleInstance = app.requestSingleInstanceLock();
if (!singleInstance) {
  app.quit();
} else {
  app.on('second-instance', () => openMain());
  app.whenReady().then(() => {
    store = new LocalStore(app.getPath('userData'));
    syncLaunchAtLoginState();
    registerIpc();
    createWindow();
    createTray();
    checkTodoNotifications();
    setInterval(checkTodoNotifications, 30_000).unref();
  });
}

app.on('before-quit', () => { isQuitting = true; });
app.on('window-all-closed', () => {
  // Windows 下继续驻留托盘，只有托盘“退出软件”才结束进程。
});
