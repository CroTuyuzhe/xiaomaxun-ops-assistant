const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { normalizeWeekdays } = require('./todo-schedule.cjs');

const DEFAULT_STATE = Object.freeze({
  schemaVersion: 1,
  settings: {
    closeToTray: true,
    windowMode: 'float',
    notificationsEnabled: true,
    startupProductRefresh: true,
    launchAtLogin: false,
    alwaysOnTop: false,
    profileAvatar: '',
    shippingPlanner: {
      store: 'StoreA',
      transport: '普船',
      deliveryDays: 45,
      person: '',
      locked: true,
      btwDir: '',
      outputDir: '',
    },
    dailyReport: {
      groups: [],
      includeRatings: true,
    },
    keywordRank: {
      jobs: [],
      outputDir: '',
    },
  },
  todos: [],
  products: [],
});

function cloneDefaultState() {
  return JSON.parse(JSON.stringify(DEFAULT_STATE));
}

function mergeState(value) {
  const base = cloneDefaultState();
  if (!value || typeof value !== 'object') return base;
  return {
    ...base,
    ...value,
    settings: { ...base.settings, ...(value.settings || {}) },
    todos: Array.isArray(value.todos) ? value.todos : [],
    products: Array.isArray(value.products) ? value.products : [],
    schemaVersion: 1,
  };
}

class LocalStore {
  constructor(baseDir) {
    this.dataDir = path.join(baseDir, 'data');
    this.filePath = path.join(this.dataDir, 'state.json');
    fs.mkdirSync(this.dataDir, { recursive: true });
    this.state = this.#load();
  }

  #load() {
    try {
      return mergeState(JSON.parse(fs.readFileSync(this.filePath, 'utf8')));
    } catch {
      const state = cloneDefaultState();
      this.#write(state);
      return state;
    }
  }

  #write(state) {
    const tempPath = `${this.filePath}.${process.pid}.tmp`;
    fs.writeFileSync(tempPath, JSON.stringify(state, null, 2), 'utf8');
    fs.copyFileSync(tempPath, this.filePath);
    fs.unlinkSync(tempPath);
  }

  getState() {
    return JSON.parse(JSON.stringify(this.state));
  }

  update(mutator) {
    const draft = this.getState();
    const next = mergeState(mutator(draft) || draft);
    if (JSON.stringify(next) === JSON.stringify(this.state)) return this.getState();
    this.#write(next);
    this.state = next;
    return this.getState();
  }

  addTodo(input) {
    const fixedWeekly = input.kind === 'fixed' && input.recurrence === 'weekly';
    const weekdays = fixedWeekly ? normalizeWeekdays(input.weekdays) : [];
    if (fixedWeekly && !weekdays.length) throw new Error('每周固定待办请至少选择一个星期几');
    return this.update((state) => {
      state.todos.unshift({
        id: crypto.randomUUID(),
        title: String(input.title || '').trim(),
        kind: input.kind === 'fixed' ? 'fixed' : 'temporary',
        recurrence: input.kind === 'fixed' ? (input.recurrence || 'daily') : null,
        weekdays: fixedWeekly ? weekdays : null,
        dueAt: input.dueAt || null,
        createdAt: new Date().toISOString(),
        completed: false,
        completedAt: null,
        completedDates: [],
        lastNotifiedAt: null,
      });
      return state;
    });
  }

  toggleTodo(id, dateKey) {
    return this.update((state) => {
      const todo = state.todos.find((item) => item.id === id);
      if (!todo) return state;
      if (todo.kind === 'fixed') {
        const completed = new Set(todo.completedDates || []);
        if (completed.has(dateKey)) completed.delete(dateKey);
        else completed.add(dateKey);
        todo.completedDates = [...completed];
      } else {
        todo.completed = !todo.completed;
        todo.completedAt = todo.completed ? new Date().toISOString() : null;
      }
      return state;
    });
  }

  restoreTodo(id) {
    return this.update((state) => {
      const todo = state.todos.find((item) => item.id === id);
      if (!todo || todo.kind === 'fixed') return state;
      todo.completed = false;
      todo.completedAt = null;
      if (todo.dueAt && new Date(todo.dueAt) < new Date().setHours(0, 0, 0, 0)) {
        todo.dueAt = null;
      }
      return state;
    });
  }

  deleteTodo(id) {
    return this.update((state) => {
      state.todos = state.todos.filter((item) => item.id !== id);
      return state;
    });
  }

  addProduct(input) {
    return this.update((state) => {
      if (state.products.some((item) => item.asin === input.asin)) return state;
      state.products.push({
        id: crypto.randomUUID(),
        asin: input.asin,
        name: String(input.name || '').trim(),
        deadline: input.deadline || null,
        status: null,
        createdAt: new Date().toISOString(),
      });
      return state;
    });
  }

  setProductDeadline(id, deadline) {
    return this.update((state) => {
      const product = state.products.find((item) => item.id === id);
      if (product) product.deadline = deadline || null;
      return state;
    });
  }

  syncProductDeadlineTodos(todayKey) {
    return this.update((state) => {
      const products = new Map(state.products.map((product) => [product.id, product]));
      const dueProductIds = new Set(state.products
        .filter((product) => product.deadline && product.deadline <= todayKey)
        .map((product) => product.id));

      state.todos = state.todos.filter((todo) => (
        todo.systemType !== 'product-deadline' || dueProductIds.has(todo.productId)
      ));

      for (const productId of dueProductIds) {
        const product = products.get(productId);
        const title = `更新 ${product.name || product.asin} 的监控截止日期`;
        let todo = state.todos.find((item) => (
          item.systemType === 'product-deadline' && item.productId === productId
        ));
        if (!todo) {
          todo = {
            id: crypto.randomUUID(),
            title,
            kind: 'temporary',
            recurrence: null,
            weekdays: null,
            dueAt: `${todayKey}T00:00:00`,
            createdAt: new Date().toISOString(),
            completed: false,
            completedAt: null,
            completedDates: [],
            lastNotifiedAt: null,
            systemType: 'product-deadline',
            productId,
          };
          state.todos.unshift(todo);
        } else {
          todo.title = title;
          todo.dueAt = `${todayKey}T00:00:00`;
          todo.completed = false;
          todo.completedAt = null;
        }
      }
      return state;
    });
  }

  deleteProduct(id) {
    return this.update((state) => {
      state.products = state.products.filter((item) => item.id !== id);
      return state;
    });
  }

  updateProductStatus(id, status) {
    return this.update((state) => {
      const product = state.products.find((item) => item.id === id);
      if (product) {
        product.status = status;
        if (!product.name && status.title) product.name = status.title;
      }
      return state;
    });
  }
}

module.exports = { LocalStore, cloneDefaultState, mergeState };
