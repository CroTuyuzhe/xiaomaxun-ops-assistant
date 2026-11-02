const { contextBridge, ipcRenderer } = require('electron');

function subscribe(channel, callback) {
  const handler = (_event, payload) => callback(payload);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}

contextBridge.exposeInMainWorld('xiaomaxun', {
  state: {
    get: () => ipcRenderer.invoke('state:get'),
    onChanged: (callback) => subscribe('state:changed', callback),
  },
  settings: {
    update: (changes) => ipcRenderer.invoke('settings:update', changes),
  },
  todos: {
    add: (input) => ipcRenderer.invoke('todos:add', input),
    toggle: (id) => ipcRenderer.invoke('todos:toggle', id),
    restore: (id) => ipcRenderer.invoke('todos:restore', id),
    remove: (id) => ipcRenderer.invoke('todos:delete', id),
  },
  products: {
    add: (input) => ipcRenderer.invoke('products:add', input),
    setDeadline: (id, deadline) => ipcRenderer.invoke('products:set-deadline', id, deadline),
    remove: (id) => ipcRenderer.invoke('products:delete', id),
    refreshAll: () => ipcRenderer.invoke('products:refresh-all'),
    refreshOne: (id) => ipcRenderer.invoke('products:refresh-one', id),
    startupRefresh: () => ipcRenderer.invoke('products:startup-refresh'),
    open: (asin) => ipcRenderer.invoke('products:open', asin),
    onRefreshProgress: (callback) => subscribe('products:refresh-progress', callback),
  },
  tools: {
    list: () => ipcRenderer.invoke('tools:list'),
  },
  keywordRank: {
    check: () => ipcRenderer.invoke('keyword-rank:check'),
    chooseOutput: () => ipcRenderer.invoke('keyword-rank:choose-output'),
    saveConfig: (input) => ipcRenderer.invoke('keyword-rank:save-config', input),
    start: (input) => ipcRenderer.invoke('keyword-rank:start', input),
    get: (id) => ipcRenderer.invoke('keyword-rank:get', id),
    openOutput: (outputDir) => ipcRenderer.invoke('keyword-rank:open-output', outputDir),
    onProgress: (callback) => subscribe('keyword-rank:progress', callback),
  },
  daily: {
    check: () => ipcRenderer.invoke('daily:check'),
    chooseExcel: (kind) => ipcRenderer.invoke('daily:choose-excel', kind),
    saveConfig: (input) => ipcRenderer.invoke('daily:save-config', input),
    inspectWps: () => ipcRenderer.invoke('daily:inspect-wps'),
    launchPages: () => ipcRenderer.invoke('daily:launch-pages'),
    openRating: (asin) => ipcRenderer.invoke('daily:open-rating', asin),
    run: (input) => ipcRenderer.invoke('daily:run', input),
    traffic: (input) => ipcRenderer.invoke('daily:traffic', input),
    onProgress: (callback) => subscribe('daily:progress', callback),
  },
  shipping: {
    check: () => ipcRenderer.invoke('shipping:check'),
    choosePdfs: () => ipcRenderer.invoke('shipping:choose-pdfs'),
    chooseFolder: (kind) => ipcRenderer.invoke('shipping:choose-folder', kind),
    inspect: (input) => ipcRenderer.invoke('shipping:inspect', input),
    listProducts: () => ipcRenderer.invoke('shipping:products:list'),
    saveProduct: (input) => ipcRenderer.invoke('shipping:products:save', input),
    saveProducts: (inputs) => ipcRenderer.invoke('shipping:products:save-many', inputs),
    deleteProduct: (sku) => ipcRenderer.invoke('shipping:products:delete', sku),
    run: (input) => ipcRenderer.invoke('shipping:run', input),
    openOutput: (outputDir) => ipcRenderer.invoke('shipping:open-output', outputDir),
  },
  competitor: {
    start: (input) => ipcRenderer.invoke('competitor:start', input),
    get: (id) => ipcRenderer.invoke('competitor:get', id),
    save: (id) => ipcRenderer.invoke('competitor:save', id),
    onProgress: (callback) => subscribe('competitor:progress', callback),
  },
  window: {
    getDockState: () => ipcRenderer.invoke('window:get-dock-state'),
    toggleDock: () => ipcRenderer.invoke('window:toggle-dock'),
    togglePin: () => ipcRenderer.invoke('window:toggle-pin'),
    hideDocked: () => ipcRenderer.invoke('window:hide-docked'),
    setAutoHidePaused: (paused) => ipcRenderer.invoke('window:set-auto-hide-paused', paused),
    minimize: () => ipcRenderer.invoke('window:minimize'),
    closeToTray: () => ipcRenderer.invoke('window:close-to-tray'),
    onDockState: (callback) => subscribe('window:dock-state', callback),
  },
});
