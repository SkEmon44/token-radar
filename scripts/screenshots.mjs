// Captures the three dossier screenshots (plus the method view) from out/dashboard through a running
// Chrome's DevTools port: node scripts/screenshots.mjs [cdp-port]. Run main.ts into out/ first.
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const port = process.argv[2] ?? '29229';
const page = 'file://' + resolve('out/dashboard/index.html');
const shots = [
  ['1-board.png', 'sel=steakhouse-financial'],
  ['2-detail.png', 'sel=veda'],
  ['3-filtered.png', 'kind=vault&rising=1&min=50000000&sel=gauntlet'],
  ['4-method.png', 'tab=method'],
];

const target = await (await fetch(`http://localhost:${port}/json/new?about:blank`, { method: 'PUT' })).json();
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((ok) => ws.addEventListener('open', ok, { once: true }));
let id = 0;
const pending = new Map();
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  if (m.method === 'Runtime.exceptionThrown') console.error('page error:', m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text);
});
const send = (method, params = {}) => new Promise((ok) => { const i = ++id; pending.set(i, ok); ws.send(JSON.stringify({ id: i, method, params })); });
const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));

await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
for (const [name, hash] of shots) {
  await send('Page.navigate', { url: 'about:blank' });
  await send('Page.navigate', { url: `${page}#${hash}` });
  await sleep(1200);
  const r = await send('Page.captureScreenshot', { format: 'png' });
  const buf = Buffer.from(r.result.data, 'base64');
  writeFileSync(`screenshots/${name}`, buf);
  console.log(name, buf.length, 'bytes');
}
await fetch(`http://localhost:${port}/json/close/${target.id}`);
ws.close();
