// 输入：电脑端指针锁定鼠标视角、左键开火、按住右键瞄准；触屏层（touch.js）写入同一份状态（作者：Jack）
export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = {};
    this.pressed = {};
    this.look = { x: 0, y: 0 };
    this.fireHeld = false; this.adsHeld = false; this.firePressed = false; this.wheel = 0;
    this.locked = false; this.lockCalls = 0;
    this.sensitivity = 0.0021;
    this.onLockChange = null; this.onLook = null;
    // 触屏层写入：模拟摇杆（带模拟量）、冲刺/蹲伏/交互按住、单次跳跃
    this.touch = { active: false, x: 0, z: 0, sprint: false, crouch: false, interact: false, jump: false };
    // 最近一次指针来源：只有「这次开始」来自手指时才跳过指针锁定，鼠标点击照常锁定
    this.lastPointerType = 'mouse'; this.lockSkips = 0;
    addEventListener('pointerdown', (e) => { this.lastPointerType = e.pointerType || 'mouse'; }, true);
    addEventListener('keydown', (e) => {
      if (!this.keys[e.code]) this.pressed[e.code] = true;
      this.keys[e.code] = true;
      if (['Space', 'Tab', 'ControlLeft', 'KeyC'].includes(e.code) && this.locked) e.preventDefault();
    });
    addEventListener('keyup', (e) => { this.keys[e.code] = false; });
    canvas.addEventListener('mousedown', (e) => {
      if (!this.locked) { this.requestLock(); return; }
      if (e.button === 0) { this.fireHeld = true; this.firePressed = true; }
      if (e.button === 2) this.adsHeld = true;
    });
    addEventListener('wheel', (e) => { if (this.locked) this.wheel += Math.sign(e.deltaY); }, { passive: true });
    addEventListener('mousedown', (e) => { if (this.locked && e.target !== canvas) { if (e.button === 0) { this.fireHeld = true; this.firePressed = true; } if (e.button === 2) this.adsHeld = true; } });
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
    if (this.touch.active && this.lastPointerType === 'touch') { this.lockSkips++; return; }
    this.lockCalls++;
    try { const p = this.canvas.requestPointerLock && this.canvas.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (e) { /* 忽略 */ }
  }
  exitLock() { if (document.pointerLockElement) document.exitPointerLock(); }
  consumeLook() { const l = { ...this.look }; this.look.x = 0; this.look.y = 0; return l; }
  tap(code) { this.pressed[code] = true; }
  take(code) { const v = !!this.pressed[code]; this.pressed[code] = false; return v; }
  clearPressed() { this.pressed = {}; this.firePressed = false; this.wheel = 0; }
  takeFire() { const v = this.firePressed; this.firePressed = false; return v; }
  takeWheel() { const v = this.wheel; this.wheel = 0; return v; }
  axis() {
    let x = 0, z = 0;
    if (this.keys.KeyA) x -= 1; if (this.keys.KeyD) x += 1;
    if (this.keys.KeyW) z -= 1; if (this.keys.KeyS) z += 1;
    const m = Math.hypot(x, z); if (m > 1) { x /= m; z /= m; }
    if (!x && !z && this.touch.active) { x = this.touch.x; z = this.touch.z; }
    return { x, z };
  }
}
