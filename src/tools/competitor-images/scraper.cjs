const fs = require('node:fs/promises');
const path = require('node:path');
const { loadDependency } = require('./dependencies.cjs');
const { MARKETPLACE, findBrowserExecutable } = require('./config.cjs');

function canonicalUrl(value, baseUrl = MARKETPLACE.baseUrl) {
  if (!value) return null;
  try {
    const url = new URL(value, baseUrl);
    if (!/^https?:$/.test(url.protocol)) return null;
    url.search = '';
    url.hash = '';
    url.pathname = url.pathname.replace(/\._[^/]*_\.(jpe?g|png|gif|webp)$/i, '.$1');
    return url.href;
  } catch {
    return null;
  }
}

function detectImage(buffer, contentType = '') {
  const type = String(contentType).toLowerCase();
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    return { ext: 'png', mime: 'image/png' };
  }
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { ext: 'jpeg', mime: 'image/jpeg' };
  }
  if (buffer.length >= 6 && ['GIF87a', 'GIF89a'].includes(buffer.subarray(0, 6).toString('ascii'))) {
    return { ext: 'gif', mime: 'image/gif' };
  }
  if (type.includes('png')) return { ext: 'png', mime: 'image/png' };
  if (type.includes('jpeg') || type.includes('jpg')) return { ext: 'jpeg', mime: 'image/jpeg' };
  if (type.includes('gif')) return { ext: 'gif', mime: 'image/gif' };
  return null;
}

async function downloadImage(request, imageUrl, referer) {
  if (!imageUrl) return null;
  try {
    const response = await request.get(imageUrl, {
      headers: {
        referer,
        accept: 'image/png,image/jpeg,image/gif,image/webp',
      },
      timeout: 30_000,
      failOnStatusCode: false,
    });
    if (!response.ok()) return null;
    const buffer = Buffer.from(await response.body());
    if (buffer.length < 512 || buffer.length > 20 * 1024 * 1024) return null;
    const detected = detectImage(buffer, response.headers()['content-type'] || '');
    return detected ? { ...detected, buffer, sourceUrl: imageUrl } : null;
  } catch {
    return null;
  }
}

async function extractPageData(page, includeBrandStory = false) {
  return page.evaluate(({ includeBrand }) => {
    const text = (selector) => document.querySelector(selector)?.textContent?.replace(/\s+/g, ' ').trim() || '';
    const bestFromSrcset = (srcset) => {
      if (!srcset) return '';
      const entries = srcset.split(',').map((entry) => {
        const [url, size = '0w'] = entry.trim().split(/\s+/);
        return { url, size: Number.parseInt(size, 10) || 0 };
      }).sort((a, b) => b.size - a.size);
      return entries[0]?.url || '';
    };
    const imageUrl = (img) => {
      if (!img) return '';
      const dynamic = img.getAttribute('data-a-dynamic-image');
      if (dynamic) {
        try {
          const entries = Object.entries(JSON.parse(dynamic)).sort((a, b) =>
            ((b[1]?.[0] || 0) * (b[1]?.[1] || 0)) - ((a[1]?.[0] || 0) * (a[1]?.[1] || 0)));
          if (entries[0]?.[0]) return entries[0][0];
        } catch {}
      }
      return img.getAttribute('data-old-hires')
        || img.getAttribute('data-a-hires')
        || img.getAttribute('data-src')
        || img.getAttribute('data-lazy-src')
        || bestFromSrcset(img.getAttribute('srcset'))
        || img.currentSrc
        || img.src
        || '';
    };
    const canonical = (value) => {
      if (!value) return '';
      try {
        const parsed = new URL(value, location.href);
        parsed.search = '';
        parsed.hash = '';
        parsed.pathname = parsed.pathname.replace(/\._[^/]*_\.(jpe?g|png|gif|webp)$/i, '.$1');
        return parsed.href;
      } catch {
        return value;
      }
    };

    const galleryImages = [];
    const addGallery = (value) => {
      const normalized = canonical(value);
      if (normalized && /\/images\/I\//i.test(normalized) && !galleryImages.includes(normalized)) {
        galleryImages.push(normalized);
      }
    };

    let structuredGalleryFound = false;
    const marker = "'colorImages': { 'initial': A.$.parseJSON('";
    for (const script of document.scripts) {
      const source = script.textContent || '';
      const markerIndex = source.indexOf(marker);
      if (markerIndex < 0) continue;
      const start = markerIndex + marker.length;
      const end = source.indexOf("')", start);
      if (end < start) continue;
      try {
        const decoded = source.slice(start, end).replace(/\\"/g, '"').replace(/\\\\/g, '\\');
        const items = JSON.parse(decoded);
        items.forEach((item) => {
          const main = item.main ? Object.entries(item.main).sort((a, b) =>
            ((b[1]?.[0] || 0) * (b[1]?.[1] || 0)) - ((a[1]?.[0] || 0) * (a[1]?.[1] || 0)))[0]?.[0] : '';
          addGallery(item.hiRes || main || item.large || item.thumb || '');
        });
        structuredGalleryFound = galleryImages.length > 0;
        if (structuredGalleryFound) break;
      } catch {}
    }

    if (!structuredGalleryFound) {
      for (const selector of ['#landingImage', '#imgTagWrapperId img', '#main-image', '#ebooksImgBlkFront', '#imageBlock img.a-dynamic-image']) {
        const candidate = imageUrl(document.querySelector(selector));
        if (candidate) {
          addGallery(candidate);
          break;
        }
      }
      document.querySelectorAll('#imageBlock_feature_div [data-a-dynamic-image], #imageBlock [data-old-hires], #altImages li.imageThumbnail:not(.videoThumbnail) img').forEach((img) => {
        const parent = img.closest('li');
        if (parent && /video|spin|360/i.test(`${parent.className} ${img.alt || ''}`)) return;
        addGallery(imageUrl(img));
      });
    }

    const brandStorySelector = '#aplusBrandStory_feature_div, [data-feature-name*="aplusBrandStory" i], [cel_widget_id*="aplusBrandStory" i]';
    const isBrandStory = (node) => Boolean(node?.matches?.(brandStorySelector) || node?.closest?.(brandStorySelector));
    const roots = [
      '#aplus',
      '#aplus_feature_div',
      '.aplus-v2',
      '[data-feature-name="aplus"]',
      '[cel_widget_id*="aplus" i]:not([cel_widget_id*="aplusBrandStory" i])',
    ];
    if (includeBrand) roots.push('#aplusBrandStory_feature_div');
    const aplusImages = [];
    for (const selector of roots) {
      const root = document.querySelector(selector);
      if (!root || (!includeBrand && isBrandStory(root))) continue;
      root.querySelectorAll('img').forEach((img) => {
        if (!includeBrand && isBrandStory(img)) return;
        const url = imageUrl(img);
        const alt = (img.alt || '').toLowerCase();
        const width = Number(img.getAttribute('width')) || img.naturalWidth || 0;
        const height = Number(img.getAttribute('height')) || img.naturalHeight || 0;
        if (url && !/sprite|icon|logo|loading|spinner/.test(`${url} ${alt}`)
          && (width === 0 || height === 0 || width >= 120 || height >= 120)) {
          aplusImages.push(canonical(url));
        }
      });
      root.querySelectorAll('[style*="background-image"], [data-background-image], [data-src]').forEach((node) => {
        if (node.tagName === 'IMG' || (!includeBrand && isBrandStory(node))) return;
        const style = node.getAttribute('style') || '';
        const cssUrl = style.match(/background-image\s*:\s*url\(["']?([^"')]+)["']?\)/i)?.[1];
        const url = node.getAttribute('data-background-image') || node.getAttribute('data-src') || cssUrl;
        if (url && !/sprite|icon|logo|loading|spinner/i.test(url)) aplusImages.push(canonical(url));
      });
    }

    return {
      title: text('#productTitle') || text('#title'),
      galleryImages: [...new Set(galleryImages.filter(Boolean))],
      aplusImages: [...new Set(aplusImages.filter(Boolean))],
      pageTitle: document.title,
      bodyText: document.body?.innerText?.slice(0, 6000) || '',
    };
  }, { includeBrand: includeBrandStory });
}

function challengeDetected(data) {
  const sample = `${data?.pageTitle || ''}\n${data?.bodyText || ''}`.toLowerCase();
  return /robot check|enter the characters you see|sorry, we just need to make sure|请输入您在这个图片中看到的字符|captcha/.test(sample);
}

function expectedMarketplaceUrl(value) {
  try {
    const actual = new URL(value).hostname.replace(/^www\./, '');
    const expected = new URL(MARKETPLACE.baseUrl).hostname.replace(/^www\./, '');
    return actual === expected;
  } catch {
    return false;
  }
}

async function configureMarketplace(context) {
  const hostname = new URL(MARKETPLACE.baseUrl).hostname.replace(/^www\./, '');
  await context.addCookies([
    { name: MARKETPLACE.cookie, value: MARKETPLACE.language, domain: `.${hostname}`, path: '/' },
    { name: 'i18n-prefs', value: MARKETPLACE.currency, domain: `.${hostname}`, path: '/' },
  ]);
  try {
    await context.request.post(`${MARKETPLACE.baseUrl}/gp/delivery/ajax/address-change.html`, {
      form: {
        locationType: 'LOCATION_INPUT',
        zipCode: MARKETPLACE.postalCode,
        storeContext: 'generic',
        pageType: 'Gateway',
        actionSource: 'glow',
      },
      headers: { referer: `${MARKETPLACE.baseUrl}/` },
      timeout: 20_000,
      failOnStatusCode: false,
    });
  } catch {}
}

async function loadLazyContent(page) {
  for (const selector of ['#altImages', '#imageBlock_feature_div', '#aplus_feature_div', '#aplus', '.aplus-v2']) {
    const locator = page.locator(selector);
    try {
      const count = Math.min(await locator.count(), 2);
      for (let index = 0; index < count; index += 1) {
        await locator.nth(index).scrollIntoViewIfNeeded({ timeout: 4_000 });
        await page.waitForTimeout(650);
      }
    } catch {}
  }
  try {
    await page.evaluate(async () => {
      const step = Math.max(500, Math.floor(window.innerHeight * .75));
      for (let y = 0; y < document.body.scrollHeight; y += step) {
        window.scrollTo(0, y);
        await new Promise((resolve) => setTimeout(resolve, 90));
      }
      window.scrollTo(0, 0);
    });
  } catch {}
  await page.waitForTimeout(1_800);
}

async function waitForCaptcha(page, asin, onProgress) {
  onProgress({
    phase: 'captcha',
    message: `${asin} 出现验证码，请在采集浏览器完成验证；通过后会自动继续。`,
    current: asin,
  });
  const deadline = Date.now() + 300_000;
  while (Date.now() < deadline) {
    await page.waitForTimeout(1_500);
    try {
      const data = await extractPageData(page, false);
      if (!challengeDetected(data)) return data;
    } catch {}
  }
  throw new Error('等待验证码完成超时，请稍后重新采集。');
}

async function extractAcrossFrames(page, includeBrandStory) {
  const primary = await extractPageData(page, includeBrandStory);
  const gallery = [...primary.galleryImages];
  const aplus = [...primary.aplusImages];
  for (const frame of page.frames().slice(1)) {
    try {
      const data = await extractPageData(frame, includeBrandStory);
      gallery.push(...data.galleryImages);
      aplus.push(...data.aplusImages);
    } catch {}
  }
  return {
    ...primary,
    galleryImages: [...new Set(gallery)],
    aplusImages: [...new Set(aplus)],
  };
}

async function scrapeProducts({ asins, headless = false, includeBrandStory = false, dataDir, onProgress = () => {} }) {
  const executablePath = findBrowserExecutable();
  if (!executablePath) throw new Error('未找到 Microsoft Edge 或 Google Chrome，请先安装浏览器。');
  const { chromium } = loadDependency('playwright-core');
  const profileDir = path.join(dataDir, 'browser-profile-v3-amazon-com');
  await fs.mkdir(profileDir, { recursive: true });
  onProgress({ phase: 'launching', message: '正在启动采集浏览器…', completed: 0, total: asins.length });

  const context = await chromium.launchPersistentContext(profileDir, {
    executablePath,
    headless,
    locale: MARKETPLACE.locale,
    viewport: { width: 1365, height: 900 },
  });
  context.setDefaultTimeout(30_000);
  await configureMarketplace(context);
  const results = [];

  try {
    for (let index = 0; index < asins.length; index += 1) {
      const asin = asins[index];
      const url = `${MARKETPLACE.baseUrl}/dp/${asin}?th=1&psc=1&language=${MARKETPLACE.language}&currency=${MARKETPLACE.currency}`;
      const result = {
        asin,
        title: '',
        url,
        resolvedUrl: '',
        mainImage: null,
        galleryImages: [],
        aplusImages: [],
        warnings: [],
        error: null,
      };
      onProgress({ phase: 'scraping', message: `正在打开 ${asin}…`, current: asin, completed: index, total: asins.length });
      const page = await context.newPage();
      try {
        await page.route(['**', '/', '*'].join(''), (route) => {
          const type = route.request().resourceType();
          return ['font', 'media'].includes(type) ? route.abort() : route.continue();
        });
        let response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 50_000 });
        await page.waitForTimeout(1_200);
        if (!expectedMarketplaceUrl(page.url())) {
          onProgress({ phase: 'redirect', message: '检测到跨站跳转，正在重新锁定美国站…', current: asin, completed: index, total: asins.length });
          await context.clearCookies();
          await configureMarketplace(context);
          response = await page.goto(`${MARKETPLACE.baseUrl}/gp/product/${asin}?th=1&psc=1&language=${MARKETPLACE.language}&currency=${MARKETPLACE.currency}`, {
            waitUntil: 'domcontentloaded',
            timeout: 50_000,
          });
          await page.waitForTimeout(1_200);
        }
        if (!expectedMarketplaceUrl(page.url())) throw new Error('Amazon 将页面跳转到其他站点，已停止写入错误站点数据。');
        await page.waitForSelector('#productTitle, #title, #captchacharacters', { timeout: 12_000 }).catch(() => {});
        let data = await extractAcrossFrames(page, includeBrandStory);
        if (challengeDetected(data)) {
          if (headless) throw new Error('Amazon 出现验证码，请开启“显示采集浏览器”后重试。');
          data = await waitForCaptcha(page, asin, onProgress);
        }
        if (response && response.status() >= 400) throw new Error(`商品页返回 HTTP ${response.status()}`);
        if (!data.title) throw new Error('未读取到商品标题，可能是 ASIN 无效、地区不可售或 Amazon 拒绝了当前访问。');
        result.title = data.title;
        result.resolvedUrl = page.url();

        onProgress({ phase: 'loading_aplus', message: `正在加载 ${asin} 的全部商品图与 A+…`, current: asin, completed: index, total: asins.length });
        await loadLazyContent(page);
        data = await extractAcrossFrames(page, includeBrandStory);
        const galleryUrls = [...new Set(data.galleryImages.map((item) => canonicalUrl(item)).filter(Boolean))].slice(0, 20);
        const gallerySet = new Set(galleryUrls);
        const aplusUrls = [...new Set(data.aplusImages.map((item) => canonicalUrl(item)).filter((item) => item && !gallerySet.has(item)))].slice(0, 50);

        onProgress({
          phase: 'images',
          message: `正在下载 ${asin}：商品图 ${galleryUrls.length} 张，A+ 候选 ${aplusUrls.length} 张…`,
          current: asin,
          completed: index,
          total: asins.length,
        });
        for (const imageUrl of galleryUrls) {
          const image = await downloadImage(context.request, imageUrl, result.resolvedUrl);
          if (image) result.galleryImages.push(image);
        }
        result.mainImage = result.galleryImages[0] || null;
        for (const imageUrl of aplusUrls) {
          const image = await downloadImage(context.request, imageUrl, result.resolvedUrl);
          if (image) result.aplusImages.push(image);
        }
        if (!result.galleryImages.length) result.warnings.push('商品图未成功下载');
        else if (result.galleryImages.length < galleryUrls.length) result.warnings.push(`有 ${galleryUrls.length - result.galleryImages.length} 张商品图下载失败`);
        if (!aplusUrls.length) result.warnings.push('页面未发现 A+ 图片');
        else if (result.aplusImages.length < aplusUrls.length) result.warnings.push(`有 ${aplusUrls.length - result.aplusImages.length} 张 A+ 图片下载失败`);
      } catch (error) {
        result.error = error.message || String(error);
      } finally {
        await page.close().catch(() => {});
      }
      results.push(result);
      onProgress({
        phase: 'result',
        message: `${asin} 已完成`,
        current: asin,
        completed: index + 1,
        total: asins.length,
        result,
      });
    }
    return results;
  } finally {
    await context.close().catch(() => {});
  }
}

module.exports = {
  canonicalUrl,
  challengeDetected,
  detectImage,
  extractPageData,
  scrapeProducts,
};
