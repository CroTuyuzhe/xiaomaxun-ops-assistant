const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { LocalStore, mergeState } = require('../src/main/local-store.cjs');
const { changeStoreSettings, normalizeStoreSettings } = require('../src/tools/shipping-planner/stores.cjs');

test('store migration preserves legacy names and unrelated shipping settings', () => {
  const state = mergeState({settings: {shippingPlanner: {store: '原有店铺', deliveryDays: 12, person: '负责人'}}});
  assert.deepEqual(state.settings.shippingPlanner.stores, ['原有店铺']);
  assert.equal(state.settings.shippingPlanner.store, '原有店铺');
  assert.equal(state.settings.shippingPlanner.deliveryDays, 12);
  assert.equal(state.settings.shippingPlanner.person, '负责人');
  assert.deepEqual(mergeState({}).settings.shippingPlanner.stores, []);
});

test('store names support add rename select remove and duplicate validation', () => {
  let s = changeStoreSettings({transport: '快船'}, {action: 'add', name: ' 北美店铺 '});
  s = changeStoreSettings(s, {action: 'add', name: 'US Shop'});
  assert.throws(() => changeStoreSettings(s, {action: 'add', name: 'us shop'}), /已存在/);
  s = changeStoreSettings(s, {action: 'rename', current: 'US Shop', name: 'US Shop 2'});
  assert.equal(s.store, 'US Shop 2');
  s = changeStoreSettings(s, {action: 'select', current: '北美店铺'});
  s = changeStoreSettings(s, {action: 'remove', current: '北美店铺'});
  assert.equal(s.store, 'US Shop 2');
  s = changeStoreSettings(s, {action: 'remove', current: 'US Shop 2'});
  assert.deepEqual(normalizeStoreSettings(s).stores, []);
  assert.equal(s.store, '');
  assert.equal(s.transport, '快船');
  for (const name of ['', ' ', 'a'.repeat(61), 'a\nb']) {
    assert.throws(() => changeStoreSettings(s, {action: 'add', name}), /1–60/);
  }
});

test('custom store list and selected name survive restart and a shipment save', (t) => {
  const dir = fs.mkdtempSync(path.join(__dirname, '../work/store-test-'));
  t.after(() => fs.rmSync(dir, {recursive: true, force: true}));
  const store = new LocalStore(dir);
  store.update((state) => {
    state.settings.shippingPlanner = changeStoreSettings(state.settings.shippingPlanner, {action: 'add', name: '测试店铺'});
    return state;
  });
  store.update((state) => {
    state.settings.shippingPlanner = {...state.settings.shippingPlanner, deliveryDays: 18};
    return state;
  });
  const saved = new LocalStore(dir).getState().settings.shippingPlanner;
  assert.deepEqual(saved.stores, ['测试店铺']);
  assert.equal(saved.store, '测试店铺');
  assert.equal(saved.deliveryDays, 18);
});
