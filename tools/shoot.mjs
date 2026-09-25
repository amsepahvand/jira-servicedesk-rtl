#!/usr/bin/env node
/*
 * Visual QA helper: logs in to a LOCAL test Jira, then takes real-size screenshots of portal pages
 * at several widths using headless Chrome over the DevTools protocol (no npm dependencies).
 *
 *   node tools/shoot.mjs <outDir> <width> <path> [<path> ...]
 *   env: JIRA=http://localhost:2990/jira  JUSER=admin  JPASS=admin  (local AMPS instance only)
 *        FULL=1 for full-page screenshots, EVAL="js" to run before the shot
 */
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';

const [outDir, widthArg, ...paths] = process.argv.slice(2);
const JIRA = process.env.JIRA || 'http://localhost:2990/jira';
const width = parseInt(widthArg, 10) || 1440;
const height = width < 500 ? 812 : width < 900 ? 1024 : 900;
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
mkdirSync(outDir, { recursive: true });

// 1. session on the local test instance (fixture account, never a real user)
const login = process.env.NOLOGIN ? null : await fetch(`${JIRA}/rest/tsv/latest/authenticate`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'X-Atlassian-Token': 'no-check' },
  body: JSON.stringify({ username: process.env.JUSER || 'admin', password: process.env.JPASS || 'admin', rememberMe: false, targetUrl: '/' })
});
let cookies = login ? (login.headers.getSetCookie?.() || []).map((c) => c.split(';')[0]).filter(Boolean) : [];
if (login && (!login.ok || process.env.SESSION)) {
  // Jira 9: the classic REST session endpoint
  const s = await fetch(`${JIRA}/rest/auth/1/session`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Atlassian-Token': 'no-check' },
    body: JSON.stringify({ username: process.env.JUSER || 'admin', password: process.env.JPASS || 'admin' }) });
  cookies = (s.headers.getSetCookie?.() || []).map((c) => c.split(';')[0]).filter(Boolean);
}
if (login && !cookies.length) { console.error('login failed', login.status); process.exit(1); }

// 2. headless Chrome with remote debugging
const port = 9300 + Math.floor(Math.random() * 500);
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${port}`, '--disable-gpu', '--hide-scrollbars',
  `--user-data-dir=/tmp/pt-shoot-${port}`, 'about:blank'], { stdio: 'ignore' });
let wsUrl;
for (let i = 0; i < 50 && !wsUrl; i++) {
  await sleep(200);
  try { wsUrl = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((t) => t.type === 'page')?.webSocketDebuggerUrl; } catch { /* starting */ }
}
const ws = new WebSocket(wsUrl);
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
let seq = 0;
const pending = new Map();
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
});
const cdp = (method, params = {}) => new Promise((resolve) => { const id = ++seq; pending.set(id, resolve); ws.send(JSON.stringify({ id, method, params })); });

await cdp('Network.enable');
await cdp('Runtime.enable');
const errors = [];
ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.method === 'Runtime.exceptionThrown') { errors.push(m.params.exceptionDetails.exception?.description?.split('\n')[0] || m.params.exceptionDetails.text); } if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') { errors.push('console: ' + (m.params.args[0]?.value || m.params.args[0]?.description || '').toString().slice(0, 160)); } });
const host = new URL(JIRA);
for (const c of cookies) {
  const [name, ...rest] = c.split('=');
  await cdp('Network.setCookie', { name, value: rest.join('='), domain: host.hostname, path: '/' });
}
await cdp('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 600 });
await cdp('Page.enable');

for (const p of paths) {
  const url = p.startsWith('http') ? p : `${JIRA}${p}`;
  await cdp('Page.navigate', { url });
  await sleep(parseInt(process.env.WAIT || '6000', 10));
  if (process.env.EVAL) {
    const r = await cdp('Runtime.evaluate', { expression: process.env.EVAL, awaitPromise: true, returnByValue: true });
    if (r.result?.result?.value !== undefined) { console.log('eval:', r.result.result.value); }
    await sleep(1500);
  }
  let clip;
  if (process.env.FULL) {
    const m = await cdp('Page.getLayoutMetrics');
    const h = Math.min(Math.ceil(m.result.cssContentSize.height), 6000);
    clip = { x: 0, y: 0, width, height: h, scale: 1 };
  }
  const shot = await cdp('Page.captureScreenshot', { format: 'png', captureBeyondViewport: !!clip, ...(clip ? { clip } : {}) });
  const name = `${outDir}/${width}-${p.replace(/^\/+/, '').replace(/[^a-z0-9]+/gi, '_').slice(0, 60) || 'root'}.png`;
  writeFileSync(name, Buffer.from(shot.result.data, 'base64'));
  console.log(name);
}
if (process.env.ERRORS) { console.log('errors: ' + (errors.length ? '\n  ' + errors.join('\n  ') : 'none')); }
ws.close();
chrome.kill();
