/*
 * Front-end engine tests (plain Node, no dependencies):  node src/test/js/engine.test.js
 * Covers colour maths / WCAG contrast, token generation, presets, per-portal merging,
 * the text layer (exact texts, patterns, admin overrides, digits, skip rules) and URL routing.
 */
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const WEB = path.join(__dirname, '../../main/resources/web');
const ctx = { window: {}, console, Intl, JSON, Math, Date, Object, Array, String, Number, RegExp, isFinite };
ctx.window = ctx;
ctx.location = { pathname: '/jira/servicedesk/customer/portals', search: '' };
ctx.document = { readyState: 'complete', documentElement: {}, createDocumentFragment: () => ({ querySelector() { return null; } }) };
vm.createContext(ctx);
['js/pt-namespace.js', 'js/pt-color.js', 'js/pt-presets.js', 'js/pt-tokens.js', 'js/pt-i18n-fa.js', 'js/pt-compat.js', 'js/pt-date.js', 'js/pt-text.js',
  'admin/admin-i18n.js']
  .forEach((f) => vm.runInContext(fs.readFileSync(path.join(WEB, f), 'utf8'), ctx, { filename: f }));
const PT = ctx.PortalTheme;

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); } catch (e) { console.error('  ✗ ' + name + '\n    ' + e.message); process.exitCode = 1; }
}

console.log('colour');
test('WCAG contrast of black on white is 21', () => assert.strictEqual(Math.round(PT.color.contrast('#000', '#fff')), 21));
test('ensureContrast reaches the requested ratio', () => {
  const c = PT.color.ensureContrast('#f2bf00', '#ffffff', 4.5);
  assert.ok(PT.color.contrast(c, '#ffffff') >= 4.5, c);
});
test('onColor picks readable text', () => {
  assert.strictEqual(PT.color.onColor('#000000'), '#ffffff');
  assert.strictEqual(PT.color.onColor('#f2bf00'), '#111111');
});

console.log('tokens');
function eff(doc, portal) { return PT.presets.effective(doc, portal); }
test('every preset yields AA text/brand pairs after adjustment', () => {
  Object.keys(PT.presets.PRESETS).forEach((id) => {
    ['light', 'dark'].forEach((scheme) => {
      const t = PT.tokens.tokenMap(PT.presets.presetSettings(id), scheme);
      const pairs = [['--pt-text', '--pt-surface', 7], ['--pt-muted', '--pt-surface', 4.5], ['--pt-muted', '--pt-bg', 4.5],
        ['--pt-on-brand', '--pt-brand', 4.5], ['--pt-brand-text', '--pt-surface', 4.5], ['--pt-on-header', '--pt-header', 4.5],
        ['--pt-success-fg', '--pt-success-bg', 4.5], ['--pt-error-fg', '--pt-error-bg', 4.5], ['--pt-warning-fg', '--pt-warning-bg', 4.5]];
      pairs.forEach(([fg, bg, min]) => {
        const r = PT.color.contrast(t[fg], t[bg]);
        assert.ok(r >= min - 0.05, `${id}/${scheme}: ${fg} on ${bg} = ${r.toFixed(2)}`);
      });
    });
  });
});
test('hostile admin colours are still made readable', () => {
  const s = eff({ global: { colors: { primary: '#ffff00', text: '#dddddd', muted: '#eeeeee', header: '#fafafa' } } });
  const t = PT.tokens.tokenMap(s, 'light');
  assert.ok(PT.color.contrast(t['--pt-text'], t['--pt-surface']) >= 7);
  assert.ok(PT.color.contrast(t['--pt-muted'], t['--pt-surface']) >= 4.5);
  assert.ok(PT.color.contrast(t['--pt-brand-text'], t['--pt-surface']) >= 4.5);
});
test('css() scopes tokens and emits dark block for auto', () => {
  const css = PT.tokens.css(eff({ global: { appearance: { mode: 'auto' } } }), '.x');
  assert.ok(css.indexOf('.x {') === 0);
  assert.ok(css.includes('@media (prefers-color-scheme: dark)'));
});
test('radius 0 gives square pills; logo box is clamped', () => {
  const t = PT.tokens.tokenMap(eff({ global: { shape: { radius: 0 }, identity: { logoHeight: 500 } } }), 'light');
  assert.strictEqual(t['--pt-radius-pill'], '0');
  assert.strictEqual(t['--pt-logo-h'], '64px');
});
test('custom font stack is sanitised', () => {
  const f = PT.tokens.fontStack({ font: 'custom', customStack: 'X; } body{display:none' });
  assert.ok(!/[;{}]/.test(f), f);
});

console.log('presets & per-portal');
test('portal overrides merge over global', () => {
  const doc = { preset: 'zarrin', global: { identity: { companyName: 'Co' } }, portals: { 7: { colors: { primary: '#0b6e4f' } } } };
  assert.strictEqual(eff(doc, '7').colors.primary, '#0b6e4f');
  assert.strictEqual(eff(doc, '7').identity.companyName, 'Co');
  assert.strictEqual(eff(doc, '8').colors.primary, '#111111');
  assert.strictEqual(eff(doc, null).colors.accent, '#f2bf00');
});
test('old preset ids keep working', () => {
  assert.strictEqual(PT.presets.normalizeDocument({ preset: 'bimeh-bazaar' }).preset, 'zarrin');
});
test('unknown preset falls back to persian default', () => {
  assert.strictEqual(PT.presets.normalizeDocument({ preset: 'nope' }).preset, 'persian');
});
test('admin i18n has the same keys in both languages', () => {
  const keys = (o, p) => Object.keys(o).flatMap((k) => (o[k] && typeof o[k] === 'object' && !Array.isArray(o[k]) ? keys(o[k], p + k + '.') : [p + k]));
  const en = keys(PT.adminI18n.en, '').sort();
  const fa = keys(PT.adminI18n.fa, '').sort();
  assert.deepStrictEqual(fa, en);
});

console.log('text layer');
function configure(extra) {
  const s = PT.util.merge(PT.presets.presetSettings('persian'), extra || {});
  PT.text.configure(s, PT.i18n.fa);
}
test('exact texts are replaced, whitespace preserved', () => {
  configure();
  assert.strictEqual(PT.text.translate('  My requests \n'), '  درخواست‌های من \n');
  assert.strictEqual(PT.text.translate('Something unknown'), null);
});
test('status-change activity sentences are Persian', () => {
  configure();
  assert.strictEqual(PT.text.translate('Your request status changed to Escalated.'), 'وضعیت درخواست شما به «\u2068ارجاع‌شده\u2069» تغییر کرد.');
  assert.ok(PT.text.translate('Your request status changed to Done with resolution Duplicate.').includes('تکراری'));
  const keys = Object.keys(PT.i18n.fa.sentences);
  keys.forEach((k) => assert.strictEqual((PT.i18n.fa.sentences[k].match(/\{\d\}/g) || []).join(), (k.match(/\{\d\}/g) || []).join(), k));
});
test('substrings are never replaced', () => {
  configure();
  assert.strictEqual(PT.text.translate('Open the door'), null);
});
test('patterns translate and isolate variable parts', () => {
  configure();
  const out = PT.text.translate("Please provide a value for required field 'Summary'");
  assert.ok(out.includes('عنوان'), out);
  assert.ok(out.includes('⁨') && out.includes('⁩'));
});
test('Persian digits, but keys/emails/URLs keep Latin digits', () => {
  configure();
  assert.strictEqual(PT.text.translate('3 requests'), '۳ درخواست');
  configure({ dictionary: { 'Ticket SD-12 created': 'درخواست SD-12 ثبت شد' } });
  assert.strictEqual(PT.text.translate('Ticket SD-12 created'), 'درخواست SD-12 ثبت شد');
});
test('admin overrides and admin patterns win', () => {
  configure({ dictionary: { 'My requests': 'تیکت‌های من' }, patterns: [{ source: 'Hello {1}!', target: 'سلام {1}!' }] });
  assert.strictEqual(PT.text.translate('My requests'), 'تیکت‌های من');
  assert.strictEqual(PT.text.translate('Hello Sara!'), 'سلام Sara!');
});
test('company name replaces Help Center', () => {
  configure({ identity: { companyName: 'بیمه‌بازار' } });
  assert.strictEqual(PT.text.translate('Help Center'), 'بیمه‌بازار');
});
test('translation off keeps only admin texts', () => {
  configure({ locale: { translate: false }, dictionary: { Send: 'بفرست' } });
  assert.strictEqual(PT.text.translate('My requests'), null);
  assert.strictEqual(PT.text.translate('Send'), 'بفرست');
});

console.log('dates');
test('Jira dates become Shamsi', () => {
  configure();
  const a = PT.text.translate('24/Sep/26');
  assert.ok(/مهر/.test(a) && /۱۴۰۵/.test(a), a);
  const b = PT.text.translate('Sep 24, 2026 3:15 PM');
  assert.ok(/ساعت/.test(b) && /۱۵:۱۵/.test(b), b);
  assert.strictEqual(PT.text.translate('SD-12'), null);
});
test('standalone numbers get Persian digits', () => {
  configure();
  assert.strictEqual(PT.text.translate('12'), '۱۲');
  assert.strictEqual(PT.text.translate('1 - 20'), '۱ - ۲۰');
});
test('no Jalali in the English preset', () => {
  PT.text.configure(PT.presets.presetSettings('clean-ltr'), null);
  assert.strictEqual(PT.text.translate('24/Sep/26'), null);
});

console.log('routing');
test('page types from URLs', () => {
  const p = (u) => PT.compat.page(u);
  assert.strictEqual(p('/jira/servicedesk/customer/portals'), 'home');
  assert.strictEqual(p('/servicedesk/customer/portal/2'), 'portal');
  assert.strictEqual(p('/servicedesk/customer/portal/2/group/5'), 'portal');
  assert.strictEqual(p('/servicedesk/customer/portal/2/create/14'), 'create');
  assert.strictEqual(p('/servicedesk/customer/portal/2/SD-15'), 'request');
  assert.strictEqual(p('/servicedesk/customer/user/requests'), 'requests');
  assert.strictEqual(p('/servicedesk/customer/user/login'), 'login');
  assert.strictEqual(p('/secure/Dashboard.jspa'), 'other');
  assert.strictEqual(PT.compat.portalId('/servicedesk/customer/portal/12/SD-1'), '12');
});
test('safeUrl rejects script URLs', () => {
  assert.strictEqual(PT.util.safeUrl('javascript:alert(1)'), '');
  assert.strictEqual(PT.util.safeUrl('//evil.example'), '');
  assert.strictEqual(PT.util.safeUrl('/secure/Dashboard.jspa'), '/secure/Dashboard.jspa');
});

console.log(`\n${passed} passed${process.exitCode ? ', some FAILED' : ''}`);
