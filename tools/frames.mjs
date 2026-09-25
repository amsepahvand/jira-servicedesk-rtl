#!/usr/bin/env node
/*
 * Records what the browser paints while a portal page loads (CDP screencast), to find flashes of
 * the unthemed page. Usage: node tools/frames.mjs <outDir> <fromPath> <toPath>
 * Opens fromPath, then clicks-free navigates to toPath and saves every painted frame.
 */
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
const [outDir, from, to] = process.argv.slice(2);
const JIRA = process.env.JIRA || 'http://localhost:2990/jira';
mkdirSync(outDir, { recursive: true });
const login = await fetch(`${JIRA}/rest/tsv/latest/authenticate`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Atlassian-Token': 'no-check' },
  body: JSON.stringify({ username: 'admin', password: 'admin', rememberMe: false, targetUrl: '/' }) });
const cookies = (login.headers.getSetCookie?.() || []).map((c) => c.split(';')[0]);
const port = 9300 + Math.floor(Math.random() * 500);
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', `--remote-debugging-port=${port}`, '--disable-gpu',
  `--user-data-dir=/tmp/pt-frames-${port}`, 'about:blank'], { stdio: 'ignore' });
let wsUrl;
for (let i = 0; i < 50 && !wsUrl; i++) { await sleep(200); try { wsUrl = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((t) => t.type === 'page')?.webSocketDebuggerUrl; } catch {} }
const ws = new WebSocket(wsUrl); await new Promise((r) => ws.addEventListener('open', r, { once: true }));
let seq = 0; const pending = new Map(); const frames = [];
ws.addEventListener('message', (e) => { const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  if (m.method === 'Page.screencastFrame') { frames.push({ t: Date.now(), data: m.params.data }); ws.send(JSON.stringify({ id: ++seq, method: 'Page.screencastFrameAck', params: { sessionId: m.params.sessionId } })); } });
const cdp = (method, params = {}) => new Promise((resolve) => { const id = ++seq; pending.set(id, resolve); ws.send(JSON.stringify({ id, method, params })); });
await cdp('Network.enable');
for (const c of cookies) { const [name, ...rest] = c.split('='); await cdp('Network.setCookie', { name, value: rest.join('='), domain: new URL(JIRA).hostname, path: '/' }); }
await cdp('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
await cdp('Page.enable');
await cdp('Page.navigate', { url: JIRA + from }); await sleep(6000);
await cdp('Page.startScreencast', { format: 'jpeg', quality: 60, everyNthFrame: 1 });
const t0 = Date.now();
await cdp('Page.navigate', { url: JIRA + to }); await sleep(5000);
await cdp('Page.stopScreencast');
frames.forEach((f, i) => writeFileSync(`${outDir}/f${String(i).padStart(3, '0')}-${f.t - t0}ms.jpg`, Buffer.from(f.data, 'base64')));
console.log(frames.length + ' frames');
ws.close(); chrome.kill();
