// 开发用截图脚本
import { chromium } from 'playwright';
const [,, name='dev', mode='title', q='high', extra=''] = process.argv;
const b = await chromium.launch({ headless:true, executablePath:'/usr/bin/google-chrome', args:['--use-gl=angle','--use-angle=swiftshader-webgl','--ignore-gpu-blocklist']});
const p = await b.newPage({ viewport:{width:1280,height:720}});
p.setDefaultTimeout(180000);
p.on('pageerror', e=>console.log('pageerror',e.message));
p.on('console', m=>{ if(m.type()==='error') console.log('console',m.text()); });
await p.goto(`http://127.0.0.1:4190/?quality=${q}`);
await p.waitForFunction(()=>window.__rt && window.__rt.ready, null, {timeout:120000});
await p.waitForTimeout(1500);
if (mode !== 'title') {
  await p.evaluate(()=>document.getElementById('btnStart').click());
  await p.waitForTimeout(500);
  if (extra) await p.evaluate(extra);
  await p.waitForTimeout(2500);
}
await p.screenshot({path:`screenshots/${name}.png`});
console.log(JSON.stringify(await p.evaluate(()=>window.__rt.state())));
if (process.env.PROBE) console.log("PROBE", await p.evaluate(process.env.PROBE));
await b.close();
