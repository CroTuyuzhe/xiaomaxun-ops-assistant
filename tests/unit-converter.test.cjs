const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const root = path.join(__dirname, '..');
const converter = require(path.join(root, 'src', 'renderer', 'unit-converter.js'));
const { TOOLS } = require(path.join(root, 'src', 'main', 'tool-manifest.cjs'));

test('unit converter is exposed as a ready toolbox tool', () => {
  const tool = TOOLS.find((item) => item.id === 'unit-converter');
  assert.equal(tool?.status, 'ready');
  assert.equal(tool?.name, '尺寸和重量换算器');
});

test('default length and weight conversions are accurate', () => {
  assert.ok(Math.abs(converter.convert(1, 'cm', 'in') - 0.3937007874) < 1e-9);
  assert.ok(Math.abs(converter.convert(1, 'kg', 'lb') - 2.2046226218) < 1e-9);
  assert.equal(converter.formatNumber(converter.convert(1000, 'mm', 'm')), '1');
  assert.throws(() => converter.convert(1, 'cm', 'kg'), /不能互相换算/);
});

test('smart conversion extracts normal dimension text', () => {
  const result = converter.smartConvert('44.80×30.80×5.00 cm', 'in');
  assert.deepEqual(result.values, [44.8, 30.8, 5]);
  assert.equal(result.sourceCode, 'cm');
  assert.equal(result.output, '17.64 × 12.13 × 1.97 inch');
});

test('smart conversion accepts slash-star separators and attached units', () => {
  const result = converter.smartConvert('39.9/*25.7/*2cm', 'in');
  assert.deepEqual(result.values, [39.9, 25.7, 2]);
  assert.equal(result.output, '15.71 × 10.12 × 0.79 inch');
});

test('smart conversion supports weight text and missing-unit fallback', () => {
  assert.equal(converter.smartConvert('毛重 12.5kg', 'lb').output, '27.56 lb');
  assert.equal(converter.smartConvert('20 x 10 x 4', 'in', 'cm').output, '7.87 × 3.94 × 1.57 inch');
});
