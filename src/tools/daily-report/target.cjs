const ASIN_IN_TEXT = /(?:^|[^A-Z0-9])(B0[A-Z0-9]{8})(?![A-Z0-9])/i;

function extractAsin(value) {
  const match = String(value || '').toUpperCase().match(ASIN_IN_TEXT);
  return match ? match[1] : '';
}

function uniqueAsins(values) {
  return [...new Set(values.map(extractAsin).filter(Boolean))];
}

function groupAsins(groups) {
  return uniqueAsins((Array.isArray(groups) ? groups : []).flatMap((group) => [
    group?.asin,
    group?.name,
    group?.source,
    group?.keyword,
  ]));
}

function resolveDailyTrafficTarget(input = {}, inspected = {}) {
  const explicitInput = String(input?.asin || '').trim();
  if (explicitInput) {
    const asin = extractAsin(explicitInput);
    if (!asin) throw new Error('流量词 ASIN 格式不正确');
    return { asin, source: 'explicit' };
  }

  const configured = groupAsins(input?.groups);
  if (configured.length === 1) return { asin: configured[0], source: 'group' };

  const workbooks = Array.isArray(inspected?.workbooks) ? inspected.workbooks : [];
  const active = uniqueAsins(workbooks.filter((item) => item?.isActive).map((item) => item.asin));
  if (active.length === 1) return { asin: active[0], source: 'active-workbook' };

  const detected = uniqueAsins(workbooks.map((item) => item.asin));
  if (detected.length === 1) return { asin: detected[0], source: 'only-asin' };
  if (!workbooks.length) throw new Error('找不到已打开的 WPS 日表，请先打开目标日表后重试');
  throw new Error('检测到多个 WPS 日表：请切换到目标日表后重试，或在流量词区域填写 ASIN');
}

module.exports = { extractAsin, groupAsins, resolveDailyTrafficTarget, uniqueAsins };
