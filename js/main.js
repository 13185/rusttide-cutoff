// 锈潮断链 · 入口（作者：Jack · 禁止转载）
import { Game } from './game.js';
const game = new Game(document.getElementById('view'));
window.__game = game;
window.__rt = { get ready() { return !!game.ready; }, state: () => game.debugState() };
game.boot((txt, p) => { document.getElementById('bootText').textContent = txt; document.getElementById('bootFill').style.width = (p * 100) + '%'; })
  .then(() => { const b = document.getElementById('boot'); b.style.opacity = 0; setTimeout(() => b.remove(), 700); })
  .catch((e) => { document.getElementById('bootText').textContent = '启动失败：' + e.message; console.error(e); });
