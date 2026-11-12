// 触屏操作层（作者：Jack · 禁止转载）
// 只在真实触摸发生时启用（首次 touchstart / pointerType==='touch'，或 ?touch=1 测试）。
// 不读 maxTouchPoints / pointer:coarse / 屏幕宽度；不取代也不禁用电脑端指针锁定与右键开镜。
// 所有操作写进 Input 的同一份状态（虚拟按键 / 摇杆模拟量 / 视角增量 / 开火 / 开镜），不复制游戏逻辑。
import * as THREE from '../vendor/three/three.module.js';

const DEF = { preset: 'two', size: 1, opacity: 0.55, adsMode: 'tap', stick: 'float', look: 1, adsLook: 0.6, gyro: 'off', gyroSens: 1, assist: true };
const HIP_RAD_PER_PX = 0.0052; // 默认：横屏半屏划过约 125°
const $ = (id) => document.getElementById(id);

export class TouchControls {
  constructor(game) {
    this.g = game; this.input = game.input;
    this.active = false;
    this.cfg = { ...DEF };
    try { Object.assign(this.cfg, JSON.parse(localStorage.getItem('rt.touch') || '{}')); } catch (e) { /* 忽略 */ }
    this.ptr = new Map(); // pointerId -> { kind, x, y, sx, sy, t }
    this.stick = { id: null, cx: 0, cy: 0, x: 0, y: 0 };
    this.lookId = null; this.lastLookMove = 0;
    this.fireCount = 0; this.assistK = 1; this.gyroT = 0;
    this.stat = { lookEvents: 0, fireTaps: 0 };
    this._build();
    const onFirst = () => this.activate();
    addEventListener('touchstart', (e) => { if (!this.active) onFirst(); this.g.audio.resume(); }, { capture: true, passive: true });
    addEventListener('touchend', () => this.g.audio.resume(), { capture: true, passive: true });
    addEventListener('pointerdown', (e) => { if (e.pointerType === 'touch' && !this.active) onFirst(); }, true);
    if (new URLSearchParams(location.search).get('touch') === '1') this.activate();
    // 禁止缩放、双击放大、页面滚动、长按菜单（仅触屏模式下拦截 touchmove，设置面板可滚动）
    for (const ev of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(ev, (e) => e.preventDefault());
    document.addEventListener('dblclick', (e) => { if (this.active) e.preventDefault(); });
    document.addEventListener('touchmove', (e) => { if (this.active && !(e.target.closest && e.target.closest('.panel-box')) && e.cancelable) e.preventDefault(); }, { passive: false });
    window.addEventListener('devicemotion', (e) => this._gyro(e));
  }

  activate() {
    if (this.active) return;
    this.active = true; this.input.touch.active = true;
    document.body.classList.add('touch');
    this.applyCfg();
    const g = this.g;
    if (g.ready && !localStorage.getItem('rt.qualityManual') && g.quality !== 'mobile') g.applyQuality('mobile');
    this.g.audio.resume();
  }

  save() { try { localStorage.setItem('rt.touch', JSON.stringify(this.cfg)); } catch (e) { /* 忽略 */ } }
  applyCfg() {
    const r = this.root; const c = this.cfg;
    r.dataset.preset = c.preset;
    r.style.setProperty('--s', c.size);
    r.style.setProperty('--o', c.opacity);
    this._placeStickHome();
  }

  _build() {
    const r = document.createElement('div'); r.id = 'touch'; r.className = 'hidden';
    r.innerHTML = `
      <div id="tStick"><div id="tKnob"></div><span id="tSprint">冲刺</span></div>
      <button class="tb" id="tPause" data-act="pause" aria-label="暂停">❚❚</button>
      <button class="tb" id="tCrouch" data-act="crouch">蹲</button>
      <button class="tb" id="tFlash" data-act="flash">手电</button>
      <button class="tb" id="tFireL" data-act="fire">开火</button>
      <button class="tb big" id="tFire" data-act="fire" data-look="1">开火</button>
      <button class="tb" id="tAds" data-act="ads" data-look="1">瞄准</button>
      <button class="tb" id="tReload" data-act="reload">换弹</button>
      <button class="tb" id="tSwap" data-act="swap">换枪</button>
      <button class="tb" id="tJump" data-act="jump">跳</button>
      <button class="tb" id="tNade" data-act="nade">雷</button>
      <button id="tCtx" class="hidden" data-act="ctx"><svg viewBox="0 0 44 44"><circle cx="22" cy="22" r="19" class="bg"/><circle cx="22" cy="22" r="19" id="tCtxRing" class="fg"/></svg><span id="tCtxText">按住 · 切断中继</span></button>
      <div id="tHint" class="hidden"></div>`;
    document.getElementById('app').appendChild(r);
    this.root = r;
    // 根层：左侧起摇杆，其余空白处划视角；鼠标点到这里则照常请求指针锁定
    r.addEventListener('pointerdown', (e) => this._rootDown(e));
    r.addEventListener('pointermove', (e) => this._move(e));
    r.addEventListener('pointerup', (e) => this._up(e));
    r.addEventListener('pointercancel', (e) => this._up(e));
    r.addEventListener('lostpointercapture', (e) => this._up(e));
    r.querySelectorAll('[data-act]').forEach((b) => {
      b.addEventListener('pointerdown', (e) => this._btnDown(e, b));
      b.addEventListener('contextmenu', (e) => e.preventDefault());
    });
  }

  // —— 指针分发 ——
  _rootDown(e) {
    if (e.pointerType === 'mouse') { this.input.requestLock(); return; }
    if (!this.active) this.activate();
    e.preventDefault();
    const W = innerWidth, H = innerHeight;
    try { this.root.setPointerCapture(e.pointerId); } catch (er) { /* 忽略 */ }
    if (e.clientX < W * 0.42 && e.clientY > H * 0.3 && this.stick.id === null) {
      this.stick.id = e.pointerId;
      if (this.cfg.stick === 'float') { const R = this._R(); this.stick.cx = Math.max(R + 10, Math.min(W * 0.42 - R * 0.5, e.clientX)); this.stick.cy = Math.max(R + 10, Math.min(H - R - 8, e.clientY)); }
      this.ptr.set(e.pointerId, { kind: 'stick' });
      this._stickMove(e.clientX, e.clientY);
      $('tStick').classList.add('on');
    } else if (this.lookId === null) {
      this.lookId = e.pointerId;
      this.ptr.set(e.pointerId, { kind: 'look', x: e.clientX, y: e.clientY });
    }
  }
  _btnDown(e, b) {
    if (e.pointerType === 'mouse') return; // 交给根层请求指针锁定
    e.stopPropagation(); e.preventDefault();
    if (!this.active) this.activate();
    const act = b.dataset.act; const inp = this.input;
    try { b.setPointerCapture(e.pointerId); } catch (er) { /* 忽略 */ }
    const p = { kind: 'btn', act, b, x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: e.timeStamp || performance.now(), look: !!b.dataset.look };
    this.ptr.set(e.pointerId, p);
    b.classList.add('down');
    // 按钮已捕获指针，其 move/up 冒泡到根层统一处理
    if (act === 'fire') { this.fireCount++; inp.fireHeld = true; inp.firePressed = true; this.stat.fireTaps++; }
    else if (act === 'ads') { if (this.cfg.adsMode === 'hold') inp.adsHeld = true; else inp.adsHeld = !inp.adsHeld; }
    else if (act === 'reload') inp.tap('KeyR');
    else if (act === 'swap') { inp.tap('KeyQ'); }
    else if (act === 'nade') inp.tap('KeyG');
    else if (act === 'jump') inp.touch.jump = true;
    else if (act === 'crouch') inp.touch.crouch = !inp.touch.crouch;
    else if (act === 'ctx') inp.touch.interact = true;
  }
  _move(e) {
    const p = this.ptr.get(e.pointerId); if (!p) return;
    if (p.kind === 'stick') { this._stickMove(e.clientX, e.clientY); return; }
    if (p.kind === 'look' || (p.kind === 'btn' && p.look)) {
      const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
      this._look(dx, dy);
    } else if (p.kind === 'btn') { p.x = e.clientX; p.y = e.clientY; }
  }
  _up(e) {
    const p = this.ptr.get(e.pointerId); if (!p) return;
    this.ptr.delete(e.pointerId);
    const inp = this.input;
    if (p.kind === 'stick') { this.stick.id = null; inp.touch.x = 0; inp.touch.z = 0; inp.touch.sprint = false; $('tStick').classList.remove('on', 'sprint'); this._placeStickHome(); }
    else if (p.kind === 'look') { if (this.lookId === e.pointerId) this.lookId = null; }
    else if (p.kind === 'btn') {
      p.b.classList.remove('down');
      if (p.act === 'fire') { this.fireCount = Math.max(0, this.fireCount - 1); if (!this.fireCount) inp.fireHeld = false; }
      else if (p.act === 'ads' && this.cfg.adsMode === 'hold') inp.adsHeld = false;
      else if (p.act === 'ctx') inp.touch.interact = false;
      else if (p.act === 'flash' || p.act === 'pause') {
        // 干净点按：移动小于 14px、按住不超过 1.5 秒（按事件时间戳计）、且在按钮上松开；滑过不触发
        const moved = Math.hypot(e.clientX - p.sx, e.clientY - p.sy); const dt = (e.timeStamp || performance.now()) - p.t;
        const rc = p.b.getBoundingClientRect(); const inside = e.type === 'pointerup' && e.clientX >= rc.left - 6 && e.clientX <= rc.right + 6 && e.clientY >= rc.top - 6 && e.clientY <= rc.bottom + 6;
        if (moved < 14 && dt < 1500 && inside) { if (p.act === 'flash') inp.tap('KeyF'); else this.g.pause(); }
      }
    }
  }
  releaseAll() {
    const inp = this.input;
    for (const [, p] of this.ptr) if (p.b) p.b.classList.remove('down');
    this.ptr.clear(); this.stick.id = null; this.lookId = null; this.fireCount = 0;
    inp.fireHeld = false; inp.adsHeld = false; inp.firePressed = false;
    Object.assign(inp.touch, { x: 0, z: 0, sprint: false, interact: false, jump: false, crouch: false });
    const st = $('tStick'); if (st) st.classList.remove('on', 'sprint');
    this._placeStickHome();
  }

  // —— 摇杆 ——
  _R() { return 58 * this.cfg.size; }
  _placeStickHome() {
    const R = this._R(); const st = $('tStick'); if (!st) return;
    if (this.stick.id === null) { this.stick.cx = Math.max(R + 24, innerWidth * 0.15); this.stick.cy = innerHeight - R - Math.max(28, innerHeight * 0.1); }
    st.style.width = st.style.height = (R * 2) + 'px';
    st.style.transform = `translate(${this.stick.cx - R}px,${this.stick.cy - R}px)`;
    $('tKnob').style.transform = 'translate(-50%,-50%)';
  }
  _stickMove(x, y) {
    const R = this._R(); const s = this.stick;
    let dx = x - s.cx, dy = y - s.cy; const d = Math.hypot(dx, dy); const m = Math.min(1, d / R);
    const nx = d > 0 ? dx / d : 0, ny = d > 0 ? dy / d : 0;
    // 死区 0.12；走路在 0.74R 处满速；推过外圈 80% 且朝前才冲刺（不自动冲刺）
    const walk = Math.max(0, Math.min(1, (m - 0.12) / 0.62));
    const sprint = m >= 0.8 && ny < -0.55;
    const t = this.input.touch;
    t.x = nx * walk; t.z = ny * walk; t.sprint = sprint;
    $('tStick').classList.toggle('sprint', sprint);
    const st = $('tStick'); st.style.transform = `translate(${s.cx - R}px,${s.cy - R}px)`;
    $('tKnob').style.transform = `translate(calc(-50% + ${nx * m * R}px), calc(-50% + ${ny * m * R}px))`;
  }

  // —— 视角：固定速度、无加速；腰射 / 开镜分开灵敏度 ——
  _radPerUnit() { const ads = this.g.weapon ? this.g.weapon.ads : 0; return this.input.sensitivity * (1 - ads * 0.45); }
  _look(dx, dy) {
    const ads = this.g.weapon ? this.g.weapon.ads : 0;
    const rad = HIP_RAD_PER_PX * (ads > 0.5 ? this.cfg.adsLook : this.cfg.look) * this.assistK;
    const k = rad / this._radPerUnit();
    this.input.look.x += dx * k; this.input.look.y += dy * k;
    if (this.input.onLook) this.input.onLook(dx * 0.6, dy * 0.6);
    this.lastLookMove = performance.now(); this.stat.lookEvents++;
  }
  _gyro(e) {
    if (!this.active || this.cfg.gyro === 'off' || this.g.mode !== 'play') { this.gyroT = 0; return; }
    if (this.cfg.gyro === 'ads' && !(this.g.weapon && this.g.weapon.ads > 0.5)) { this.gyroT = 0; return; }
    const rr = e.rotationRate; if (!rr) return;
    const now = performance.now(); const dt = this.gyroT ? Math.min(0.05, (now - this.gyroT) / 1000) : 0; this.gyroT = now; if (!dt) return;
    const ang = (screen.orientation && typeof screen.orientation.angle === 'number') ? screen.orientation.angle : (window.orientation || 0);
    const D = Math.PI / 180 * this.cfg.gyroSens;
    let yaw = 0, pitch = 0; // 弧度/秒：yaw 正 = 向左转，pitch 正 = 抬头
    if (ang === 90) { yaw = (rr.beta || 0) * D; pitch = -(rr.gamma || 0) * D; }
    else if (ang === 270 || ang === -90) { yaw = -(rr.beta || 0) * D; pitch = (rr.gamma || 0) * D; }
    else { yaw = (rr.gamma || 0) * D; pitch = (rr.beta || 0) * D; }
    const k = 1 / this._radPerUnit();
    this.input.look.x += -yaw * dt * k; this.input.look.y += -pitch * dt * k;
  }
  async requestGyro() {
    try {
      const DM = window.DeviceMotionEvent;
      if (DM && typeof DM.requestPermission === 'function') { const r = await DM.requestPermission(); return r === 'granted'; }
      return !!DM;
    } catch (e) { return false; }
  }

  // —— 每帧 ——
  update(dt) {
    const g = this.g;
    const show = this.active && g.mode === 'play' && !this.input.locked;
    if (this.root.classList.contains('hidden') === show) { this.root.classList.toggle('hidden', !show); if (!show) this.releaseAll(); }
    if (!show) return;
    // 竖屏时自动暂停
    if (innerHeight > innerWidth * 1.05) { g.pause(); return; }
    $('tCrouch').classList.toggle('on', !!this.input.touch.crouch);
    $('tFlash').classList.toggle('on', !!g.flashOn);
    $('tAds').classList.toggle('on', !!this.input.adsHeld);
    // 情境按钮：靠近中继时出现，按住切断（写 KeyE 同一状态）
    const near = g.nearRelay;
    const ctx = $('tCtx');
    if (near === null || near === undefined) { ctx.classList.add('hidden'); this.input.touch.interact = false; }
    else {
      ctx.classList.remove('hidden');
      const id = g.world.relays[near].id;
      $('tCtxText').textContent = g.relayPrompt || (g.holdT > 0 ? '正在切断 ' + id + ' 号中继…' : '按住 · 切断中继 ' + id);
      $('tCtxRing').style.strokeDashoffset = 119.4 * (1 - Math.min(1, g.holdT / 3.5));
    }
    this._assist(dt);
  }
  // 轻度辅助瞄准：准星贴近敌人时减速，并在手指正在划动时轻微吸附。没有敌人时不起作用。
  _assist(dt) {
    this.assistK = 1;
    const g = this.g;
    if (!this.cfg.assist || !g.enemies || !g.enemies.list.length) return;
    const cam = g.camera; const fwd = this._f || (this._f = new THREE.Vector3()); fwd.set(0, 0, -1).applyQuaternion(cam.quaternion);
    let best = null, bestA = 0.075;
    const v = this._v || (this._v = new THREE.Vector3());
    for (const e of g.enemies.list) {
      if (!e.alive) continue;
      v.set(e.pos.x, e.pos.y + (e.type === 'warden' ? 1.5 : e.type === 'gull' ? 0 : 0.8), e.pos.z).sub(cam.position);
      const d = v.length(); if (d > 45 || d < 0.5) continue;
      const a = Math.acos(Math.max(-1, Math.min(1, v.dot(fwd) / d)));
      if (a < bestA) { bestA = a; best = { x: v.x, y: v.y, z: v.z, d }; }
    }
    if (!best) return;
    this.assistK = 0.7;
    if (performance.now() - this.lastLookMove < 120) {
      const pl = g.player; const tyaw = Math.atan2(-best.x, -best.z); const tp = Math.atan2(best.y, Math.hypot(best.x, best.z));
      let ey = tyaw - pl.yaw; while (ey > Math.PI) ey -= Math.PI * 2; while (ey < -Math.PI) ey += Math.PI * 2;
      const s = Math.min(1, dt * 2.2);
      pl.yaw += ey * s * 0.35; pl.pitch += (tp - pl.pitch) * s * 0.2;
    }
  }

  hint(text, ms = 4200) {
    const h = $('tHint'); h.textContent = text; h.classList.remove('hidden');
    clearTimeout(this._ht); this._ht = setTimeout(() => h.classList.add('hidden'), ms);
  }
  goFullscreen() {
    try {
      const el = document.documentElement;
      const fn = el.requestFullscreen || el.webkitRequestFullscreen;
      if (!fn || document.fullscreenElement || document.webkitFullscreenElement) return;
      const p = fn.call(el, { navigationUI: 'hide' });
      const lock = () => { try { const o = screen.orientation; if (o && o.lock) o.lock('landscape').catch(() => {}); } catch (e) { /* 忽略 */ } };
      if (p && p.then) p.then(lock).catch(() => {}); else lock();
    } catch (e) { /* 微信等环境没有全屏接口，忽略 */ }
  }

  // —— 设置面板（只在触屏模式显示） ——
  bindSettings() {
    const c = this.cfg; const box = $('touchSet'); if (!box) return;
    box.classList.toggle('hidden', !this.active);
    const seg = (id, key, after) => document.querySelectorAll('#' + id + ' button').forEach((b) => {
      b.classList.toggle('on', b.dataset.v === String(c[key]));
      b.onclick = async () => { if (key === 'gyro' && b.dataset.v !== 'off') { const okP = await this.requestGyro(); if (!okP) { this.hint('无法开启陀螺仪（未授权或设备不支持）'); return; } } c[key] = b.dataset.v; this.save(); this.applyCfg(); seg(id, key, after); after && after(); };
    });
    seg('tsPreset', 'preset'); seg('tsAdsMode', 'adsMode'); seg('tsStick', 'stick'); seg('tsGyro', 'gyro');
    const rng = (id, key) => { const el = $(id); el.value = c[key]; el.oninput = () => { c[key] = +el.value; this.save(); this.applyCfg(); }; };
    rng('tsSize', 'size'); rng('tsOpacity', 'opacity'); rng('tsLook', 'look'); rng('tsAdsLook', 'adsLook');
    const a = $('tsAssist'); a.checked = !!c.assist; a.onchange = () => { c.assist = a.checked; this.save(); };
  }
}
