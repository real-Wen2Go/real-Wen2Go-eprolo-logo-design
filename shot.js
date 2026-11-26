/* 抽帧检查：node shot.js <page> <t1> <t2> ...  → out/shots/tN.png */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const CHROME = process.env.CHROME || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9335;
const PAGE = process.argv[2] || 'stinger.html';
const TIMES = process.argv.slice(3).map(Number);
const OUTDIR = 'out/shots';
const VW = parseInt(process.env.W || '1920', 10);
const VH = parseInt(process.env.H || '1080', 10);
const LAY = process.env.LAYOUT || '';

const sleep = ms => new Promise(r => setTimeout(r, ms));
const getJSON = p0 => new Promise((res, rej) => {
  http.get({ host: '127.0.0.1', port: PORT, path: p0 }, r => {
    let d = ''; r.on('data', c => d += c); r.on('end', () => { try { res(JSON.parse(d)); } catch (e) { rej(e); } });
  }).on('error', rej);
});
function conn(u) {
  return new Promise((res, rej) => {
    const ws = new WebSocket(u); let id = 0; const p = new Map();
    ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && p.has(m.id)) { p.get(m.id)(m); p.delete(m.id); } };
    ws.onerror = () => rej(new Error('ws'));
    ws.onopen = () => res({ ws, send: (method, params = {}) => new Promise((r2, j2) => { const i = ++id; p.set(i, m => m.error ? j2(new Error(m.error.message)) : r2(m.result)); ws.send(JSON.stringify({ id: i, method, params })); }) });
  });
}
(async () => {
  fs.mkdirSync(OUTDIR, { recursive: true });
  const ch = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + PORT,
    '--user-data-dir=' + path.join(process.env.TEMP, 'eprolo-shot'), '--no-first-run',
    '--hide-scrollbars', '--force-device-scale-factor=1', '--window-size=' + VW + ',' + VH,
    'http://127.0.0.1:8731/' + PAGE + '?export=1' + (LAY ? '&layout=' + LAY : '') + '&v=' + Date.now()], { stdio: 'ignore' });
  process.on('exit', () => { try { ch.kill(); } catch (e) { } });
  let page = null;
  for (let i = 0; i < 120; i++) {
    try { const l = await getJSON('/json/list'); page = l.find(x => x.type === 'page' && x.url.includes(PAGE)); if (page) break; } catch (e) { }
    await sleep(200);
  }
  if (!page) throw new Error('no page');
  const cdp = await conn(page.webSocketDebuggerUrl);
  await cdp.send('Runtime.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: VW, height: VH, deviceScaleFactor: 1, mobile: false });
  let ok = false;
  for (let i = 0; i < 200; i++) {
    const r = await cdp.send('Runtime.evaluate', { expression: 'document.readyState==="complete"&&!!window.__frame&&(window.__imgsReady?window.__imgsReady():1)', returnByValue: true });
    if (r.result.value) { ok = true; break; }
    await sleep(150);
  }
  if (!ok) throw new Error('assets not ready');
  await sleep(500);
  for (const t of TIMES) {
    await cdp.send('Runtime.evaluate', { expression: `window.__frame(${t})` });
    const s = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    fs.writeFileSync(path.join(OUTDIR, 't' + t.toFixed(2) + '.png'), Buffer.from(s.data, 'base64'));
    console.log('shot', t.toFixed(2));
  }
  cdp.ws.close(); process.exit(0);
})().catch(e => { console.error('FAILED', e.message); process.exit(1); });
