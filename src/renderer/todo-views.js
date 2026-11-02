(function exposeTodoViews(root) {
  function dateKey(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function occursToday(todo, now) {
    if (todo.kind !== 'fixed' || todo.recurrence === 'daily') return true;
    if (todo.recurrence === 'weekly' && Array.isArray(todo.weekdays)) {
      return todo.weekdays.includes(now.getDay());
    }
    const anchor = new Date(todo.dueAt || todo.createdAt);
    if (Number.isNaN(anchor.getTime())) return true;
    if (todo.recurrence === 'weekly') return anchor.getDay() === now.getDay();
    if (todo.recurrence === 'monthly') return anchor.getDate() === now.getDate();
    return true;
  }

  function classify(todos, now = new Date()) {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    const end = new Date(now);
    end.setHours(23, 59, 59, 999);
    const todayKey = dateKey(now);
    const today = [];
    const history = [];

    for (const todo of todos) {
      if (todo.kind === 'fixed') {
        if (occursToday(todo, now) && !(todo.completedDates || []).includes(todayKey)) today.push(todo);
        for (const completedDate of new Set(todo.completedDates || [])) {
          if (!/^\d{4}-\d{2}-\d{2}$/.test(completedDate) || completedDate > todayKey) continue;
          history.push({ todo, status: 'completed', dateKey: completedDate, fixed: true });
        }
        continue;
      }

      const due = todo.dueAt ? new Date(todo.dueAt) : null;
      const validDue = due && !Number.isNaN(due.getTime()) ? due : null;
      if (todo.completed) {
        const completedAt = new Date(todo.completedAt || todo.dueAt || todo.createdAt || now);
        history.push({ todo, status: 'completed', dateKey: dateKey(Number.isNaN(completedAt.getTime()) ? now : completedAt), fixed: false });
      } else if (validDue && validDue < start) {
        history.push({ todo, status: 'overdue', dateKey: dateKey(validDue), fixed: false });
      } else if (!validDue || validDue <= end) {
        today.push(todo);
      }
    }

    history.sort((a, b) => {
      if (a.status !== b.status) return a.status === 'overdue' ? -1 : 1;
      return b.dateKey.localeCompare(a.dateKey);
    });
    return { today, history };
  }

  const api = { classify, occursToday, dateKey };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.todoViews = api;
})(globalThis);
