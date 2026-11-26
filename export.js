/* 逐帧导出：CDP 控制无头 Chrome，按时间点渲染后用 ffmpeg 编码 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { once } = require('events');

const CHROME = process.env.CHROME || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9333;

const args = process.argv.slice(2);
const getArg = (k, d) => { const i = args.indexOf('--' + k); return i > -1 ? args[i + 1] : d; };
const PAGE = getArg('page', 'index.html');
const LAY = getArg('layout', '');
const URL_PAGE = 'http://127.0.0.1:8731/' + PAGE + '?export=1' +
  (LAY ? '&layout=' + LAY : '') + '&v=' + Date.now();
const FPS = parseFloat(getArg('fps', '30'));
const FROM = parseFloat(getArg('from', '0'));
const TO = parseFloat(getArg('to', '30.033'));
const OUT = getArg('out', 'out/eprolo-30s.mp4');
const LIMIT = parseInt(getArg('limit', '0'), 10); // 0 = 全部，用于快速测速
const CRF = getArg('crf', '16');
const VW = parseInt(getArg('w', '1920'), 10);
const VH = parseInt(getArg('h', '1080'), 10);

const sleep = ms => new Promise(r => setTimeout(r, ms));

function getJSON(p0) {
  return new Promise((res, rej) => {
    http.get({ host: '127.0.0.1', port: PORT, path: p0 }, r => {
      let d = '';
      r.on('data', c => d += c);
      r.on('end', () => { try { res(JSON.parse(d)); } catch (e) { rej(e); } });
    }).on('error', rej);
  });
}

function connect(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let id = 0;
    const pending = new Map();
    ws.onmessage = e => {
      const m = JSON.parse(e.data);
      if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
    };
    ws.onerror = e => reject(new Error('ws error'));
    ws.onopen = () => resolve({
      ws,
      send: (method, params = {}) => new Promise((res, rej) => {
        const i = ++id;
        pending.set(i, m => m.error ? rej(new Error(method + ' -> ' + m.error.message)) : res(m.result));
        ws.send(JSON.stringify({ id: i, method, params }));
      })
    });
  });
}

(async () => {
  const udd = path.join(process.env.TEMP || '/tmp', 'eprolo-export-profile');
  const chrome = spawn(CHROME, [
    '--headless=new',
    '--remote-debugging-port=' + PORT,
    '--user-data-dir=' + udd,
    '--no-first-run', '--no-default-browser-check',
    '--hide-scrollbars', '--force-device-scale-factor=1',
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
    '--window-size=' + VW + ',' + VH,
    URL_PAGE
  ], { stdio: 'ignore' });

  const cleanup = () => { try { chrome.kill(); } catch (e) { } };
  process.on('exit', cleanup);

  // 等页面 target 就绪
  let page = null;
  for (let i = 0; i < 120; i++) {
    try {
      const list = await getJSON('/json/list');
      page = list.find(x => x.type === 'page' && x.url.includes(PAGE));
      if (page && page.webSocketDebuggerUrl) break;
    } catch (e) { }
    await sleep(250);
  }
  if (!page) throw new Error('未找到页面 target');

  const cdp = await connect(page.webSocketDebuggerUrl);
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: VW, height: VH, deviceScaleFactor: 1, mobile: false
  });

  // 等资源与字体
  let ok = false;
  for (let i = 0; i < 200; i++) {
    const r = await cdp.send('Runtime.evaluate', {
      expression: 'document.readyState==="complete" && !!window.__frame && (window.__imgsReady?window.__imgsReady():true)',
      returnByValue: true
    });
    if (r.result && r.result.value === true) { ok = true; break; }
    await sleep(150);
  }
  if (!ok) throw new Error('资源未就绪');
  await cdp.send('Runtime.evaluate', { expression: 'document.fonts && document.fonts.ready' });
  await sleep(400);

  // 校验视口尺寸与画布是否 1:1
  const dim = await cdp.send('Runtime.evaluate', {
    expression: 'JSON.stringify({vw:innerWidth,vh:innerHeight,cw:c.clientWidth,ch:c.clientHeight,bw:c.width,bh:c.height,layout:window.__layout})',
    returnByValue: true
  });
  console.log('viewport', dim.result.value);
  const DD = JSON.parse(dim.result.value);
  if (DD.cw !== DD.bw || DD.ch !== DD.bh) {
    console.warn(`WARN 画布 CSS ${DD.cw}×${DD.ch} ≠ 位图 ${DD.bw}×${DD.bh}，截图会被缩放`);
  }

  const total = Math.round((TO - FROM) * FPS);
  const count = LIMIT > 0 ? Math.min(LIMIT, total) : total;
  console.log(`frames=${count} fps=${FPS} duration=${(count / FPS).toFixed(2)}s`);

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  const ff = spawn('ffmpeg', [
    '-y', '-v', 'error',
    '-f', 'image2pipe', '-c:v', 'png', '-framerate', String(FPS), '-i', '-',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', CRF,
    '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-level', '4.2',
    '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709',
    '-movflags', '+faststart',
    OUT
  ], { stdio: ['pipe', 'inherit', 'inherit'] });

  const t0 = Date.now();
  for (let i = 0; i < count; i++) {
    const tt = FROM + i / FPS;
    await cdp.send('Runtime.evaluate', { expression: `window.__frame(${tt.toFixed(4)})` });
    const shot = await cdp.send('Page.captureScreenshot', {
      format: 'png', captureBeyondViewport: false, optimizeForSpeed: true
    });
    const buf = Buffer.from(shot.data, 'base64');
    if (!ff.stdin.write(buf)) await once(ff.stdin, 'drain');
    if (i % 30 === 0 || i === count - 1) {
      const el = (Date.now() - t0) / 1000;
      const eta = el / (i + 1) * (count - i - 1);
      process.stdout.write(`\r${i + 1}/${count}  ${(el / (i + 1) * 1000).toFixed(0)}ms/f  eta ${eta.toFixed(0)}s   `);
    }
  }
  ff.stdin.end();
  await once(ff, 'close');
  console.log('\n完成:', OUT, (fs.statSync(OUT).size / 1048576).toFixed(1) + 'MB');
  cdp.ws.close();
  cleanup();
  process.exit(0);
})().catch(e => { console.error('\nFAILED:', e.message); process.exit(1); });
