// 程序化 Web Audio：雨声、港区环境、枪声、机械敌人（全部实时合成，原创，无采样）
export class Audio {
  constructor() {
    this.ctx = null; this.muted = false;
    this.vol = { master: 0.75, music: 0.55, sfx: 0.85 };
    this.listener = { x: 0, y: 0, z: 0 };
  }
  resume() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
      this.ctx = new AC(); this._graph();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }
  _graph() {
    const c = this.ctx;
    this.master = c.createGain();
    const comp = c.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.18;
    const lim = c.createDynamicsCompressor(); lim.threshold.value = -2; lim.ratio.value = 20; lim.attack.value = 0.001; lim.release.value = 0.08;
    this.master.connect(comp); comp.connect(lim); lim.connect(c.destination);
    this.sfx = c.createGain(); this.music = c.createGain(); this.amb = c.createGain();
    this.sfxLP = c.createBiquadFilter(); this.sfxLP.type = 'lowpass'; this.sfxLP.frequency.value = 18000;
    this.sfx.connect(this.sfxLP); this.sfxLP.connect(this.master); this.music.connect(this.master); this.amb.connect(this.master);
    // 卷积混响：港区开阔回声
    this.verb = c.createConvolver(); this.verb.buffer = this._ir(1.6, 2.8);
    this.verbSend = c.createGain(); this.verbSend.gain.value = 0.35; this.verbSend.connect(this.verb); this.verb.connect(this.master);
    this.noise = this._noiseBuf(2);
    this.brown = this._brownBuf(4);
    this.applyVol();
    this._beds();
  }
  _noiseBuf(sec) { const c = this.ctx; const b = c.createBuffer(1, c.sampleRate * sec, c.sampleRate); const d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; return b; }
  _brownBuf(sec) { const c = this.ctx; const b = c.createBuffer(1, c.sampleRate * sec, c.sampleRate); const d = b.getChannelData(0); let l = 0; for (let i = 0; i < d.length; i++) { l = (l + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = l * 3.5; } return b; }
  _ir(sec, decay) {
    const c = this.ctx; const n = c.sampleRate * sec; const b = c.createBuffer(2, n, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = b.getChannelData(ch); for (let i = 0; i < n; i++) { const t = i / n; d[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, decay) * (i < c.sampleRate * 0.03 ? 0.3 : 1); }
      // 集装箱墙面的早期反射
      for (const ms of [38, 71, 112]) { const k = Math.floor(c.sampleRate * ms / 1000) + ch * 40; if (k < n) d[k] += 0.5; } }
    return b;
  }
  applyVol() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.muted ? 0 : this.vol.master, t, 0.05);
    this.sfx.gain.setTargetAtTime(this.vol.sfx, t, 0.05);
    this.music.gain.setTargetAtTime(this.vol.music * 0.8, t, 0.05);
    this.amb.gain.setTargetAtTime(this.vol.music, t, 0.05);
  }
  setVolumes(v) { Object.assign(this.vol, v); this.applyVol(); }
  setMute(m) { this.muted = m; this.applyVol(); }

  // —— 环境床：雨、风、海浪、低频张力垫 ——
  _beds() {
    const c = this.ctx;
    const loop = (buf, type, f, q, g, dest) => { const s = c.createBufferSource(); s.buffer = buf; s.loop = true; const fl = c.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q; const gn = c.createGain(); gn.gain.value = g; s.connect(fl); fl.connect(gn); gn.connect(dest); s.start(); return { s, fl, gn }; };
    this.rainHi = loop(this.noise, 'highpass', 2500, 0.5, 0.05, this.amb);
    this.rainMid = loop(this.noise, 'bandpass', 900, 0.6, 0.06, this.amb);
    this.wind = loop(this.brown, 'lowpass', 380, 0.8, 0.22, this.amb);
    this.sea = loop(this.brown, 'lowpass', 220, 0.5, 0.0, this.amb);
    // 张力垫：低音持续 + 微失谐
    this.pad = [];
    for (const [f, g] of [[55, 0.05], [55.6, 0.04], [82.4, 0.025], [110.3, 0.012], [164.8, 0.008]]) {
      const o = c.createOscillator(); o.type = f > 100 ? 'triangle' : 'sine'; o.frequency.value = f;
      const gn = c.createGain(); gn.gain.value = 0; o.connect(gn); gn.connect(this.music); o.start(); this.pad.push({ o, gn, g });
    }
    this.pulse = c.createGain(); this.pulse.gain.value = 0; this.pulse.connect(this.music);
    this.nextDrop = 0; this.nextHorn = 8; this.nextPulse = 0; this.nextCreak = 5;
  }

  _env(node, t, a, peak, d) { node.gain.setValueAtTime(0.0001, t); node.gain.exponentialRampToValueAtTime(peak, t + a); node.gain.exponentialRampToValueAtTime(0.0001, t + a + d); }
  _noise(dest, t, dur, type, f, q, peak, a = 0.002, buf) {
    const c = this.ctx; const s = c.createBufferSource(); s.buffer = buf || this.noise; s.playbackRate.value = 0.8 + Math.random() * 0.4;
    const fl = c.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q;
    const g = c.createGain(); this._env(g, t, a, peak, dur);
    s.connect(fl); fl.connect(g); g.connect(dest); s.start(t, Math.random() * 1.2); s.stop(t + a + dur + 0.05);
    return { fl, g };
  }
  _tone(dest, t, type, f0, f1, dur, peak, a = 0.003) {
    const c = this.ctx; const o = c.createOscillator(); o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    const g = c.createGain(); this._env(g, t, a, peak, dur); o.connect(g); g.connect(dest); o.start(t); o.stop(t + a + dur + 0.05);
    return o;
  }
  _out(gain = 1, verb = 0.3) { const g = this.ctx.createGain(); g.gain.value = gain; g.connect(this.sfx); const v = this.ctx.createGain(); v.gain.value = verb; g.connect(v); v.connect(this.verbSend); return g; }
  _pos(p, gain = 1, verb = 0.4) {
    const c = this.ctx; const pan = c.createPanner(); pan.panningModel = 'HRTF'; pan.distanceModel = 'inverse'; pan.refDistance = 6; pan.maxDistance = 120; pan.rolloffFactor = 1.1;
    pan.positionX.value = p.x; pan.positionY.value = p.y || 1; pan.positionZ.value = p.z;
    const g = c.createGain(); g.gain.value = gain; g.connect(pan); pan.connect(this.sfx);
    const v = c.createGain(); v.gain.value = verb; g.connect(v); v.connect(this.verbSend);
    return g;
  }
  ok() { return this.ctx && this.ctx.state === 'running'; }

  // —— 玩家武器 ——
  shot() {
    if (!this.ok()) return; const t = this.ctx.currentTime; const j = 0.94 + Math.random() * 0.12; const out = this._out(0.9 * (0.9 + Math.random() * 0.15), 0.55);
    this._noise(out, t, 0.02, 'highpass', 3800 * j, 0.7, 0.6, 0.001);        // 机械击发
    this._noise(out, t, 0.12, 'bandpass', 1400 * j, 0.8, 0.9, 0.001);        // 爆燃主体
    this._noise(out, t, 0.32, 'lowpass', 600 * j, 0.6, 0.55, 0.002, this.brown);
    this._tone(out, t, 'sine', 120 * j, 42, 0.16, 0.9, 0.002);               // 低频冲击
    this._tone(out, t + 0.005, 'square', 2600 * j, 900, 0.03, 0.05);
    if (Math.random() < 0.6) { const tt = t + 0.35 + Math.random() * 0.2; this._tone(this._out(0.5, 0.1), tt, 'triangle', 3200 + Math.random() * 900, 2800, 0.05, 0.05); this._tone(this._out(0.5, 0.1), tt + 0.06, 'triangle', 3600, 3000, 0.04, 0.03); }
  }
  // 霰弹枪：更重的低频 + 更长的爆燃尾
  shotgun() {
    if (!this.ok()) return; const t = this.ctx.currentTime; const j = 0.95 + Math.random() * 0.1; const out = this._out(1.0, 0.7);
    this._noise(out, t, 0.03, 'highpass', 3000 * j, 0.7, 0.7, 0.001);
    this._noise(out, t, 0.22, 'bandpass', 900 * j, 0.6, 1.0, 0.001);
    this._noise(out, t, 0.6, 'lowpass', 420 * j, 0.6, 0.8, 0.002, this.brown);
    this._tone(out, t, 'sine', 95 * j, 32, 0.28, 1.0, 0.002);
  }
  pump() { if (!this.ok()) return; const t = this.ctx.currentTime; const out = this._out(0.7, 0.1); this._noise(out, t, 0.06, 'bandpass', 1500, 3, 0.45); this._tone(out, t, 'triangle', 700, 500, 0.04, 0.1); this._noise(out, t + 0.16, 0.05, 'bandpass', 2100, 4, 0.5); this._tone(out, t + 0.16, 'triangle', 1000, 800, 0.04, 0.1); }
  shellIn() { if (!this.ok()) return; const t = this.ctx.currentTime; const out = this._out(0.6, 0.05); this._noise(out, t, 0.04, 'bandpass', 2600, 4, 0.35); this._tone(out, t, 'triangle', 1400, 1100, 0.03, 0.08); }
  swing() { if (!this.ok()) return; const t = this.ctx.currentTime; this._noise(this._out(0.6, 0.05), t, 0.18, 'bandpass', 900, 1.2, 0.35); }
  bash() { if (!this.ok()) return; const t = this.ctx.currentTime; const out = this._out(0.8, 0.1); this._noise(out, t, 0.08, 'bandpass', 1800, 2, 0.6); this._tone(out, t, 'square', 600, 200, 0.08, 0.2); this._tone(out, t, 'sine', 140, 60, 0.12, 0.5); }
  throwG() { if (!this.ok()) return; const t = this.ctx.currentTime; const out = this._out(0.6, 0.05); this._tone(out, t, 'triangle', 2600, 2400, 0.03, 0.08); this._noise(out, t + 0.25, 0.2, 'bandpass', 700, 1, 0.25); }
  bounce(p) { if (!this.ok()) return; const t = this.ctx.currentTime; const out = this._pos(p, 0.5, 0.1); this._tone(out, t, 'triangle', 1700 + Math.random() * 600, 1200, 0.06, 0.12); }
  switchW() { if (!this.ok()) return; const t = this.ctx.currentTime; const out = this._out(0.5, 0.05); this._noise(out, t, 0.05, 'bandpass', 1200, 3, 0.25); this._noise(out, t + 0.22, 0.04, 'bandpass', 2200, 4, 0.35); }
  dry() { if (!this.ok()) return; const t = this.ctx.currentTime; this._noise(this._out(0.7, 0.05), t, 0.03, 'bandpass', 2400, 3, 0.4); this._tone(this._out(0.5, 0), t, 'square', 900, 500, 0.02, 0.06); }
  reload(dur) {
    if (!this.ok()) return; const t = this.ctx.currentTime; const out = this._out(0.8, 0.15);
    const clack = (tt, f, g) => { this._noise(out, tt, 0.05, 'bandpass', f, 4, g); this._tone(out, tt, 'triangle', f * 0.6, f * 0.4, 0.04, g * 0.25); };
    clack(t + dur * 0.1, 1800, 0.5);   // 退弹匣
    this._noise(out, t + dur * 0.16, 0.18, 'bandpass', 700, 1.2, 0.12);
    clack(t + dur * 0.5, 1300, 0.6);   // 插弹匣
    clack(t + dur * 0.56, 2400, 0.35);
    clack(t + dur * 0.8, 2000, 0.55);  // 拉机柄
    clack(t + dur * 0.87, 1500, 0.6);
  }
  hit(weak) {
    if (!this.ok()) return; const t = this.ctx.currentTime; const out = this._out(0.6, 0.05);
    this._noise(out, t, 0.05, 'bandpass', weak ? 4200 : 2600, 3, weak ? 0.45 : 0.3);
    this._tone(out, t, 'square', weak ? 1900 : 1200, weak ? 1500 : 800, 0.05, weak ? 0.12 : 0.06);
    if (weak) this._tone(out, t + 0.04, 'sine', 2800, 2600, 0.08, 0.1);
  }
  impact(p) { if (!this.ok()) return; const t = this.ctx.currentTime; const out = this._pos(p, 0.5, 0.2); this._noise(out, t, 0.06, 'bandpass', 3000 + Math.random() * 2000, 2, 0.4); if (Math.random() < 0.3) this._tone(out, t, 'sine', 3000 + Math.random() * 2000, 1200, 0.18, 0.06); }
  explode(p, size = 1) {
    if (!this.ok()) return; const t = this.ctx.currentTime; const out = this._pos(p, 1.2 * size, 0.8);
    this._noise(out, t, 0.9 * size, 'lowpass', 900, 0.7, 1.0, 0.003, this.brown);
    this._noise(out, t, 0.35, 'bandpass', 2200, 0.7, 0.5);
    this._tone(out, t, 'sine', 80, 28, 0.8 * size, 1.0, 0.004);
    for (let i = 0; i < 8; i++) this._noise(out, t + 0.15 + Math.random() * 0.8, 0.04, 'bandpass', 2500 + Math.random() * 3000, 4, 0.12);
  }
  // —— 敌人 ——
  enemyShot(type, p) {
    if (!this.ok()) return; const t = this.ctx.currentTime; const out = this._pos(p, type === 'warden' ? 1.0 : 0.7, 0.5);
    if (type === 'warden') { this._noise(out, t, 0.18, 'bandpass', 900, 0.8, 0.8); this._tone(out, t, 'sawtooth', 380, 90, 0.15, 0.25); this._tone(out, t, 'sine', 90, 40, 0.18, 0.6); }
    else { this._tone(out, t, 'sawtooth', 1600, 300, 0.14, 0.2); this._noise(out, t, 0.08, 'highpass', 3000, 1, 0.2); }
  }
  enemyVoice(type, verb, p) {
    if (!this.ok()) return; const t = this.ctx.currentTime;
    if (type === 'hound') {
      const out = this._pos(p, verb === 'death' ? 0.6 : 0.55, 0.3);
      if (verb === 'attack') { this._tone(out, t, 'sawtooth', 180, 520, 0.25, 0.22); this._noise(out, t, 0.25, 'bandpass', 1200, 3, 0.2); }
      else if (verb === 'death') this._tone(out, t, 'sawtooth', 600, 60, 0.6, 0.25);
      else { this._tone(out, t, 'square', 320 + Math.random() * 80, 260, 0.18, 0.05); this._tone(out, t + 0.2, 'square', 300, 380, 0.12, 0.04); }
    } else if (type === 'gull') {
      const out = this._pos(p, 0.5, 0.4);
      const f = 1800 + Math.random() * 600;
      if (verb === 'death') this._tone(out, t, 'triangle', f, 200, 0.7, 0.2);
      else for (let i = 0; i < 3; i++) this._tone(out, t + i * 0.09, 'triangle', f, f * 0.7, 0.07, 0.09);
    } else {
      const out = this._pos(p, 0.9, 0.6);
      if (verb === 'death') { this._tone(out, t, 'sawtooth', 140, 30, 1.4, 0.3); this._noise(out, t, 1.2, 'lowpass', 500, 2, 0.4, 0.01, this.brown); }
      else if (verb === 'attack' || verb === 'spawn') { this._tone(out, t, 'sawtooth', 70, 110, 0.6, 0.25, 0.08); this._noise(out, t, 0.5, 'bandpass', 400, 4, 0.2, 0.05); }
      else { this._noise(out, t, 0.6, 'bandpass', 260 + Math.random() * 100, 6, 0.15, 0.1); }
    }
  }
  // —— 任务 ——
  relayLoop(on) {
    if (!this.ctx) return;
    if (on && !this._hum) {
      const c = this.ctx; const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 60;
      const o2 = c.createOscillator(); o2.type = 'sine'; o2.frequency.value = 240;
      const g = c.createGain(); g.gain.value = 0.0001; g.gain.setTargetAtTime(0.06, c.currentTime, 0.1);
      const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 400; f.Q.value = 2;
      o.connect(f); o2.connect(f); f.connect(g); g.connect(this.sfx); o.start(); o2.start();
      this._hum = { o, o2, g, f };
    } else if (!on && this._hum) {
      const h = this._hum; this._hum = null; const t = this.ctx.currentTime;
      h.g.gain.setTargetAtTime(0.0001, t, 0.05); h.o.stop(t + 0.3); h.o2.stop(t + 0.3);
    }
  }
  relayProgress(p) { if (this._hum) { this._hum.o2.frequency.value = 240 + p * 480; this._hum.f.frequency.value = 400 + p * 1400; } }
  relayCut(p) {
    if (!this.ok()) return; const t = this.ctx.currentTime; const out = this._pos(p, 1, 0.6);
    this._noise(out, t, 0.4, 'highpass', 2000, 0.7, 0.6); this._tone(out, t, 'sawtooth', 900, 40, 1.2, 0.35); this._tone(out, t + 0.05, 'sine', 60, 30, 0.8, 0.6);
    for (let i = 0; i < 10; i++) this._noise(out, t + Math.random() * 0.6, 0.02, 'bandpass', 4000 + Math.random() * 3000, 5, 0.25);
    this.sting(1);
  }
  radio() { if (!this.ok()) return; const t = this.ctx.currentTime; const out = this._out(0.4, 0); this._noise(out, t, 0.12, 'bandpass', 1800, 2, 0.15); this._tone(out, t + 0.02, 'sine', 1400, 1400, 0.06, 0.08); this._tone(out, t + 0.1, 'sine', 1800, 1800, 0.06, 0.06); }
  sting(kind = 0) {
    if (!this.ok()) return; const t = this.ctx.currentTime; const out = this.music;
    const notes = kind ? [110, 116.5, 164.8] : [146.8, 155.6, 220];
    for (const f of notes) this._tone(out, t, 'sawtooth', f, f * 0.98, 2.2, 0.05, 0.4);
    this._tone(out, t, 'sine', 41, 38, 2.5, 0.25, 0.05);
  }
  foot(sprint) { if (!this.ok()) return; const t = this.ctx.currentTime; const out = this._out(0.35, 0.05); this._noise(out, t, 0.08, 'bandpass', 600 + Math.random() * 300, 1, sprint ? 0.35 : 0.22); this._noise(out, t + 0.02, 0.12, 'highpass', 3500, 0.5, 0.08); }
  hurt() { if (!this.ok()) return; const t = this.ctx.currentTime; const out = this._out(0.7, 0); this._tone(out, t, 'sine', 140, 60, 0.25, 0.5); this._noise(out, t, 0.15, 'lowpass', 900, 1, 0.4); }
  pickup() { if (!this.ok()) return; const t = this.ctx.currentTime; const out = this._out(0.5, 0.1); this._tone(out, t, 'triangle', 700, 900, 0.08, 0.15); this._tone(out, t + 0.08, 'triangle', 1050, 1200, 0.1, 0.12); }
  ui() { if (!this.ok()) return; const t = this.ctx.currentTime; this._tone(this._out(0.4, 0), t, 'triangle', 900, 700, 0.05, 0.08); }
  win() { if (!this.ok()) return; const t = this.ctx.currentTime; [220, 277, 330, 440].forEach((f, i) => this._tone(this.music, t + i * 0.18, 'triangle', f, f, 1.6, 0.08, 0.05)); }

  update(dt, s) {
    if (!this.ctx) return;
    const c = this.ctx; const t = c.currentTime;
    const L = c.listener;
    if (L.positionX && s.cam) {
      L.positionX.value = s.cam.position.x; L.positionY.value = s.cam.position.y; L.positionZ.value = s.cam.position.z;
      L.forwardX.value = s.fwd.x; L.forwardY.value = s.fwd.y; L.forwardZ.value = s.fwd.z; L.upX.value = 0; L.upY.value = 1; L.upZ.value = 0;
    }
    const play = s.mode === 'play';
    const tension = play ? Math.min(1, s.enemies / 8 + s.phase * 0.18) : 0.25;
    this.pad.forEach((p, i) => p.gn.gain.setTargetAtTime(p.g * (0.6 + tension * (i > 2 ? 2.4 : 1)), t, 0.8));
    this.sea.gn.gain.setTargetAtTime(Math.max(0, 1 - (s.cam ? (s.cam.position.z + 62) / 60 : 1)) * 0.35 + 0.05, t, 0.5);
    this.wind.fl.frequency.setTargetAtTime(300 + Math.sin(t * 0.13) * 120 + Math.sin(t * 0.41) * 60, t, 0.5);
    this.sfxLP.frequency.setTargetAtTime(s.hp < 30 && play ? 1400 : 18000, t, 0.2);
    // 心跳/战斗脉冲
    this.nextPulse -= dt;
    if (play && this.nextPulse <= 0) {
      const lowHp = s.hp < 30;
      this.nextPulse = lowHp ? 0.75 : 1.4 - tension * 0.7;
      if (lowHp || tension > 0.3) { this._tone(this.music, t, 'sine', 58, 36, 0.18, lowHp ? 0.5 : 0.18 * tension); this._tone(this.music, t + 0.22, 'sine', 50, 34, 0.16, lowHp ? 0.35 : 0.1 * tension); }
    }
    // 远处汽笛、金属吱嘎
    this.nextHorn -= dt;
    if (this.nextHorn <= 0) { this.nextHorn = 25 + Math.random() * 30; this._tone(this.amb, t, 'sawtooth', 98, 97, 3.2, 0.03, 0.6); this._tone(this.amb, t, 'sawtooth', 146.5, 146, 3.2, 0.02, 0.6); }
    this.nextCreak -= dt;
    if (this.nextCreak <= 0) { this.nextCreak = 6 + Math.random() * 10; this._tone(this.amb, t, 'sawtooth', 70 + Math.random() * 40, 50, 1.4, 0.015, 0.3); }
    // 雨滴敲铁皮
    this.nextDrop -= dt;
    if (this.nextDrop <= 0) { this.nextDrop = 0.05 + Math.random() * 0.12; this._tone(this.amb, t, 'sine', 2000 + Math.random() * 3000, 1500, 0.03, 0.008 + Math.random() * 0.01); }
  }
}
