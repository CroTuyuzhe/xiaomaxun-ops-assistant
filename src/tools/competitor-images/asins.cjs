const ASIN_PATTERN = /^[A-Z0-9]{10}$/;
const MAX_ASINS = 25;

function parseAsins(input) {
  const tokens = String(input || '')
    .toUpperCase()
    .split(/[\s,，;；]+/)
    .map((item) => item.trim())
    .filter(Boolean);
  const unique = [...new Set(tokens)];
  return {
    valid: unique.filter((item) => ASIN_PATTERN.test(item)),
    invalid: unique.filter((item) => !ASIN_PATTERN.test(item)),
  };
}

function validateAsins(input) {
  const parsed = parseAsins(input);
  if (parsed.invalid.length) throw new Error(`以下内容不是 10 位 ASIN：${parsed.invalid.join('、')}`);
  if (!parsed.valid.length) throw new Error('请至少输入 1 个有效 ASIN');
  if (parsed.valid.length > MAX_ASINS) throw new Error(`单次最多采集 ${MAX_ASINS} 个 ASIN`);
  return parsed.valid;
}

module.exports = { ASIN_PATTERN, MAX_ASINS, parseAsins, validateAsins };
