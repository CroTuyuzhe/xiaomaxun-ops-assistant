const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { ShippingProductLibrary } = require('../src/tools/shipping-planner/product-library.cjs');

function withLibrary(run) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'xiaomaxun-products-'));
  try {
    return run(new ShippingProductLibrary(path.join(root, 'data')));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

test('shipping product library initializes 17 fictional example product records on first use', () => {
  withLibrary((library) => {
    const products = library.list();
    assert.equal(products.length, 17);
    assert.deepEqual(products.find((item) => item.sku === 'DEMO-SKU-02'), {
      sku: 'DEMO-SKU-02',
      fnsku: 'DEMO-FNSKU-02',
      name: '示例产品 02',
    });
    assert.equal(fs.existsSync(library.filePath), true);
  });
});

test('shipping product library supports add, edit, delete and incomplete preflight', () => {
  withLibrary((library) => {
    library.upsert({ sku: 'demo-sku', fnsku: 'fnsku-1', name: '测试产品' });
    assert.deepEqual(library.list().find((item) => item.sku === 'DEMO-SKU'), {
      sku: 'DEMO-SKU', fnsku: 'FNSKU-1', name: '测试产品',
    });
    library.upsert({ sku: 'DEMO-SKU', fnsku: 'FNSKU-2', name: '更新名称' });
    assert.equal(library.list().find((item) => item.sku === 'DEMO-SKU').name, '更新名称');
    assert.deepEqual(library.missing(['DEMO-SKU-02', 'UNKNOWN-SKU']), [
      { sku: 'UNKNOWN-SKU', fnsku: '', name: '' },
    ]);
    library.delete('demo-sku');
    assert.equal(library.list().some((item) => item.sku === 'DEMO-SKU'), false);
  });
});

test('shipping product library requires names so Excel cannot silently contain a blank product name', () => {
  withLibrary((library) => {
    assert.throws(
      () => library.upsert({ sku: 'NO-NAME', fnsku: 'X000000000', name: '' }),
      /产品名称/,
    );
  });
});
