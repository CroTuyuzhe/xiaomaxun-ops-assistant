const test = require('node:test');
const assert = require('node:assert/strict');
const {
  hasLimitedTimeDealForAsin,
  normalizeAsin,
  parseAmazonProductHtml,
  queryAmazonProduct,
} = require('../src/main/product-status.cjs');

test('normalizeAsin accepts ASIN and supported amazon.com links', () => {
  assert.equal(normalizeAsin('B0FBFR5WLX'), 'B0FBFR5WLX');
  assert.equal(normalizeAsin('https://www.amazon.com/dp/B0F1BX6N4M?th=1'), 'B0F1BX6N4M');
  assert.equal(normalizeAsin('https://amazon.com/gp/product/B0F1BX6N4M/ref=x'), 'B0F1BX6N4M');
  assert.equal(normalizeAsin('https://amazon.ca/dp/B0F1BX6N4M'), null);
  assert.equal(normalizeAsin('not-an-asin'), null);
});

test('parseAmazonProductHtml extracts the requested product status fields', () => {
  const html = `
    <span id="productTitle"> Sample Product </span>
    <div id="corePriceDisplay_desktop_feature_div"><span class="a-offscreen">$29.99</span></div>
    <span data-hook="rating-out-of-text">4.6 out of 5</span>
    <span id="acrCustomerReviewText">1,234 ratings</span>
    <input id="add-to-cart-button">
    <i class="a-icon a-icon-prime"></i>
    <span>Limited time deal</span>`;
  const result = parseAmazonProductHtml(html, 'B0F1BX6N4M');
  assert.equal(result.queryState, 'ok');
  assert.equal(result.title, 'Sample Product');
  assert.equal(result.price, '$29.99');
  assert.equal(result.rating, 4.6);
  assert.equal(result.reviewCount, 1234);
  assert.equal(result.hasBuyBox, true);
  assert.equal(result.isPrime, true);
  assert.equal(result.hasPrimeDiscount, false);
  assert.equal(result.hasLimitedTimeDeal, true);
});

test('deal and Prime discount ignore recommendations, Prime shipping, and hidden variation JSON', () => {
  const html = `
    <div id="centerCol">
      <span id="productTitle">No Deal Product</span>
      <div id="corePriceDisplay_desktop_feature_div"><span class="a-offscreen">$54.99</span></div>
      <div data-feature-name="dealBadge" data-csa-c-asin="B0FM7MTM5W"></div>
      <i class="a-icon a-icon-prime"></i>
      <script>{"priceToPayLabel":"Prime Price:","buyingOptionType":"PRIME_SAVINGS_UPSELL"}</script>
    </div>
    <div data-feature-name="dealBadge" data-csa-c-asin="B0OTHER123"><span>Limited time deal</span></div>
    <input id="add-to-cart-button">`;
  const result = parseAmazonProductHtml(html, 'B0FM7MTM5W');
  assert.equal(result.isPrime, true);
  assert.equal(result.hasPrimeDiscount, false);
  assert.equal(result.hasLimitedTimeDeal, false);
  assert.equal(hasLimitedTimeDealForAsin(html, 'B0FM7MTM5W'), false);
});

test('current ASIN promotion widgets enable only their matching status', () => {
  const html = `
    <div id="centerCol">
      <span id="productTitle">Promoted Product</span>
      <div id="corePriceDisplay_desktop_feature_div"><span class="a-offscreen">$22.99</span></div>
      <div data-feature-name="dealBadge" data-csa-c-asin="B0F1BX6N4M"><span>Limited time deal</span></div>
      <div data-csa-c-asin="B0F1BX6N4M"><span id="primeExclusivePricingMessage">Exclusive Prime price</span></div>
    </div>
    <input id="add-to-cart-button">`;
  const result = parseAmazonProductHtml(html, 'B0F1BX6N4M');
  assert.equal(result.hasPrimeDiscount, true);
  assert.equal(result.hasLimitedTimeDeal, true);
});

test('price parser skips hidden blank nodes and uses Amazon price-to-pay text', () => {
  const result = parseAmazonProductHtml(`
    <span id="productTitle">Sample Product</span>
    <div id="corePriceDisplay_desktop_feature_div">
      <span class="a-price priceToPay"><span class="a-offscreen"> </span></span>
      <span id="apex-pricetopay-accessibility-label">$22.99 with 23 percent savings</span>
    </div>
    <input id="add-to-cart-button">`, 'B0FBFR5WLX');
  assert.equal(result.price, '$22.99');
  assert.equal(result.currency, 'USD');
});

test('parseAmazonProductHtml reports captcha without false status values', () => {
  const result = parseAmazonProductHtml('<title>Robot Check</title><input id="captchacharacters">', 'B0F1BX6N4M');
  assert.equal(result.queryState, 'blocked');
  assert.equal(result.hasBuyBox, undefined);
});

test('parseAmazonProductHtml refuses non-USD prices', () => {
  const result = parseAmazonProductHtml(`
    <span id="productTitle">Sample Product</span>
    <div id="corePriceDisplay_desktop_feature_div"><span class="a-offscreen">CN¥199.00</span></div>
    <input id="add-to-cart-button">`, 'B0F1BX6N4M');
  assert.equal(result.queryState, 'failed');
  assert.equal(result.price, null);
  assert.equal(result.currency, 'CNY');
  assert.match(result.error, /拒绝写入/);
});

test('queryAmazonProduct sets New York ZIP and USD preferences before requesting the product', async () => {
  const calls = [];
  const response = (body, cookies = []) => ({
    ok: true,
    status: 200,
    headers: { getSetCookie: () => cookies, get: () => null },
    text: async () => body,
  });
  const fetchMock = async (url, options = {}) => {
    calls.push({ url, options });
    if (calls.length === 1) return response('<script>CSRF_TOKEN : "token-123"</script>', ['session-id=test-session; Path=/']);
    if (calls.length === 2) return response('{"isValidAddress":1}');
    return response(`
      <span id="productTitle">US Product</span>
      <meta itemprop="priceCurrency" content="USD">
      <div id="corePriceDisplay_desktop_feature_div"><span class="a-offscreen">$19.99</span></div>
      <input id="add-to-cart-button">`);
  };

  const result = await queryAmazonProduct('B0F1BX6N4M', fetchMock);
  assert.equal(calls.length, 3);
  assert.match(calls[0].url, /language=en_US&currency=USD/);
  assert.match(calls[1].url, /address-change\.html/);
  assert.match(calls[1].options.body, /zipCode=10001/);
  assert.equal(calls[1].options.headers['anti-csrftoken-a2z'], 'token-123');
  assert.match(calls[2].url, /language=en_US&currency=USD/);
  assert.match(calls[2].options.headers.cookie, /i18n-prefs=USD/);
  assert.equal(result.price, '$19.99');
  assert.equal(result.currency, 'USD');
  assert.equal(result.postalCode, '10001');
});
