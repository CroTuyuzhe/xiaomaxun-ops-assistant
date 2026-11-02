(function exposeUnitConverter(root, factory) {
  const converter = factory();
  if (typeof module === 'object' && module.exports) module.exports = converter;
  if (root) root.unitConverter = converter;
}(typeof window !== 'undefined' ? window : globalThis, () => {
  const UNITS = Object.freeze({
    mm: Object.freeze({ kind: 'length', label: 'mm', factor: 0.001 }),
    cm: Object.freeze({ kind: 'length', label: 'cm', factor: 0.01 }),
    m: Object.freeze({ kind: 'length', label: 'm', factor: 1 }),
    in: Object.freeze({ kind: 'length', label: 'inch', factor: 0.0254 }),
    ft: Object.freeze({ kind: 'length', label: 'ft', factor: 0.3048 }),
    g: Object.freeze({ kind: 'weight', label: 'g', factor: 0.001 }),
    kg: Object.freeze({ kind: 'weight', label: 'kg', factor: 1 }),
    oz: Object.freeze({ kind: 'weight', label: 'oz', factor: 0.028349523125 }),
    lb: Object.freeze({ kind: 'weight', label: 'lb', factor: 0.45359237 }),
  });

  const UNIT_PATTERNS = [
    ['mm', /(?:毫米|millimet(?:er|re)s?|(?<![a-z])mm(?![a-z]))/i],
    ['cm', /(?:厘米|centimet(?:er|re)s?|(?<![a-z])cm(?![a-z]))/i],
    ['in', /(?:英寸|inches|inch|(?<![a-z])in(?![a-z])|[″”"])/i],
    ['ft', /(?:英尺|feet|foot|(?<![a-z])ft(?![a-z])|[′’'])/i],
    ['kg', /(?:千克|公斤|kilograms?|kilogrammes?|(?<![a-z])kgs?(?![a-z]))/i],
    ['oz', /(?:盎司|ounces?|(?<![a-z])oz(?![a-z]))/i],
    ['lb', /(?:磅|pounds?|(?<![a-z])lbs?(?![a-z]))/i],
    ['m', /(?:米|met(?:er|re)s?|(?<![a-z])m(?![a-z]))/i],
    ['g', /(?:克|grams?|grammes?|(?<![a-z])g(?![a-z]))/i],
  ];

  function getUnit(code) {
    const unit = UNITS[code];
    if (!unit) throw new Error(`不支持的单位：${code}`);
    return unit;
  }

  function convert(value, fromCode, toCode) {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) throw new Error('请输入有效数字');
    const from = getUnit(fromCode);
    const to = getUnit(toCode);
    if (from.kind !== to.kind) throw new Error('长度与重量单位不能互相换算');
    return (numericValue * from.factor) / to.factor;
  }

  function detectUnit(text) {
    const source = String(text || '');
    const match = UNIT_PATTERNS.find(([, pattern]) => pattern.test(source));
    return match ? match[0] : null;
  }

  function extractNumbers(text) {
    const normalized = String(text || '').replaceAll(',', '');
    return (normalized.match(/[-+]?(?:\d+(?:\.\d+)?|\.\d+)/g) || [])
      .map(Number)
      .filter(Number.isFinite);
  }

  function formatNumber(value, digits = 4) {
    if (!Number.isFinite(Number(value))) return '';
    return Number(value).toFixed(digits).replace(/\.?0+$/, '');
  }

  function smartConvert(text, targetCode = 'in', fallbackSourceCode = 'cm') {
    const values = extractNumbers(text);
    if (!values.length) throw new Error('没有识别到可换算的数字');
    const sourceCode = detectUnit(text) || fallbackSourceCode;
    const source = getUnit(sourceCode);
    const target = getUnit(targetCode);
    if (source.kind !== target.kind) throw new Error('识别到的单位与目标单位类型不一致');
    const converted = values.map((value) => convert(value, sourceCode, targetCode));
    return {
      sourceCode,
      targetCode,
      kind: source.kind,
      values,
      converted,
      output: `${converted.map((value) => Number(value).toFixed(2)).join(' × ')} ${target.label}`,
    };
  }

  return Object.freeze({ UNITS, convert, detectUnit, extractNumbers, formatNumber, smartConvert });
}));
