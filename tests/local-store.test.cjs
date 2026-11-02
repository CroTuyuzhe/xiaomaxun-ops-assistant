const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { LocalStore } = require('../src/main/local-store.cjs');

test('LocalStore persists todos and products', (context) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'xiaomaxun-store-'));
  context.after(() => fs.rmSync(directory, { recursive: true, force: true }));

  const store = new LocalStore(directory);
  store.addTodo({ title: '检查广告预算', kind: 'fixed', recurrence: 'daily' });
  store.addProduct({ asin: 'B0F1BX6N4M', name: '测试产品' });
  store.update((state) => {
    state.settings.alwaysOnTop = true;
    return state;
  });

  const reopened = new LocalStore(directory).getState();
  assert.equal(reopened.todos.length, 1);
  assert.equal(reopened.todos[0].title, '检查广告预算');
  assert.equal(reopened.products.length, 1);
  assert.equal(reopened.products[0].asin, 'B0F1BX6N4M');
  assert.equal(reopened.settings.alwaysOnTop, true);
  assert.equal(reopened.settings.launchAtLogin, false);
  assert.equal(reopened.schemaVersion, 1);
});

test('weekly fixed todo saves selected weekdays and rejects empty selection', (context) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'xiaomaxun-weekdays-'));
  context.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const store = new LocalStore(directory);
  assert.throws(() => store.addTodo({ title: '周提醒', kind: 'fixed', recurrence: 'weekly', weekdays: [] }), /至少选择一个星期几/);
  store.addTodo({ title: '周提醒', kind: 'fixed', recurrence: 'weekly', weekdays: [5, 1, 5] });
  assert.deepEqual(new LocalStore(directory).getState().todos[0].weekdays, [1, 5]);
});

test('restoring an expired temporary todo makes it active today without losing its title', (context) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'xiaomaxun-restore-'));
  context.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const store = new LocalStore(directory);
  const past = new Date(Date.now() - (3 * 86400000)).toISOString();
  const added = store.addTodo({ title: '补做复盘', kind: 'temporary', dueAt: past });
  const id = added.todos[0].id;
  store.toggleTodo(id, '2026-09-14');
  const restored = store.restoreTodo(id).todos[0];
  assert.equal(restored.title, '补做复盘');
  assert.equal(restored.completed, false);
  assert.equal(restored.completedAt, null);
  assert.equal(restored.dueAt, null);
  assert.equal(new LocalStore(directory).getState().todos[0].completed, false);
});

test('expired product deadline creates a persistent system todo until a future date is set', (context) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'xiaomaxun-product-deadline-'));
  context.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const store = new LocalStore(directory);
  const added = store.addProduct({ asin: 'B0F1BX6N4M', name: '测试产品', deadline: '2026-10-15' });
  const productId = added.products[0].id;

  let state = store.syncProductDeadlineTodos('2026-10-15');
  const reminder = state.todos.find((todo) => todo.systemType === 'product-deadline');
  assert.equal(reminder.productId, productId);
  assert.match(reminder.title, /测试产品/);

  store.deleteTodo(reminder.id);
  state = store.syncProductDeadlineTodos('2026-10-15');
  assert.equal(state.todos.filter((todo) => todo.systemType === 'product-deadline').length, 1);

  store.setProductDeadline(productId, '2026-11-01');
  state = store.syncProductDeadlineTodos('2026-10-15');
  assert.equal(state.todos.some((todo) => todo.systemType === 'product-deadline'), false);
  assert.equal(state.products[0].deadline, '2026-11-01');
});
