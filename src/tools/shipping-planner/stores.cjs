function storeName(value) {
  const name = String(value ?? '').trim();
  if (!name || name.length > 60 || /[\u0000-\u001f\u007f]/.test(name)) {
    throw new Error('店铺名称需为 1–60 个字符，不能包含换行');
  }
  return name;
}

function normalizeStoreSettings(settings = {}) {
  const stores = [];
  const add = (value) => {
    try {
      const name = storeName(value);
      if (!stores.some((item) => item.toLowerCase() === name.toLowerCase())) stores.push(name);
    } catch { /* Ignore invalid legacy entries. */ }
  };
  if (Array.isArray(settings.stores)) settings.stores.forEach(add);
  // Preserve a previous selection when migrating versions without an editable list.
  add(settings.store);
  const selected = stores.find((name) => name.toLowerCase() === String(settings.store || '').trim().toLowerCase());
  return { ...settings, stores, store: selected || stores[0] || '' };
}

function changeStoreSettings(settings, input = {}) {
  const next = normalizeStoreSettings(settings);
  const current = String(input.current ?? '').trim();
  const index = next.stores.indexOf(current);
  if (input.action === 'select') {
    if (index < 0) throw new Error('请选择已保存的店铺');
    next.store = current;
    return next;
  }
  if (input.action === 'remove') {
    if (index < 0) throw new Error('请选择要移除的店铺');
    next.stores.splice(index, 1);
    if (next.store === current) next.store = next.stores[Math.min(index, next.stores.length - 1)] || '';
    return next;
  }
  if (!['add', 'rename'].includes(input.action)) throw new Error('无效的店铺操作');
  const name = storeName(input.name);
  if (input.action === 'rename' && index < 0) throw new Error('请选择要修改的店铺');
  if (next.stores.some((item, i) => item.toLowerCase() === name.toLowerCase()
      && !(input.action === 'rename' && i === index))) throw new Error('该店铺名称已存在');
  if (input.action === 'add') next.stores.push(name);
  else next.stores[index] = name;
  next.store = name;
  return next;
}

module.exports = { storeName, normalizeStoreSettings, changeStoreSettings };
