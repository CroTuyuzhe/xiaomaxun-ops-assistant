const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { loadDependency } = require('../competitor-images/dependencies.cjs');

const XYDC_ENDPOINTS = ['variations_insight', 'look_up'];
const WORK_URLS = [
  'https://erp.lingxing.com/erp/productExpressionDetail',
  'chrome-extension://dehlblnjjkkbapjemjbeafjhjpjoifii/index.html',
];

function findChromeExecutable() {
  const candidates = [
    process.env.BROWSER_EXECUTABLE,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    process.env.LOCALAPPDATA && `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  ].filter(Boolean);
  return candidates.find((candidate) => fs.existsSync(candidate)) || null;
}

function launchWorkPages() {
  const executable = findChromeExecutable();
  if (!executable) throw new Error('未找到 Chrome 或 Edge 浏览器');
  const child = spawn(executable, WORK_URLS, {
    detached: true,
    stdio: 'ignore',
    windowsHide: false,
  });
  child.unref();
  return true;
}

function parseCounts(values) {
  const counts = values.slice(0, 5).map((value) => {
    const match = String(value || '').replace(/,/g, '').match(/\d+/);
    return match ? Number(match[0]) : null;
  }).filter((value) => Number.isFinite(value));
  return counts.length >= 3 ? { total: counts[0], organic: counts[1], ad: counts[2] } : null;
}

async function readTrafficCounts(page) {
  const values = await page.locator('span.search_term_type_filter_item_count').allTextContents();
  return parseCounts(values);
}

async function scrapeXydcTraffic({ asin, dataDir, onProgress = () => {} }) {
  const normalized = String(asin || '').trim().toUpperCase();
  if (!/^B0[A-Z0-9]{8}$/.test(normalized)) throw new Error('请输入有效的 ASIN');
  const executablePath = findChromeExecutable();
  if (!executablePath) throw new Error('未找到 Chrome 或 Edge 浏览器');
  const { chromium } = loadDependency('playwright-core');
  const profileDir = path.join(dataDir, 'xydc-browser-profile');
  await fsp.mkdir(profileDir, { recursive: true });
  const endpoint = XYDC_ENDPOINTS[Math.floor(Math.random() * XYDC_ENDPOINTS.length)];
  const url = `https://www.xydc.com/detail/asin/${endpoint}/US/${normalized}`;
  onProgress({ phase: 'traffic_launching', message: `正在打开 xydc：${normalized}` });
  const context = await chromium.launchPersistentContext(profileDir, {
    executablePath,
    headless: false,
    locale: 'zh-CN',
    timezoneId: 'Asia/Shanghai',
    viewport: { width: 1320, height: 840 },
    args: ['--no-sandbox', '--disable-blink-features=AutomationControlled'],
  });
  try {
    const page = context.pages()[0] || await context.newPage();
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120_000 });
    onProgress({ phase: 'traffic_loading', message: '页面已打开，正在读取流量词数据…' });
    try {
      await page.waitForSelector('span.search_term_type_filter_item_count', { timeout: 15_000 });
    } catch {
      // The same browser stays open so the user can complete xydc login.
    }
    let counts = await readTrafficCounts(page);
    if (!counts || (counts.total === 0 && counts.organic === 0 && counts.ad === 0)) {
      onProgress({ phase: 'traffic_login', message: '请在已打开的浏览器中登录 xydc，登录后会自动继续。' });
      counts = null;
      for (let attempt = 1; attempt <= 40; attempt += 1) {
        await page.waitForTimeout(3_000);
        counts = await readTrafficCounts(page).catch(() => null);
        if (counts && !(counts.total === 0 && counts.organic === 0 && counts.ad === 0)) break;
        if (attempt % 5 === 0) {
          onProgress({ phase: 'traffic_login', message: `等待 xydc 登录… ${attempt * 3}/120 秒` });
        }
      }
    }
    if (!counts || (counts.total === 0 && counts.organic === 0 && counts.ad === 0)) {
      throw new Error('等待 xydc 登录超时，未读取到有效流量词数据');
    }
    onProgress({ phase: 'traffic_result', message: `总 ${counts.total} · 自然 ${counts.organic} · 广告 ${counts.ad}` });
    return { asin: normalized, ...counts, sourceUrl: url };
  } finally {
    await context.close().catch(() => {});
  }
}

module.exports = {
  findChromeExecutable,
  launchWorkPages,
  parseCounts,
  scrapeXydcTraffic,
};
