const test = require('node:test');
const assert = require('node:assert/strict');
const { classify } = require('../src/renderer/todo-views.js');

test('today excludes completed and overdue temporary todos; history groups both', () => {
  const now = new Date(2026, 8, 14, 10, 0);
  const todos = [
    { id: 'active', kind: 'temporary', title: 'today', completed: false, dueAt: null },
    { id: 'overdue', kind: 'temporary', title: 'old', completed: false, dueAt: new Date(2026, 8, 13, 12).toISOString() },
    { id: 'done', kind: 'temporary', title: 'done', completed: true, completedAt: now.toISOString() },
    { id: 'future', kind: 'temporary', title: 'future', completed: false, dueAt: new Date(2026, 8, 15, 12).toISOString() },
  ];
  const views = classify(todos, now);
  assert.deepEqual(views.today.map((item) => item.id), ['active']);
  assert.deepEqual(views.history.map((item) => [item.todo.id, item.status]), [['overdue', 'overdue'], ['done', 'completed']]);
});

test('completed fixed occurrence goes to history without deleting its recurring plan', () => {
  const now = new Date(2026, 8, 14, 10, 0);
  const fixed = {
    id: 'fixed', kind: 'fixed', recurrence: 'daily', title: 'check',
    completedDates: ['2026-09-13', '2026-09-14'],
  };
  const views = classify([fixed], now);
  assert.equal(views.today.length, 0);
  assert.deepEqual(views.history.map((entry) => entry.dateKey), ['2026-09-14', '2026-09-13']);
  assert.equal(fixed.completedDates.length, 2);
});
