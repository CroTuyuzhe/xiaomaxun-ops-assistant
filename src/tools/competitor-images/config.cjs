const fs = require('node:fs');

const MARKETPLACE = Object.freeze({
  name: 'amazon.com',
  baseUrl: 'https://www.amazon.com',
  locale: 'en-US',
  cookie: 'lc-main',
  language: 'en_US',
  currency: 'USD',
  postalCode: '10001',
});

function findBrowserExecutable() {
  const candidates = [
    process.env.BROWSER_EXECUTABLE,
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    process.env.LOCALAPPDATA && `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
  ].filter(Boolean);
  return candidates.find((candidate) => fs.existsSync(candidate)) || null;
}

module.exports = { MARKETPLACE, findBrowserExecutable };
