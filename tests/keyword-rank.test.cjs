const test = require('node:test');
const assert = require('node:assert/strict');

const {
  authStateShowsLoggedIn,
  normalizeAsin,
  normalizeKeywordJobs,
  normalizeKeywords,
} = require('../src/tools/keyword-rank/runner.cjs');

test('keyword rank waits for the plugin to restore a real signed-in UI', () => {
  assert.equal(authStateShowsLoggedIn({ loginBoxVisible: true, userBoxVisible: false }), false);
  assert.equal(authStateShowsLoggedIn({ loginBoxVisible: true, userBoxVisible: true }), false);
  assert.equal(authStateShowsLoggedIn({
    loginBoxVisible: false,
    userBoxVisible: true,
    username: '',
  }), true, 'an empty username must not reopen the login modal after session restore');
});

test('keyword rank normalizes ASINs and Amazon links', () => {
  assert.equal(normalizeAsin(' b0fx1ynz6m '), 'B0FX1YNZ6M');
  assert.equal(normalizeAsin('https://www.amazon.com/dp/B0G2CCNQR1?th=1'), 'B0G2CCNQR1');
  assert.equal(normalizeAsin('https://example.com/dp/B0G2CCNQR1'), '');
});

test('keyword rank cleans blank lines, hidden characters, and duplicates', () => {
  assert.deepEqual(normalizeKeywords(' cutting board \nCUTTING BOARD\n\ufffcsourdough starter\n'), [
    'cutting board',
    'sourdough starter',
  ]);
});

test('keyword rank validates and normalizes configurable jobs', () => {
  assert.deepEqual(normalizeKeywordJobs([{
    asin: 'b0fx1ynz6m',
    postcode: '10110',
    keywords: ['pots and pans', 'cookware'],
    excludePreviouslyViewed: true,
  }]), [{
    asin: 'B0FX1YNZ6M',
    postcode: '10110',
    keywords: ['pots and pans', 'cookware'],
    excludePreviouslyViewed: true,
  }]);
  assert.throws(() => normalizeKeywordJobs([{
    asin: 'B0FX1YNZ6M',
    postcode: 'abc',
    keywords: ['cookware'],
  }]), /邮编格式不正确/);
});
