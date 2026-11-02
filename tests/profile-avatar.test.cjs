const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeProfileAvatar } = require('../src/main/profile-avatar.cjs');

function dataUrl(type, bytes) {
  return `data:image/${type};base64,${Buffer.from(bytes).toString('base64')}`;
}

test('profile avatar accepts supported raster image data and empty reset values', () => {
  const png = dataUrl('png', [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const jpeg = dataUrl('jpeg', [0xff, 0xd8, 0xff, 0xdb]);
  const webp = dataUrl('webp', Buffer.from('RIFF0000WEBP'));
  assert.equal(normalizeProfileAvatar(''), '');
  assert.equal(normalizeProfileAvatar(png), png);
  assert.equal(normalizeProfileAvatar(jpeg), jpeg);
  assert.equal(normalizeProfileAvatar(webp), webp);
});

test('profile avatar rejects SVG and mismatched file signatures', () => {
  assert.throws(() => normalizeProfileAvatar('data:image/svg+xml;base64,PHN2Zz4='), /格式不支持/);
  assert.throws(() => normalizeProfileAvatar(dataUrl('png', Buffer.from('not a png'))), /格式不匹配/);
});
