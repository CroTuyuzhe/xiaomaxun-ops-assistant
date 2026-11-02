const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeWeekdays, todoOccursOnDate } = require('../src/main/todo-schedule.cjs');

function localDate(year, month, day) {
  return new Date(year, month - 1, day, 9, 0);
}

test('weekly schedule supports multiple selected days including Sunday', () => {
  const todo = { kind: 'fixed', recurrence: 'weekly', weekdays: [1, 3, 0] };
  assert.deepEqual(normalizeWeekdays([3, 1, 3, 0, 7, -1, 2.5, 'bad']), [0, 1, 3]);
  assert.equal(todoOccursOnDate(todo, localDate(2026, 9, 14)), true); // Monday
  assert.equal(todoOccursOnDate(todo, localDate(2026, 9, 15)), false);
  assert.equal(todoOccursOnDate(todo, localDate(2026, 9, 16)), true);
  assert.equal(todoOccursOnDate(todo, localDate(2026, 9, 20)), true); // Sunday
});

test('old weekly todos without a weekday list retain their original weekday', () => {
  const todo = {
    kind: 'fixed', recurrence: 'weekly',
    dueAt: localDate(2026, 9, 15).toISOString(),
  };
  assert.equal(todoOccursOnDate(todo, localDate(2026, 9, 15)), true);
  assert.equal(todoOccursOnDate(todo, localDate(2026, 9, 16)), false);
});

test('daily and monthly fixed schedules keep their existing behavior', () => {
  assert.equal(todoOccursOnDate({ kind: 'fixed', recurrence: 'daily' }, localDate(2026, 9, 14)), true);
  const monthly = { kind: 'fixed', recurrence: 'monthly', dueAt: localDate(2026, 8, 14).toISOString() };
  assert.equal(todoOccursOnDate(monthly, localDate(2026, 9, 14)), true);
  assert.equal(todoOccursOnDate(monthly, localDate(2026, 9, 15)), false);
});
