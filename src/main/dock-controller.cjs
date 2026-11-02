const { screen } = require('electron');

class DockController {
  constructor(window, onStateChange = () => {}, { pinned = false } = {}) {
    this.window = window;
    this.onStateChange = onStateChange;
    this.docked = false;
    this.revealed = false;
    this.restoreBounds = null;
    this.anchor = null;
    this.displayId = null;
    this.animationTimer = null;
    this.hideFallbackTimer = null;
    this.animationMode = null;
    this.autoHidePaused = false;
    this.outsideSince = null;
    this.pinned = Boolean(pinned);
    this.#applyAlwaysOnTop();
    this.timer = setInterval(() => this.#tick(), 40);
  }

  getState() {
    return { docked: this.docked, revealed: this.revealed, pinned: this.pinned };
  }

  dock() {
    if (this.docked || this.window.isDestroyed()) return this.getState();
    if (this.window.isMaximized()) this.window.unmaximize();
    this.restoreBounds = this.window.getBounds();
    const display = screen.getDisplayMatching(this.restoreBounds);
    const maxWidth = Math.max(520, display.workArea.width);
    const width = Math.min(this.restoreBounds.width, maxWidth);
    const x = Math.max(display.workArea.x, Math.min(this.restoreBounds.x, display.workArea.x + display.workArea.width - width));
    this.anchor = { x, width, height: Math.min(this.restoreBounds.height, display.workArea.height) };
    this.displayId = display.id;
    this.docked = true;
    this.revealed = true;
    this.outsideSince = null;
    this.window.setAlwaysOnTop(true, 'floating');
    this.window.show();
    this.#emit();
    if (this.pinned) {
      // 置顶优先于自动隐藏：仍吸附到顶部，但保持展开。
      this.#animateTo(
        this.#visibleBounds(),
        240,
        (progress) => 1 - ((1 - progress) ** 3),
        'dock',
      );
    } else {
      // 点击吸顶时直接从当前位置向屏幕上方滑出，而不是瞬间消失。
      this.#hideDocked(300);
    }
    return this.getState();
  }

  undock({ show = true } = {}) {
    if (this.window.isDestroyed()) return this.getState();
    this.#cancelAnimation();
    this.docked = false;
    this.revealed = false;
    this.outsideSince = null;
    this.#applyAlwaysOnTop();
    if (this.restoreBounds) this.window.setBounds(this.restoreBounds, false);
    if (show) {
      this.window.show();
      this.window.focus();
    }
    this.#emit();
    return this.getState();
  }

  toggle() {
    return this.docked ? this.undock() : this.dock();
  }

  openNormal() {
    if (this.docked) return this.undock();
    if (this.window.isMinimized()) this.window.restore();
    this.window.show();
    this.window.focus();
    return this.getState();
  }

  hideToTray() {
    if (this.window.isDestroyed()) return;
    this.#cancelAnimation();
    this.window.hide();
    if (this.docked) {
      this.revealed = false;
      this.#emit();
    }
  }

  destroy() {
    clearInterval(this.timer);
    this.#cancelAnimation();
  }

  hideDocked() {
    if (!this.pinned && !this.autoHidePaused
      && this.docked && (this.revealed || this.window.isVisible())) {
      const cursor = screen.getCursorScreenPoint();
      if (this.#hasContinuouslyLeftWindow(cursor)) this.#hideDocked();
    }
    return this.getState();
  }

  setAutoHidePaused(paused) {
    this.autoHidePaused = Boolean(paused);
    if (this.autoHidePaused) this.outsideSince = null;
    return this.getState();
  }

  setPinned(pinned) {
    this.pinned = Boolean(pinned);
    if (this.pinned) this.outsideSince = null;
    this.#applyAlwaysOnTop();
    if (this.pinned && this.docked
      && (!this.revealed || !this.window.isVisible() || this.animationMode === 'hide')) {
      this.#cancelAnimation();
      this.window.showInactive();
      this.revealed = true;
      this.#emit();
      this.#animateTo(
        this.#visibleBounds(),
        210,
        (progress) => 1 - ((1 - progress) ** 3),
        'reveal',
      );
      return this.getState();
    }
    this.#emit();
    return this.getState();
  }

  togglePinned() {
    return this.setPinned(!this.pinned);
  }

  #applyAlwaysOnTop() {
    if (this.window.isDestroyed()) return;
    const active = this.docked || this.pinned;
    if (active) this.window.setAlwaysOnTop(true, 'floating');
    else this.window.setAlwaysOnTop(false);
  }

  #display() {
    return screen.getAllDisplays().find((item) => item.id === this.displayId)
      || screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  }

  #reveal() {
    const wasVisible = this.window.isVisible();
    this.#cancelAnimation();
    this.outsideSince = null;
    const visibleBounds = this.#visibleBounds();
    if (!wasVisible) {
      this.window.setBounds(this.#hiddenBounds(visibleBounds), false);
      this.window.showInactive();
    }
    this.revealed = true;
    this.#emit();
    this.#animateTo(visibleBounds, 260, (progress) => 1 - ((1 - progress) ** 3), 'reveal');
  }

  #hideDocked(duration = 260) {
    if (this.animationMode === 'hide' || this.window.isDestroyed()) return;
    this.outsideSince = null;
    this.revealed = false;
    this.#emit();
    const target = this.#hiddenBounds(this.#visibleBounds());
    this.#animateTo(target, duration, (progress) => progress ** 3, 'hide', () => {
      if (this.window.isDestroyed()) return;
      if (this.#inHotZone(screen.getCursorScreenPoint())) {
        this.#reveal();
        return;
      }
      this.window.hide();
    });
  }

  #finishHide() {
    this.#cancelAnimation();
    if (!this.window.isDestroyed()) this.window.hide();
  }

  #visibleBounds() {
    const display = this.#display();
    const width = Math.min(this.anchor.width, display.workArea.width);
    const height = Math.min(this.anchor.height, display.workArea.height);
    const x = Math.max(
      display.workArea.x,
      Math.min(this.anchor.x, display.workArea.x + display.workArea.width - width),
    );
    return { x, y: display.workArea.y, width, height };
  }

  #hiddenBounds(visibleBounds) {
    return {
      ...visibleBounds,
      y: this.#display().bounds.y - visibleBounds.height - 4,
    };
  }

  #animateTo(target, duration, easing, mode, onComplete = () => {}) {
    this.#cancelAnimation();
    const start = this.window.getBounds();
    const startedAt = Date.now();
    let completed = false;
    const finish = () => {
      if (completed) return;
      completed = true;
      this.#cancelAnimation();
      if (!this.window.isDestroyed()) {
        try {
          const current = this.window.getBounds();
          if (current.x !== target.x || current.y !== target.y
            || current.width !== target.width || current.height !== target.height) {
            if (current.width === target.width && current.height === target.height
              && typeof this.window.setPosition === 'function') {
              this.window.setPosition(target.x, target.y, false);
            } else {
              this.window.setBounds(target, false);
            }
          }
        } catch {}
      }
      onComplete();
    };
    const step = () => {
      if (this.window.isDestroyed()) {
        this.#cancelAnimation();
        return;
      }
      const progress = Math.min(1, (Date.now() - startedAt) / duration);
      const eased = easing(progress);
      const next = {};
      for (const key of ['x', 'y', 'width', 'height']) {
        next[key] = Math.round(start[key] + ((target[key] - start[key]) * eased)) || 0;
      }
      try {
        const current = this.window.getBounds();
        if (current.x === next.x && current.y === next.y
          && current.width === next.width && current.height === next.height) {
          if (progress >= 1) finish();
          return;
        }
        // 移动中的窗口只改坐标，避免每帧重设尺寸造成 Windows 合成器闪烁。
        if (next.width === start.width && next.height === start.height
          && typeof this.window.setPosition === 'function') {
          this.window.setPosition(next.x, next.y, false);
        } else {
          this.window.setBounds(next, false);
        }
      } catch {
        finish();
        return;
      }
      if (progress >= 1) finish();
    };
    this.animationMode = mode;
    this.animationTimer = setInterval(step, 16);
    this.hideFallbackTimer = setTimeout(finish, duration + 120);
    step();
  }

  #cancelAnimation() {
    if (this.animationTimer) clearInterval(this.animationTimer);
    if (this.hideFallbackTimer) clearTimeout(this.hideFallbackTimer);
    this.animationTimer = null;
    this.hideFallbackTimer = null;
    this.animationMode = null;
  }

  #hasContinuouslyLeftWindow(cursor) {
    const bounds = this.window.getBounds();
    // Windows 无边框窗口的阴影和圆角会让视觉边缘比内容边界略宽；
    // 给四周 10px 容错，避免鼠标移到右上角按钮时被误判为离开。
    const tolerance = 10;
    const inside = cursor.x >= bounds.x - tolerance
      && cursor.x <= bounds.x + bounds.width + tolerance
      && cursor.y >= bounds.y - tolerance
      && cursor.y <= bounds.y + bounds.height + tolerance;
    if (inside) {
      this.outsideSince = null;
      return false;
    }
    if (this.outsideSince === null) {
      this.outsideSince = Date.now();
      return false;
    }
    return Date.now() - this.outsideSince >= 100;
  }

  #inHotZone(cursor) {
    const display = this.#display();
    const screenTop = display.bounds.y;
    const workAreaTop = display.workArea.y;
    const atScreenTop = cursor.y >= screenTop && cursor.y <= screenTop + 8;
    const atWorkAreaTop = cursor.y >= workAreaTop && cursor.y <= workAreaTop + 8;
    return cursor.x >= this.anchor.x
      && cursor.x <= this.anchor.x + this.anchor.width
      && (atScreenTop || atWorkAreaTop);
  }

  #tick() {
    if (!this.docked || this.window.isDestroyed() || !this.anchor) return;
    if (this.pinned) return;
    if (this.autoHidePaused) return;
    const cursor = screen.getCursorScreenPoint();
    if (this.animationMode === 'hide') {
      if (this.#inHotZone(cursor)) this.#reveal();
      return;
    }
    if (this.animationTimer) return;
    if (!this.revealed) {
      if (this.#inHotZone(cursor)) this.#reveal();
      else if (this.window.isVisible()) this.#finishHide();
      return;
    }

    if (this.#hasContinuouslyLeftWindow(cursor)) this.#hideDocked();
  }

  #emit() {
    this.onStateChange(this.getState());
  }
}

module.exports = { DockController };
