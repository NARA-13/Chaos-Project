export class InputManager {
  constructor(settings) {
    this.settings = settings;
    this.downCodes = new Set();
    this.pressedActions = new Set();
    this.heldActions = new Set();
    this.prevHeldActions = new Set();
    this.rebindCallback = null;
    this.enabled = true;

    this._onKeyDown = (e) => {
      if (this.rebindCallback) {
        e.preventDefault();
        e.stopPropagation();
        const cb = this.rebindCallback;
        this.rebindCallback = null;
        cb(e.code);
        return;
      }

      if (this._isGameKey(e.code)) {
        e.preventDefault();
      }
      this.downCodes.add(e.code);
    };

    this._onKeyUp = (e) => {
      this.downCodes.delete(e.code);
    };

    this._onBlur = () => {
      this.downCodes.clear();
      this.heldActions.clear();
      this.pressedActions.clear();
    };

    window.addEventListener('keydown', this._onKeyDown, { passive: false });
    window.addEventListener('keyup', this._onKeyUp);
    window.addEventListener('blur', this._onBlur);
  }

  _isGameKey(code) {
    for (const codes of Object.values(this.settings.keybinds)) {
      if (codes.includes(code)) return true;
    }
    return false;
  }

  startRebind(callback) {
    this.rebindCallback = callback;
  }

  cancelRebind() {
    this.rebindCallback = null;
  }

  clearAll() {
    this.downCodes.clear();
    this.heldActions.clear();
    this.pressedActions.clear();
    this.prevHeldActions.clear();
  }

  update() {
    this.prevHeldActions = new Set(this.heldActions);
    this.heldActions.clear();
    this.pressedActions.clear();

    if (!this.enabled) return;

    // Keyboard
    for (const [action, codes] of Object.entries(this.settings.keybinds)) {
      for (const code of codes) {
        if (this.downCodes.has(code)) {
          this.heldActions.add(action);
          break;
        }
      }
    }

    // Optional Gamepad support
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const gp = pads && pads[0];
    if (gp) {
      const dead = 0.35;
      if (gp.axes[0] < -dead || gp.buttons[14]?.pressed) this.heldActions.add('left');
      if (gp.axes[0] > dead || gp.buttons[15]?.pressed) this.heldActions.add('right');
      if (gp.axes[1] < -dead || gp.buttons[12]?.pressed) this.heldActions.add('up');
      if (gp.axes[1] > dead || gp.buttons[13]?.pressed) this.heldActions.add('down');
      if (gp.buttons[0]?.pressed) this.heldActions.add('confirm');
      if (gp.buttons[1]?.pressed || gp.buttons[2]?.pressed) this.heldActions.add('cancel');
      if (gp.buttons[9]?.pressed) this.heldActions.add('menu');
    }

    for (const action of this.heldActions) {
      if (!this.prevHeldActions.has(action)) {
        this.pressedActions.add(action);
      }
    }
  }

  held(action) {
    return this.heldActions.has(action);
  }

  pressed(action) {
    return this.pressedActions.has(action);
  }
}
