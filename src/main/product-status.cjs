const ASIN_PATTERN = /^[A-Z0-9]{10}$/;
const AMAZON_BASE_URL = 'https://www.amazon.com';
const US_POSTAL_CODE = '10001';
const SESSION_TTL_MS = 30 * 60 * 1000;
const BROWSER_HEADERS = Object.freeze({
  accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'accept-language': 'en-US,en;q=0.9',
  'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/128.0.0.0 Safari/537.36',
});

let cachedUsSession = null;

function normalizeAsin(value) {
  const raw = String(value || '').trim().toUpperCase();
  if (ASIN_PATTERN.test(raw)) return raw;
  try {
    const url = new URL(raw);
    if (!/(^|\.)amazon\.com$/i.test(url.hostname)) return null;
    const match = url.pathname.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})(?:\/|$)/i);
    return match && ASIN_PATTERN.test(match[1].toUpperCase()) ? match[1].toUpperCase() : null;
  } catch {
    return null;
  }
}

function decodeHtml(value) {
  return String(value || '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripTags(value) {
  return decodeHtml(String(value || '').replace(/<[^>]+>/g, ' '));
}

function matchFirst(html, patterns) {
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) {
      const value = stripTags(match[1]);
      if (value) return value;
    }
  }
  return null;
}

function sectionAroundId(html, id, length = 9000) {
  const index = html.search(new RegExp(`id=["']${id}["']`, 'i'));
  return index >= 0 ? html.slice(index, index + length) : '';
}

function primaryProductScope(html) {
  const source = String(html || '');
  const centerIndex = source.search(/id=["']centerCol["']/i);
  return centerIndex >= 0 ? source.slice(centerIndex, centerIndex + 250_000) : source;
}

function hasLimitedTimeDealForAsin(html, asin) {
  const source = String(html || '');
  const requestedAsin = String(asin || '').toUpperCase();
  const featurePattern = /<div\b[^>]*data-feature-name=["']dealBadge["'][^>]*>/gi;
  let featureFound = false;
  for (const feature of source.matchAll(featurePattern)) {
    const taggedAsin = feature[0].match(/data-csa-c-asin=["']([A-Z0-9]{10})["']/i)?.[1]?.toUpperCase();
    if (requestedAsin && taggedAsin && taggedAsin !== requestedAsin) continue;
    featureFound = true;
    const remainder = source.slice((feature.index || 0) + feature[0].length, (feature.index || 0) + feature[0].length + 5_000);
    const nextFeature = remainder.search(/<div\b[^>]*data-feature-name=/i);
    const featureBody = nextFeature >= 0 ? remainder.slice(0, nextFeature) : remainder;
    if (/limited[- ]time deal/i.test(stripTags(featureBody))) return true;
  }
  if (featureFound || /id=["']centerCol["']/i.test(source)) return false;
  return /limited[- ]time deal/i.test(stripTags(source));
}

function currencyFromPrice(price, html) {
  const value = String(price || '').trim();
  if (/CNY|CN\s*[¥￥]|[¥￥]/i.test(value)) return 'CNY';
  if (/USD|US\s*\$|\$/i.test(value)) return 'USD';
  const sourceCurrency = matchFirst(html, [
    /itemprop=["']priceCurrency["'][^>]*content=["']([^"']+)["']/i,
    /["']priceCurrency["']\s*:\s*["']([^"']+)["']/i,
  ]);
  return sourceCurrency?.toUpperCase() || null;
}

function monetaryValue(value) {
  const text = stripTags(value);
  return text.match(/(?:CN\s*[¥￥]|US\s*\$|\$|[¥￥])\s*[\d,]+(?:\.\d{1,2})?|[\d,]+(?:\.\d{1,2})?\s*(?:USD|CNY)/i)?.[0] || null;
}

function priceFromSection(html) {
  const patterns = [
    /id=["']apex-pricetopay-accessibility-label["'][^>]*>([\s\S]*?)<\/span>/gi,
    /class=["'][^"']*a-offscreen[^"']*["'][^>]*>([\s\S]*?)<\/span>/gi,
    /id=["']priceblock_(?:dealprice|ourprice)["'][^>]*>([\s\S]*?)<\/(?:span|div)>/gi,
  ];
  for (const pattern of patterns) {
    for (const match of html.matchAll(pattern)) {
      const price = monetaryValue(match[1]);
      if (price) return price;
    }
  }
  const itemProp = html.match(/itemprop=["']price["'][^>]*content=["']([^"']+)["']/i)?.[1];
  return itemProp ? stripTags(itemProp) : null;
}

function parseAmazonProductHtml(html, asin = '') {
  const source = String(html || '');
  const primaryScope = primaryProductScope(source);
  const lower = source.toLowerCase();
  if (/robot check|captchacharacters|enter the characters you see/.test(lower)) {
    return {
      asin,
      queryState: 'blocked',
      checkedAt: new Date().toISOString(),
      error: 'Amazon 返回了验证码页面，请稍后手动刷新。',
    };
  }

  const priceSection = [
    sectionAroundId(source, 'corePriceDisplay_desktop_feature_div'),
    sectionAroundId(source, 'priceblock_dealprice', 1500),
    sectionAroundId(source, 'priceblock_ourprice', 1500),
  ].find(Boolean) || source;

  const rawPrice = priceFromSection(priceSection);
  const title = matchFirst(source, [
    /id=["']productTitle["'][^>]*>([\s\S]*?)<\/span>/i,
    /<title[^>]*>([\s\S]*?)<\/title>/i,
  ]);
  const ratingText = matchFirst(source, [
    /data-hook=["']rating-out-of-text["'][^>]*>([^<]+)</i,
    /id=["']acrPopover["'][^>]*title=["']([^"']+)["']/i,
    /class=["'][^"']*a-icon-alt[^"']*["'][^>]*>([^<]+(?:out of 5 stars|星))</i,
  ]);
  const reviewText = matchFirst(source, [
    /id=["']acrCustomerReviewText["'][^>]*>([^<]+)</i,
    /data-hook=["']total-review-count["'][^>]*>([^<]+)</i,
  ]);

  const ratingMatch = ratingText?.match(/(\d+(?:\.\d+)?)/);
  const reviewMatch = reviewText?.replace(/,/g, '').match(/(\d+)/);
  const hasBuyBox = /id=["']add-to-cart-button["']|name=["']submit\.add-to-cart["']/i.test(source);
  const isPrime = /a-icon-prime|prime-logo|aria-label=["'][^"']*prime/i.test(source);
  const primeDiscountMessage = matchFirst(primaryScope, [
    /id=["']primeExclusivePricingMessage["'][^>]*>([\s\S]*?)<\/(?:span|div)>/i,
  ]);
  const hasPrimeDiscount = /exclusive prime price|join prime to buy|prime exclusive (?:price|deal)|prime member price/i.test(primeDiscountMessage || '');
  const hasLimitedTimeDeal = hasLimitedTimeDealForAsin(source, asin);
  const currency = currencyFromPrice(rawPrice, source);
  const price = rawPrice && currency === 'USD' && !/\$/.test(rawPrice)
    ? `$${rawPrice}`
    : rawPrice;

  if (!title && !rawPrice && !ratingText && !hasBuyBox) {
    return {
      asin,
      queryState: 'failed',
      checkedAt: new Date().toISOString(),
      error: '未识别到商品信息，页面结构可能已变化或商品不可售。',
    };
  }

  if (rawPrice && currency && currency !== 'USD') {
    return {
      asin,
      title,
      price: null,
      rating: ratingMatch ? Number(ratingMatch[1]) : null,
      reviewCount: reviewMatch ? Number(reviewMatch[1]) : null,
      hasBuyBox,
      isPrime,
      hasPrimeDiscount,
      hasLimitedTimeDeal,
      currency,
      queryState: 'failed',
      checkedAt: new Date().toISOString(),
      error: `Amazon 返回了 ${currency} 价格，已拒绝写入；请重新刷新美国邮编数据。`,
    };
  }

  return {
    asin,
    title,
    price,
    rating: ratingMatch ? Number(ratingMatch[1]) : null,
    reviewCount: reviewMatch ? Number(reviewMatch[1]) : null,
    hasBuyBox,
    isPrime,
    hasPrimeDiscount,
    hasLimitedTimeDeal,
    currency: currency || (price ? 'USD' : null),
    queryState: 'ok',
    checkedAt: new Date().toISOString(),
    error: null,
  };
}

function mergeResponseCookies(jar, response) {
  const headers = response?.headers;
  let values = typeof headers?.getSetCookie === 'function' ? headers.getSetCookie() : [];
  if (!values.length && typeof headers?.get === 'function') {
    const combined = headers.get('set-cookie');
    if (combined) values = combined.split(/,(?=\s*[^;,=\s]+=[^;,]+)/g);
  }
  for (const value of values) {
    const pair = String(value).split(';', 1)[0];
    const separator = pair.indexOf('=');
    if (separator > 0) jar.set(pair.slice(0, separator).trim(), pair.slice(separator + 1).trim());
  }
}

function cookieHeader(jar) {
  return [...jar.entries()].map(([name, value]) => `${name}=${value}`).join('; ');
}

function csrfTokenFromHtml(html) {
  return decodeHtml(matchFirst(html, [
    /(?:CSRF_TOKEN|csrfToken)["']?\s*[:=]\s*["']([^"']+)["']/i,
    /name=["']anti-csrftoken-a2z["'][^>]*value=["']([^"']+)["']/i,
  ]) || '');
}

async function createUsAmazonSession(fetchImpl, signal) {
  const cookies = new Map([
    ['lc-main', 'en_US'],
    ['i18n-prefs', 'USD'],
  ]);
  const landingUrl = `${AMAZON_BASE_URL}/?language=en_US&currency=USD`;
  const landing = await fetchImpl(landingUrl, {
    headers: BROWSER_HEADERS,
    redirect: 'follow',
    signal,
  });
  if (!landing.ok) throw new Error(`Amazon 美国站初始化失败：HTTP ${landing.status}`);
  mergeResponseCookies(cookies, landing);
  const landingHtml = await landing.text();
  if (/robot check|captchacharacters|enter the characters you see/i.test(landingHtml)) {
    throw new Error('Amazon 美国站初始化时返回验证码，请稍后手动刷新。');
  }

  const csrfToken = csrfTokenFromHtml(landingHtml);
  const form = new URLSearchParams({
    locationType: 'LOCATION_INPUT',
    zipCode: US_POSTAL_CODE,
    storeContext: 'generic',
    pageType: 'Gateway',
    actionSource: 'glow',
  });
  const headers = {
    ...BROWSER_HEADERS,
    accept: 'application/json, text/javascript, */*; q=0.01',
    'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
    cookie: cookieHeader(cookies),
    origin: AMAZON_BASE_URL,
    referer: landingUrl,
    'x-requested-with': 'XMLHttpRequest',
  };
  if (csrfToken) headers['anti-csrftoken-a2z'] = csrfToken;
  const locationResponse = await fetchImpl(`${AMAZON_BASE_URL}/gp/delivery/ajax/address-change.html`, {
    method: 'POST',
    headers,
    body: form.toString(),
    redirect: 'follow',
    signal,
  });
  const locationBody = await locationResponse.text();
  mergeResponseCookies(cookies, locationResponse);
  if (!locationResponse.ok || /"isValidAddress"\s*:\s*(?:0|false)/i.test(locationBody)) {
    throw new Error(`Amazon 未接受美东邮编 ${US_POSTAL_CODE}，已停止价格查询。`);
  }
  return { cookies, createdAt: Date.now(), postalCode: US_POSTAL_CODE };
}

async function getUsAmazonSession(fetchImpl, signal) {
  const canCache = fetchImpl === globalThis.fetch;
  if (canCache && cachedUsSession && Date.now() - cachedUsSession.createdAt < SESSION_TTL_MS) return cachedUsSession;
  const session = await createUsAmazonSession(fetchImpl, signal);
  if (canCache) cachedUsSession = session;
  return session;
}

async function queryAmazonProduct(asin, fetchImpl = globalThis.fetch) {
  if (!normalizeAsin(asin)) throw new Error('ASIN 格式不正确');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25_000);
  try {
    const session = await getUsAmazonSession(fetchImpl, controller.signal);
    const response = await fetchImpl(`${AMAZON_BASE_URL}/dp/${asin}?th=1&psc=1&language=en_US&currency=USD`, {
      headers: {
        ...BROWSER_HEADERS,
        cookie: cookieHeader(session.cookies),
        referer: `${AMAZON_BASE_URL}/`,
      },
      redirect: 'follow',
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Amazon 页面返回 HTTP ${response.status}`);
    mergeResponseCookies(session.cookies, response);
    const result = parseAmazonProductHtml(await response.text(), asin);
    return { ...result, postalCode: US_POSTAL_CODE };
  } catch (error) {
    return {
      asin,
      queryState: 'failed',
      checkedAt: new Date().toISOString(),
      error: error.name === 'AbortError' ? '查询超时，请手动重试。' : (error.message || String(error)),
    };
  } finally {
    clearTimeout(timer);
  }
}

module.exports = {
  AMAZON_BASE_URL,
  US_POSTAL_CODE,
  createUsAmazonSession,
  hasLimitedTimeDealForAsin,
  normalizeAsin,
  parseAmazonProductHtml,
  primaryProductScope,
  queryAmazonProduct,
};
