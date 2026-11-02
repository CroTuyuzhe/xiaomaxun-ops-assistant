const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');

const display = {
  id: 1,
  bounds: { x: 0, y: 0, width: 1920, height: 1080 },
  workArea: { x: 0, y: 0, width: 1920, height: 1040 },
};
let cursor = { x: 300, y: 400 };
const fakeScreen = {
  getDisplayMatching: () => display,
  getAllDisplays: () => [display],
  getCursorScreenPoint: () => cursor,
  getDisplayNearestPoint: () => display,
};

class FakeWindow {
  constructor() {
    this.bounds = { x: 120, y: 100, width: 520, height: 700 };
    this.positions = [];
    this.visible = true;
    this.hideCalls = 0;
    this.showInactiveCalls = 0;
    this.alwaysOnTopCalls = [];
  }

  isDestroyed() { return false; }
  isMaximized() { return false; }
  isMinimized() { return false; }
  isVisible() { return this.visible; }
  getBounds() { return { ...this.bounds }; }
  setBounds(bounds) {
    this.bounds = { ...bounds };
    this.positions.push(this.bounds.y);
  }
  setPosition(x, y) {
    this.bounds = { ...this.bounds, x, y };
    this.positions.push(y);
  }
  setAlwaysOnTop(value) { this.alwaysOnTopCalls.push(value); }
  show() { this.visible = true; }
  showInactive() { this.visible = true; this.showInactiveCalls += 1; }
  hide() { this.visible = false; this.hideCalls += 1; }
  focus() {}
  restore() {}
  unmaximize() {}
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

test('dock activation animates smoothly and explicit pauses remain available', async () => {
  const originalLoad = Module._load;
  Module._load = function load(request, parent, isMain) {
    if (request === 'electron') return { screen: fakeScreen };
    return originalLoad.call(this, request, parent, isMain);
  };
  let DockController;
  try {
    ({ DockController } = require(path.join(__dirname, '..', 'src', 'main', 'dock-controller.cjs')));
  } finally {
    Module._load = originalLoad;
  }

  const window = new FakeWindow();
  const controller = new DockController(window);
  try {
    controller.dock();
    assert.equal(window.hideCalls, 0, 'docking must animate before hiding');
    await wait(90);
    assert.ok(window.positions.some((y) => y < 100), 'window should move upward during activation');
    await wait(360);
    assert.equal(window.hideCalls, 1);
    assert.equal(window.bounds.y, -704);

    cursor = { x: 300, y: 2 };
    await wait(330);
    assert.equal(window.showInactiveCalls, 1);
    assert.ok(Math.abs(window.bounds.y) <= 1);

    cursor = { x: 1000, y: 700 };
    await wait(230);
    const midwayUp = window.bounds.y;
    assert.ok(midwayUp < 0, 'leaving should begin to retract the window');
    cursor = { x: 300, y: 2 };
    const positionStart = window.positions.length;
    await wait(150);
    assert.equal(window.hideCalls, 1, 'returning to the hot zone must interrupt hiding');
    assert.ok(window.positions.slice(positionStart).every((y) => y > -704), 'reveal must not jump back to the hidden position');
    await wait(220);
    assert.ok(Math.abs(window.bounds.y) <= 1);
    assert.equal(window.showInactiveCalls, 1, 'reversing a visible window must not show it again');

    cursor = { x: 649, y: 6 };
    controller.hideDocked();
    await wait(160);
    assert.equal(window.hideCalls, 1, 'right-edge controls must remain inside the dock hover area');

    controller.setAutoHidePaused(true);
    cursor = { x: 1000, y: 700 };
    await wait(120);
    assert.equal(window.hideCalls, 1, 'open dialogs must pause auto-hide');

    controller.setAutoHidePaused(false);
    controller.setPinned(true);
    await wait(420);
    assert.equal(window.hideCalls, 1, 'pin must outrank dock auto-hide when the cursor leaves');
    assert.equal(controller.getState().revealed, true);

    controller.setPinned(false);
    await wait(560);
    assert.equal(window.hideCalls, 2);

    controller.setPinned(true);
    await wait(280);
    assert.equal(window.showInactiveCalls, 2, 'pinning a hidden dock should reveal it immediately');
    assert.ok(Math.abs(window.bounds.y) <= 1);
    assert.equal(controller.getState().revealed, true);

    controller.undock({ show: false });
    assert.equal(controller.getState().pinned, true);
    assert.equal(window.alwaysOnTopCalls.at(-1), true, 'pin should survive leaving dock mode');
    controller.setPinned(false);
    assert.equal(window.alwaysOnTopCalls.at(-1), false);
  } finally {
    controller.destroy();
  }
});
