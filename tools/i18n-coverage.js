#!/usr/bin/env node
/*
 * Lists JSM customer-portal texts that the built-in Persian dictionary does not translate yet.
 *   node tools/i18n-coverage.js <strings.properties-lines-file> [out.tsv]
 * The input is key=value lines extracted from JSM's own i18n .properties files.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const WEB = path.join(__dirname, '../plugin/src/main/resources/web');
const ctx = { console, Intl, JSON, Math, Date, Object, Array, String, Number, RegExp, isFinite };
ctx.window = ctx;
ctx.location = { pathname: '/jira/servicedesk/customer/portals', search: '' };
ctx.document = { readyState: 'complete', documentElement: {}, createDocumentFragment: () => ({ querySelector() { return null; } }) };
vm.createContext(ctx);
['js/pt-namespace.js', 'js/pt-color.js', 'js/pt-presets.js', 'js/pt-tokens.js', 'js/pt-i18n-fa.js', 'js/pt-date.js', 'js/pt-text.js']
  .forEach((f) => vm.runInContext(fs.readFileSync(path.join(WEB, f), 'utf8'), ctx, { filename: f }));
const PT = ctx.PortalTheme;
PT.text.configure(PT.presets.presetSettings('persian'), PT.i18n.fa);
const out = [];
for (const line of fs.readFileSync(process.argv[2], 'utf8').split('\n')) {
  const i = line.indexOf('=');
  if (i < 0) { continue; }
  const k = line.slice(0, i).trim();
  const v = line.slice(i + 1).trim().replace(/''/g, "'");
  if (!v) { continue; }
  const probe = v.replace(/\{(\d)\}/g, (m, n) => 'Xval' + n);
  const sentence = PT.i18n.fa.sentences && PT.i18n.fa.sentences[v.replace(/\{(\d)\}/g, (m, n) => '{' + (+n + 1) + '}')];
  if (PT.text.translate(probe) === null && !sentence) { out.push(k + '\t' + v); }
}
if (process.argv[3]) { fs.writeFileSync(process.argv[3], out.join('\n') + '\n'); }
console.log(out.length + ' untranslated');
