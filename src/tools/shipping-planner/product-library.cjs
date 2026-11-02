const fs = require('node:fs');
const path = require('node:path');
const seedData = require('./products.seed.json');

function normalizeProduct(input = {}, requireComplete = true) {
  const product = {
    sku: String(input.sku || '').trim().toUpperCase(),
    fnsku: String(input.fnsku || '').trim().toUpperCase(),
    name: String(input.name || '').trim(),
  };
  if (!product.sku) throw new Error('请填写 SKU');
  if (requireComplete && !product.fnsku) throw new Error(`请填写 ${product.sku} 的 FNSKU`);
  if (requireComplete && !product.name) throw new Error(`请填写 ${product.sku} 的产品名称`);
  return product;
}

class ShippingProductLibrary {
  constructor(dataDir) {
    this.dataDir = path.resolve(dataDir);
    this.filePath = path.join(this.dataDir, 'products.json');
  }

  seedProducts() {
    return seedData.products.map((product) => normalizeProduct(product));
  }

  read() {
    if (!fs.existsSync(this.filePath)) {
      const products = this.seedProducts();
      this.write(products);
      return products;
    }
    try {
      const parsed = JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
      const source = Array.isArray(parsed) ? parsed : parsed.products;
      if (!Array.isArray(source)) throw new Error('产品库格式不正确');
      return source
        .map((product) => normalizeProduct(product, false))
        .filter((product) => product.sku);
    } catch (error) {
      throw new Error(`产品库读取失败：${error.message || error}`);
    }
  }

  write(products) {
    fs.mkdirSync(this.dataDir, { recursive: true });
    const tempPath = `${this.filePath}.tmp`;
    fs.writeFileSync(tempPath, JSON.stringify({ products }, null, 2), 'utf8');
    fs.renameSync(tempPath, this.filePath);
  }

  list() {
    return this.read().sort((left, right) => left.sku.localeCompare(right.sku, 'en'));
  }

  upsert(input) {
    const product = normalizeProduct(input);
    const products = this.read();
    const index = products.findIndex((item) => item.sku.toUpperCase() === product.sku);
    if (index >= 0) products[index] = product;
    else products.push(product);
    this.write(products);
    return product;
  }

  upsertMany(inputs) {
    const additions = (Array.isArray(inputs) ? inputs : []).map((input) => normalizeProduct(input));
    const products = this.read();
    const bySku = new Map(products.map((product) => [product.sku.toUpperCase(), product]));
    for (const product of additions) bySku.set(product.sku, product);
    this.write([...bySku.values()]);
    return this.list();
  }

  delete(sku) {
    const key = String(sku || '').trim().toUpperCase();
    if (!key) throw new Error('缺少要删除的 SKU');
    const products = this.read();
    const next = products.filter((product) => product.sku.toUpperCase() !== key);
    if (next.length === products.length) throw new Error(`产品库中不存在 ${key}`);
    this.write(next);
    return true;
  }

  missing(skus) {
    const products = this.read();
    const bySku = new Map(products.map((product) => [product.sku.toUpperCase(), product]));
    const seen = new Set();
    const missing = [];
    for (const value of Array.isArray(skus) ? skus : []) {
      const sku = String(value?.sku || value || '').trim().toUpperCase();
      if (!sku || seen.has(sku)) continue;
      seen.add(sku);
      const product = bySku.get(sku) || { sku, fnsku: '', name: '' };
      if (!product.fnsku || !product.name) missing.push({ ...product });
    }
    return missing;
  }
}

function shippingProductDataDir(app) {
  return path.join(app.getPath('userData'), 'tools', 'shipping-planner', 'data');
}

module.exports = {
  ShippingProductLibrary,
  normalizeProduct,
  shippingProductDataDir,
};
