const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { loadDependency } = require('../competitor-images/dependencies.cjs');

const EXTENSION_ID = 'dehlblnjjkkbapjemjbeafjhjpjoifii';
const EXTENSION_URL = `chrome-extension://${EXTENSION_ID}/index.html`;
const WEB_STORE_URL = `https://chromewebstore.google.com/detail/amazon-kw-index-and-rank/${EXTENSION_ID}`;

function findChromeExecutable() {
  const candidates = [
    process.env.CHROME_EXECUTABLE,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    process.env.LOCALAPPDATA && `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
  ].filter(Boolean);
  return candidates.find((candidate) => fs.existsSync(candidate)) || null;
}

function normalizeAsin(value) {
  const direct = String(value || '').toUpperCase().trim().match(/^[A-Z0-9]{10}$/)?.[0];
  if (direct) return direct;
  try {
    const parsed = new URL(String(value || '').trim());
    if (!/(^|\.)amazon\.com$/i.test(parsed.hostname)) return '';
    return parsed.pathname.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})(?:[/?]|$)/i)?.[1]?.toUpperCase() || '';
  } catch {
    return '';
  }
}

function normalizeKeywords(value) {
  const source = Array.isArray(value) ? value : String(value || '').split(/\r?\n/);
  const deduped = new Map();
  for (const raw of source) {
    const keyword = String(raw || '')
      .replace(/[\u0000-\u001f\u007f\ufffc]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!keyword) continue;
    const key = keyword.toLocaleLowerCase('en-US');
    if (!deduped.has(key)) deduped.set(key, keyword);
  }
  return [...deduped.values()];
}

function normalizeKeywordJobs(value, { allowEmpty = false } = {}) {
  const source = Array.isArray(value) ? value : [];
  if (!allowEmpty && !source.length) throw new Error('请至少配置一个 ASIN 查询任务');
  if (source.length > 50) throw new Error('单次最多配置 50 个 ASIN');
  const asinSet = new Set();
  return source.map((input, index) => {
    const asin = normalizeAsin(input?.asin);
    if (!asin) throw new Error(`第 ${index + 1} 个任务的 ASIN 格式不正确`);
    if (asinSet.has(asin)) throw new Error(`ASIN ${asin} 重复，请合并关键词后再保存`);
    asinSet.add(asin);
    const postcode = String(input?.postcode || '').trim();
    if (!/^\d{5}(?:-\d{4})?$/.test(postcode)) {
      throw new Error(`${asin} 的美国邮编格式不正确`);
    }
    const keywords = normalizeKeywords(input?.keywords);
    if (!keywords.length) throw new Error(`${asin} 至少需要一个关键词`);
    if (keywords.length > 300) throw new Error(`${asin} 的关键词超过 300 个，请拆分任务`);
    return {
      asin,
      postcode,
      keywords,
      excludePreviouslyViewed: Boolean(input?.excludePreviouslyViewed),
    };
  });
}

function nowStamp() {
  const date = new Date();
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}_${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function checkKeywordRankEnvironment() {
  const chromePath = findChromeExecutable();
  if (!chromePath) {
    return {
      ready: false,
      error: '未找到 Google Chrome。请先安装 Chrome，再使用关键词排名查询。',
    };
  }
  try {
    const { chromium } = loadDependency('playwright-core');
    if (!chromium || typeof chromium.launchPersistentContext !== 'function') {
      throw new Error('playwright-core chromium API is unavailable');
    }
  } catch {
    return {
      ready: false,
      error: '自动化运行组件不完整。请退出当前程序，改用最新版小马逊运营助手。',
    };
  }
  return {
    ready: true,
    chromePath,
    extensionId: EXTENSION_ID,
    message: '系统 Chrome 已就绪；首次使用可能需要在独立浏览器中安装并登录插件。',
  };
}

async function tryOpenExtensionPage(context) {
  for (const existing of context.pages()) {
    if (!existing.url().startsWith(`chrome-extension://${EXTENSION_ID}/`)) continue;
    if (await existing.locator('#search-btn').count().catch(() => 0)) return existing;
  }
  const page = await context.newPage();
  try {
    await page.goto(EXTENSION_URL, { waitUntil: 'domcontentloaded', timeout: 12_000 });
    await page.waitForSelector('#search-btn', { timeout: 8_000 });
    return page;
  } catch {
    await page.close().catch(() => {});
    return null;
  }
}

async function ensureExtensionPage(context, onProgress) {
  let extensionPage = await tryOpenExtensionPage(context);
  if (extensionPage) return extensionPage;

  const setupPage = context.pages().find((page) => page.url() === 'about:blank') || await context.newPage();
  await setupPage.goto(WEB_STORE_URL, { waitUntil: 'domcontentloaded', timeout: 60_000 }).catch(() => {});
  onProgress({
    phase: 'extension_setup',
    message: '首次使用：请在 Chrome 商店安装 Amazon Keyword-Ranking-Tracker。安装后点击浏览器工具栏中的插件图标，脚本会自动继续。',
  });

  const deadline = Date.now() + 15 * 60_000;
  let lastProbe = 0;
  while (Date.now() < deadline) {
    for (const page of context.pages()) {
      if (page.url().startsWith(`chrome-extension://${EXTENSION_ID}/`)
        && await page.locator('#search-btn').count().catch(() => 0)) return page;
    }
    const serviceWorkerReady = context.serviceWorkers()
      .some((worker) => worker.url().startsWith(`chrome-extension://${EXTENSION_ID}/`));
    if (serviceWorkerReady || Date.now() - lastProbe > 10_000) {
      lastProbe = Date.now();
      extensionPage = await tryOpenExtensionPage(context);
      if (extensionPage) return extensionPage;
    }
    await delay(1_500);
  }
  throw new Error('等待插件安装超时（15分钟）。请确认插件已安装在自动打开的独立 Chrome 中。');
}

function authStateShowsLoggedIn(state) {
  return Boolean(state?.userBoxVisible && !state?.loginBoxVisible);
}

async function readPluginAuthState(page) {
  return page.evaluate(() => {
    const shown = (element) => Boolean(element && getComputedStyle(element).display !== 'none');
    return {
      loginBoxVisible: shown(document.querySelector('#login-box')),
      userBoxVisible: shown(document.querySelector('#userinfo-box')),
      username: document.querySelector('#userinfo-box-username')?.textContent?.trim() || '',
      loginModalVisible: shown(document.querySelector('#loginModal')),
    };
  });
}

async function dismissLoginModal(page) {
  await page.evaluate(() => {
    const modal = document.querySelector('#loginModal');
    if (!modal || getComputedStyle(modal).display === 'none') return;
    if (window.jQuery?.fn?.modal) window.jQuery(modal).modal('hide');
    else {
      modal.classList.remove('show', 'in');
      modal.style.display = 'none';
      modal.setAttribute('aria-hidden', 'true');
    }
    document.querySelectorAll('.modal-backdrop').forEach((element) => element.remove());
    document.body.classList.remove('modal-open');
    document.body.style.removeProperty('padding-right');
  }).catch(() => {});
}

async function isPluginLoggedIn(page) {
  return authStateShowsLoggedIn(await readPluginAuthState(page));
}

async function waitForRestoredPluginLogin(page, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  do {
    if (page.isClosed()) throw new Error('等待插件恢复登录状态时浏览器被关闭');
    const state = await readPluginAuthState(page);
    if (authStateShowsLoggedIn(state)) {
      if (state.loginModalVisible) await dismissLoginModal(page);
      return true;
    }
    await page.waitForTimeout(500);
  } while (Date.now() < deadline);
  return false;
}

async function waitForPluginLogin(page, onProgress) {
  // 插件初始 HTML 默认显示 Sign In，随后才通过接口恢复已有会话。
  // 必须先等待恢复完成，且不能主动点击 Sign In，否则已登录用户也会反复看到登录弹窗。
  if (await waitForRestoredPluginLogin(page)) return;
  onProgress({
    phase: 'login',
    message: '尚未识别到插件登录状态。若未登录，请点击插件右上角 Sign In；登录成功后会自动继续。',
  });
  try {
    await page.waitForFunction(() => {
      const loginBox = document.querySelector('#login-box');
      const userBox = document.querySelector('#userinfo-box');
      return Boolean(
        loginBox && getComputedStyle(loginBox).display === 'none'
        && userBox && getComputedStyle(userBox).display !== 'none'
      );
    }, null, { timeout: 15 * 60_000 });
  } catch {
    if (page.isClosed()) throw new Error('等待插件登录时浏览器被关闭');
    throw new Error('等待插件登录超时（15分钟）');
  }
  await dismissLoginModal(page);
  await page.waitForTimeout(1_500);
}

async function setCheckbox(page, selector, checked, label) {
  const result = await page.evaluate(({ checkboxSelector, targetChecked }) => {
    const input = document.querySelector(checkboxSelector);
    if (!input) return { status: 'missing' };
    if (targetChecked && input.disabled) return { status: 'disabled' };
    if (Boolean(input.checked) !== targetChecked) input.click();
    const card = input.closest('label');
    const mark = card?.querySelector('.amz-opt-mark');
    const markVisible = !targetChecked || Boolean(
      mark && getComputedStyle(mark, '::after').opacity === '1',
    );
    return {
      status: 'ok',
      checked: Boolean(input.checked),
      markVisible,
    };
  }, { checkboxSelector: selector, targetChecked: checked });

  if (result.status === 'missing') throw new Error(`插件页面缺少选项：${label}`);
  if (result.status === 'disabled') {
    throw new Error(`“${label}”当前不可用，请确认插件账号拥有对应权限`);
  }
  if (result.checked !== checked || !result.markVisible) {
    throw new Error(`“${label}”未能切换到${checked ? '开启' : '关闭'}状态`);
  }
}

async function fillJob(page, job) {
  await page.selectOption('#country', 'com');
  await page.fill('#asin', job.asin);
  await page.fill('#keywords', job.keywords.join('\n'));
  await setCheckbox(page, '#check-rank', true, 'Check All Variations');
  await setCheckbox(page, '#check-postcode', true, 'Change Post Code');
  await setCheckbox(
    page,
    '#check-incognito',
    job.excludePreviouslyViewed,
    'Exclude Previously Viewed',
  );
  await setCheckbox(page, '#check-sponsored', false, 'Check Sponsored Rankings');
  await page.fill('#postcode', job.postcode);
}

async function verifyBeforeQuery(page, job) {
  const state = await page.evaluate(() => {
    const value = (selector) => document.querySelector(selector)?.value || '';
    const checked = (selector) => Boolean(document.querySelector(selector)?.checked);
    return {
      asin: value('#asin').trim().toUpperCase(),
      postcode: value('#postcode').trim(),
      keywordCount: value('#keywords').split(/\r?\n/).map((item) => item.trim()).filter(Boolean).length,
      variations: checked('#check-rank'),
      changePostCode: checked('#check-postcode'),
      excludePreviouslyViewed: checked('#check-incognito'),
    };
  });
  if (state.asin !== job.asin || state.postcode !== job.postcode
    || state.keywordCount !== job.keywords.length || !state.variations || !state.changePostCode
    || state.excludePreviouslyViewed !== job.excludePreviouslyViewed) {
    throw new Error(`${job.asin} 查询前配置复核失败，已停止以避免错误数据`);
  }
}

async function waitForQueryCompletion(page, timeoutMs, onProgress, baseProgress) {
  const deadline = Date.now() + timeoutMs;
  let previousText = '';
  while (Date.now() < deadline) {
    if (page.isClosed()) throw new Error('查询过程中浏览器被关闭');
    const state = await page.evaluate(() => {
      const progress = document.querySelector('#progress-bar-text');
      const toolbar = document.querySelector('#results-toolbar');
      const button = document.querySelector('#search-btn');
      const loginModal = document.querySelector('#loginModal');
      const loginBox = document.querySelector('#login-box');
      const userBox = document.querySelector('#userinfo-box');
      const text = progress?.textContent?.trim() || '';
      return {
        text,
        login: Boolean(loginModal && getComputedStyle(loginModal).display !== 'none'),
        loggedIn: Boolean(
          loginBox && getComputedStyle(loginBox).display === 'none'
          && userBox && getComputedStyle(userBox).display !== 'none'
        ),
        complete: Boolean(
          button && !button.disabled
          && toolbar && getComputedStyle(toolbar).display !== 'none'
          && /finished|完成|已完成/i.test(text),
        ),
      };
    });
    if (state.login) {
      if (state.loggedIn) {
        await dismissLoginModal(page);
        return 'auth-popup';
      }
      return 'login';
    }
    if (state.complete) return 'complete';
    if (state.text && state.text !== previousText) {
      previousText = state.text;
      onProgress({ ...baseProgress, phase: 'querying', message: `${baseProgress.asin}：${state.text}` });
    }
    await page.waitForTimeout(1_000);
  }
  throw new Error(`查询超时（${Math.round(timeoutMs / 60_000)}分钟）`);
}

async function readQueryResult(page) {
  return page.evaluate(() => {
    const table = window.jQuery?.fn?.dataTable?.isDataTable?.('#datatable')
      ? window.jQuery('#datatable').DataTable()
      : null;
    if (!table) return [];
    return table.rows().data().toArray().map((row) => Array.from(row));
  });
}

async function exportExcelFromPage(page, destination) {
  await page.evaluate(() => {
    if (window.__xiaomaxunKeywordExportHook) return;
    const originalCreateObjectURL = URL.createObjectURL.bind(URL);
    const originalDispatchEvent = HTMLAnchorElement.prototype.dispatchEvent;
    window.__xiaomaxunKeywordExportBlob = null;
    URL.createObjectURL = function captureExportBlob(blob) {
      if (blob instanceof Blob && blob.size > 0) window.__xiaomaxunKeywordExportBlob = blob;
      return originalCreateObjectURL(blob);
    };
    HTMLAnchorElement.prototype.dispatchEvent = function suppressNativeDownload(event) {
      if (event?.type === 'click' && this.download && window.__xiaomaxunKeywordExportBlob) return true;
      return originalDispatchEvent.call(this, event);
    };
    window.__xiaomaxunKeywordExportHook = { originalCreateObjectURL, originalDispatchEvent };
  });

  try {
    await page.locator('#export-excel-btn').click();
    await page.waitForFunction(
      () => window.__xiaomaxunKeywordExportBlob instanceof Blob,
      null,
      { timeout: 60_000 },
    );
    const base64 = await page.evaluate(async () => {
      const bytes = new Uint8Array(await window.__xiaomaxunKeywordExportBlob.arrayBuffer());
      let binary = '';
      const chunkSize = 0x8000;
      for (let index = 0; index < bytes.length; index += chunkSize) {
        binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
      }
      return btoa(binary);
    });
    const data = Buffer.from(base64, 'base64');
    const isXlsx = data.length > 1_000
      && data[0] === 0x50 && data[1] === 0x4b && data[2] === 0x03 && data[3] === 0x04
      && data.includes(Buffer.from('[Content_Types].xml'))
      && data.includes(Buffer.from('xl/worksheets/sheet1.xml'));
    if (!isXlsx) throw new Error(`插件导出的内容不是有效 Excel（${data.length} 字节）`);
    const partial = `${destination}.partial`;
    await fsp.writeFile(partial, data);
    await fsp.rename(partial, destination);
    const written = await fsp.stat(destination);
    if (written.size !== data.length) throw new Error('Excel 写入后的文件大小校验失败');
  } finally {
    await page.evaluate(() => {
      const hook = window.__xiaomaxunKeywordExportHook;
      if (hook) {
        URL.createObjectURL = hook.originalCreateObjectURL;
        HTMLAnchorElement.prototype.dispatchEvent = hook.originalDispatchEvent;
      }
      delete window.__xiaomaxunKeywordExportHook;
      delete window.__xiaomaxunKeywordExportBlob;
    }).catch(() => {});
  }
}

async function runOneJob(page, job, index, total, outputDir, onProgress, options) {
  const maxAttempts = options.maxAttempts || 3;
  let attempt = 0;
  while (attempt < maxAttempts) {
    if (attempt > 0) {
      onProgress({
        phase: 'retrying',
        message: `${job.asin} 将进行第 ${attempt + 1} 次查询`,
        asin: job.asin,
        jobIndex: index,
        totalJobs: total,
        completedJobs: index,
      });
      await page.waitForTimeout(options.retryDelayMs || 8_000);
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForSelector('#search-btn', { timeout: 30_000 });
    }

    await waitForPluginLogin(page, onProgress);
    await fillJob(page, job);
    await verifyBeforeQuery(page, job);
    onProgress({
      phase: 'verifying',
      message: `${job.asin} 配置已复核，${job.excludePreviouslyViewed ? '已勾选' : '未勾选'} Exclude Previously Viewed，5秒后查询`,
      asin: job.asin,
      jobIndex: index,
      totalJobs: total,
      completedJobs: index,
    });
    await page.waitForTimeout(options.verificationDelayMs || 5_000);
    await verifyBeforeQuery(page, job);
    await page.locator('#search-btn').click();
    const outcome = await waitForQueryCompletion(page, options.timeoutMs || 30 * 60_000, onProgress, {
      asin: job.asin,
      jobIndex: index,
      totalJobs: total,
      completedJobs: index,
    });
    if (outcome === 'login') {
      await waitForPluginLogin(page, onProgress);
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForSelector('#search-btn', { timeout: 30_000 });
      continue;
    }
    if (outcome === 'auth-popup') {
      attempt += 1;
      if (attempt < maxAttempts) continue;
      throw new Error(`${job.asin} 查询时插件连续弹出登录窗口，但页面仍显示已登录。请检查插件账号状态或网络后重试`);
    }
    attempt += 1;

    const rows = await readQueryResult(page);
    const indexedRows = rows.filter((row) => row[2] === 'Y' || row[2] === 'Indexed').length;
    if (rows.length !== job.keywords.length) {
      if (attempt < maxAttempts) continue;
      throw new Error(`${job.asin} 结果应为 ${job.keywords.length} 行，实际 ${rows.length} 行`);
    }
    if (indexedRows < 1) {
      if (attempt < maxAttempts) continue;
      throw new Error(`${job.asin} 连续 ${maxAttempts} 次均为可疑空结果，已停止下载`);
    }

    await fsp.mkdir(outputDir, { recursive: true });
    const filePath = path.join(outputDir, `${job.asin}_com_${nowStamp()}.xlsx`);
    onProgress({
      phase: 'exporting',
      message: `${job.asin} 查询通过，正在生成 Excel`,
      asin: job.asin,
      jobIndex: index,
      totalJobs: total,
      completedJobs: index,
    });
    await exportExcelFromPage(page, filePath);
    return {
      asin: job.asin,
      keywordCount: rows.length,
      indexedCount: indexedRows,
      attempts: attempt,
      filePath,
    };
  }
  throw new Error(`${job.asin} 未取得可接受的查询结果`);
}

async function runKeywordRank({ jobs: inputJobs, outputDir, dataDir }, onProgress = () => {}) {
  const jobs = normalizeKeywordJobs(inputJobs);
  const environment = await checkKeywordRankEnvironment();
  if (!environment.ready) throw new Error(environment.error);
  const rawOutputDir = String(outputDir || '').trim();
  if (!rawOutputDir) throw new Error('请选择 Excel 输出目录');
  const resolvedOutputDir = path.resolve(rawOutputDir);
  await fsp.mkdir(resolvedOutputDir, { recursive: true });
  const profileDir = path.join(dataDir, 'chrome-profile-v1');
  await fsp.mkdir(profileDir, { recursive: true });
  const { chromium } = loadDependency('playwright-core');

  onProgress({
    phase: 'launching',
    message: '正在启动系统 Chrome…',
    completedJobs: 0,
    totalJobs: jobs.length,
  });
  const context = await chromium.launchPersistentContext(profileDir, {
    executablePath: environment.chromePath,
    headless: false,
    acceptDownloads: true,
    viewport: null,
    ignoreDefaultArgs: ['--disable-extensions'],
    args: [
      '--no-first-run',
      '--no-default-browser-check',
      '--start-maximized',
    ],
  });
  context.setDefaultTimeout(30_000);

  const results = [];
  try {
    let page = await ensureExtensionPage(context, onProgress);
    for (let index = 0; index < jobs.length; index += 1) {
      const job = jobs[index];
      if (index > 0 || !page.url().startsWith(EXTENSION_URL)) {
        await page.goto(EXTENSION_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      }
      await page.waitForSelector('#search-btn', { timeout: 30_000 });
      onProgress({
        phase: 'preparing',
        message: `正在准备 ${job.asin}（${index + 1}/${jobs.length}）`,
        asin: job.asin,
        jobIndex: index,
        completedJobs: index,
        totalJobs: jobs.length,
      });
      const result = await runOneJob(
        page,
        job,
        index,
        jobs.length,
        resolvedOutputDir,
        onProgress,
        {},
      );
      results.push(result);
      onProgress({
        phase: 'result',
        message: `${job.asin} 已完成并保存 Excel`,
        asin: job.asin,
        jobIndex: index,
        completedJobs: index + 1,
        totalJobs: jobs.length,
        result,
      });
    }
    return { outputDir: resolvedOutputDir, results };
  } finally {
    await context.close().catch(() => {});
  }
}

module.exports = {
  EXTENSION_ID,
  authStateShowsLoggedIn,
  checkKeywordRankEnvironment,
  findChromeExecutable,
  normalizeAsin,
  normalizeKeywordJobs,
  normalizeKeywords,
  runKeywordRank,
};
