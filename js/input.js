// 电脑端输入：指针锁定鼠标视角、左键开火、按住右键瞄准（作者：Jack）
export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = {};
    this.pressed = {};
    this.look = { x: 0, y: 0 };
    this.fireHeld = false; this.adsHeld = false;
    this.locked = false; this.lockCalls = 0;
    this.sensitivity = 0.0021;
    this.onLockChange = null; this.onLook = null;
    addEventListener('keydown', (e) => {
      if (!this.keys[e.code]) this.pressed[e.code] = true;
      this.keys[e.code] = true;
      if (['Space', 'Tab', 'ControlLeft', 'KeyC'].includes(e.code) && this.locked) e.preventDefault();
    });
    addEventListener('keyup', (e) => { this.keys[e.code] = false; });
    canvas.addEventListener('mousedown', (e) => {
      if (!this.locked) { this.requestLock(); return; }
      if (e.button === 0) this.fireHeld = true;
      if (e.button === 2) this.adsHeld = true;
    });
    addEventListener('mousedown', (e) => { if (this.locked && e.target !== canvas) { if (e.button === 0) this.fireHeld = true; if (e.button === 2) this.adsHeld = true; } });
    addEventListener('mouseup', (e) => { if (e.button === 0) this.fireHeld = false; if (e.button === 2) this.adsHeld = false; });
    addEventListener('blur', () => { this.fireHeld = false; this.adsHeld = false; this.keys = {}; });
    document.addEventListener('contextmenu', (e) => e.preventDefault());
    addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.look.x += e.movementX || 0; this.look.y += e.movementY || 0;
      if (this.onLook) this.onLook(e.movementX || 0, e.movementY || 0);
    });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
      if (!this.locked) { this.fireHeld = false; this.adsHeld = false; }
      if (this.onLockChange) this.onLockChange(this.locked);
    });
  }
  requestLock() {
    this.lockCalls++;
    try { const p = this.canvas.requestPointerLock && this.canvas.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (e) { /* 忽略 */ }
  }
  exitLock() { if (document.pointerLockElement) document.exitPointerLock(); }
  consumeLook() { const l = { ...this.look }; this.look.x = 0; this.look.y = 0; return l; }
  take(code) { const v = !!this.pressed[code]; this.pressed[code] = false; return v; }
  clearPressed() { this.pressed = {}; }
  axis() {
    let x = 0, z = 0;
    if (this.keys.KeyA) x -= 1; if (this.keys.KeyD) x += 1;
    if (this.keys.KeyW) z -= 1; if (this.keys.KeyS) z += 1;
    const m = Math.hypot(x, z); if (m > 1) { x /= m; z /= m; }
    return { x, z };
  }
}
