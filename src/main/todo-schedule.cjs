function normalizeWeekdays(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(Number).filter((day) => Number.isInteger(day) && day >= 0 && day <= 6))]
    .sort((a, b) => a - b);
}

function todoOccursOnDate(todo, now) {
  if (todo.kind !== 'fixed' || todo.recurrence === 'daily') return true;
  if (todo.recurrence === 'weekly' && Array.isArray(todo.weekdays)) {
    return normalizeWeekdays(todo.weekdays).includes(now.getDay());
  }
  const anchor = new Date(todo.dueAt || todo.createdAt);
  if (Number.isNaN(anchor.getTime())) return true;
  if (todo.recurrence === 'weekly') return anchor.getDay() === now.getDay();
  if (todo.recurrence === 'monthly') return anchor.getDate() === now.getDate();
  return true;
}

module.exports = { normalizeWeekdays, todoOccursOnDate };
