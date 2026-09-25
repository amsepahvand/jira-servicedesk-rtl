/*!
 * Portal Theme — boot sequence and the single, centralised MutationObserver.
 *
 *  1. read the inlined configuration (WRM data; no network request)
 *  2. set <html> state: class "pt", dir/lang, page type, feature flags   → CSS activates
 *  3. inject design tokens (+ optional admin CSS)
 *  4. on DOM ready: tag semantic hooks, apply texts, add enhancements, reveal
 *  5. one MutationObserver processes only what JSM adds or changes
 *
 * Without JavaScript nothing here runs, html.pt is never set and every theme rule is inert, so
 * Jira keeps working unthemed. Any exception switches the theme off for the page (fail open).
 */
(function (win, doc) {
  'use strict';

  var PT = win.PortalTheme;
  if (!PT || PT.booted) { return; }
  PT.booted = true;

  var U = PT.util;
  var html = doc.documentElement;
  var DATA_KEY = PT.PLUGIN_KEY + ':theme-core.config';
  var COOKIE = 'portalTheme';

  // ------------------------------------------------------------------ bypass & preview

  function param(name) {
    var m = new RegExp('[?&]' + name + '=([^&#]*)').exec(win.location.search);
    return m ? decodeURIComponent(m[1]) : null;
  }

  function cookiePath() { return (U.contextPath() || '') + '/'; }

  // Emergency bypass, entirely in the browser (it must never change Jira's own resource URLs):
  // ?portalTheme=off keeps the original portal for this browser session, ?portalTheme=on ends it.
  var mode = param('portalTheme');
  if (mode === 'on') {
    doc.cookie = COOKIE + '=; Max-Age=0; Path=' + cookiePath() + '; SameSite=Lax';
  }
  if (mode === 'off') {
    doc.cookie = COOKIE + '=off; Path=' + cookiePath() + '; SameSite=Lax';
  }
  if (mode === 'off' || (mode !== 'on' && /(?:^|;\s*)portalTheme=off\b/.test(doc.cookie))) {
    U.onReady(function () { bypassNotice(); });
    return;
  }

  function bypassNotice() {
    if (doc.getElementById('pt-bypass') || !doc.body) { return; }
    var fa = /^fa/.test(html.getAttribute('lang') || '') || /[\u0600-\u06FF]/.test(doc.title);
    var box = doc.createElement('div');
    box.id = 'pt-bypass';
    box.setAttribute('role', 'status');
    box.setAttribute('style', 'position:fixed;z-index:2147483000;bottom:16px;left:16px;display:flex;align-items:center;gap:12px;' +
      'max-width:calc(100vw - 32px);padding:10px 14px;border-radius:10px;background:#1f2937;color:#fff;' +
      'font:500 13px/1.5 system-ui,-apple-system,Segoe UI,Tahoma,sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.25)');
    var text = doc.createElement('span');
    text.textContent = fa ? 'پوسته‌ی پرتال برای این نشست خاموش است.' : 'Portal theme is off for this browser session.';
    var on = doc.createElement('a');
    on.href = win.location.pathname + '?portalTheme=on';
    on.textContent = fa ? 'روشن کردن' : 'Turn on';
    on.setAttribute('style', 'color:#fff;font-weight:700;text-decoration:underline;text-underline-offset:3px');
    var close = doc.createElement('button');
    close.type = 'button';
    close.setAttribute('aria-label', fa ? 'بستن' : 'Dismiss');
    close.textContent = '×';
    close.setAttribute('style', 'min-width:32px;min-height:32px;border:0;border-radius:6px;background:transparent;color:#fff;font-size:18px;cursor:pointer');
    close.addEventListener('click', function () { box.parentNode.removeChild(box); });
    box.appendChild(text);
    box.appendChild(on);
    box.appendChild(close);
    doc.body.appendChild(box);
  }

  function claim() {
    try {
      if (win.WRM && win.WRM.data && typeof win.WRM.data.claim === 'function') { return win.WRM.data.claim(DATA_KEY) || {}; }
    } catch (e) { /* no data: defaults */ }
    return {};
  }

  var data = claim();
  var docConfig = data.config || null;
  // Preview of the admin's unsaved settings (Settings → "Preview on portal"). It stays on for this
  // browser tab while the admin clicks around; ?portalTheme=on (or closing the tab) ends it.
  var preview = false;
  var previewMissing = false;
  try {
    if (mode === 'preview') { win.sessionStorage.setItem('portalTheme.previewing', '1'); }
    if (mode === 'on') { win.sessionStorage.removeItem('portalTheme.previewing'); }
    if (mode === 'preview' || win.sessionStorage.getItem('portalTheme.previewing') === '1') {
      var draft = win.localStorage.getItem('portalTheme.preview');
      if (draft) { docConfig = JSON.parse(draft).config || docConfig; preview = true; } else { previewMissing = true; }
    }
  } catch (e) { /* storage blocked: normal theme */ }
  if (docConfig && docConfig.enabled === false && !preview) { return; }

  // ------------------------------------------------------------------ state

  var state = {
    page: PT.compat.page(win.location.pathname),
    path: win.location.pathname,
    portalId: PT.compat.portalId(win.location.pathname),
    settings: null,
    settingsKey: '',
    observer: null,
    original: { dir: html.getAttribute('dir'), lang: html.getAttribute('lang') },
    jiraLang: (html.getAttribute('lang') || 'en').toLowerCase()
  };
  var assets = data.assets || {};
  var viewer = data.viewer || { authenticated: false, jiraAccess: false, admin: false };

  function reducedMotionPreferred() {
    try { return win.matchMedia && win.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; }
  }

  function computeSettings() {
    return PT.presets.effective(docConfig, state.portalId);
  }

  function styleTag(id, css) {
    var el = doc.getElementById(id);
    if (!css) { if (el) { el.parentNode.removeChild(el); } return; }
    if (!el) {
      el = doc.createElement('style');
      el.id = id;
      el.className = 'pt-own';
      (doc.head || html).appendChild(el);
    }
    if (el.textContent !== css) { el.textContent = css; }
  }

  function builtinTexts(settings) {
    var lang = U.get(settings, 'locale.language', 'fa');
    // Only translate when Jira itself shows English; a Jira already running in another language
    // keeps its own texts (admin overrides still apply).
    if (!/^en/.test(state.jiraLang)) { return null; }
    return PT.i18n && PT.i18n[lang] ? PT.i18n[lang] : null;
  }

  /** Admin text fields also replace the matching Jira texts wherever they appear. */
  function textMappings(settings) {
    var t = settings.texts || {};
    var map = {};
    function to(v, keys) { if (v) { for (var i = 0; i < keys.length; i++) { map[keys[i]] = v; } } }
    to(t.portalsHeading, ['Service projects', 'Portals', 'All portals', 'Help Center portals']);
    to(t.requestTypesHeading, ['Contact us about', 'What do you need?']);
    to(t.searchPlaceholder, ['Find help and services', 'Search for help or services', 'Search for help']);
    to(t.emptyRequestsTitle, ['No requests were found.', 'No requests found', 'No requests found.', 'We couldn\'t find any requests.',
      'You have no requests.', 'You don\'t have any requests yet.']);
    to(t.emptySearchTitle, ['No results found', 'No results found.', 'No results', 'We couldn\'t find anything matching your search.',
      'No matching search results', 'No matching results', 'No search results', 'We couldn\'t find any results']);
    to(t.emptySearchBody, ['Try again with a different term.', 'Try searching for something else',
      'Browse the list of portals below to raise a request', 'Try a different search term', 'Try a different search term.']);
    to(t.createSuccess, ['Your request has been created.', 'Your request was created', 'Request created']);
    to(t.loginSubtitle ? PT.enhance.fill(t.loginSubtitle, settings) : '', ['Log in to continue', 'Enter your username and password']);
    to(t.loginTitle ? PT.enhance.fill(t.loginTitle, settings) : '', ['Log in to the Help Center']);
    return map;
  }

  function applySettings(settings) {
    var key = JSON.stringify(settings);
    if (key === state.settingsKey) { return false; }
    state.settingsKey = key;
    state.settings = settings;

    var loc = settings.locale || {};
    var dir = loc.direction === 'ltr' ? 'ltr' : 'rtl';
    var lang = loc.language === 'en' ? 'en' : 'fa';
    html.setAttribute('dir', dir);
    html.setAttribute('lang', lang);
    state.lang = lang;

    var f = settings.features || {};
    toggle('pt-hide-jira-brand', f.hideJiraBranding !== false);
    toggle('pt-hide-admin', !!f.hideAdminTools);
    ['tinted', 'original', 'mono'].forEach(function (s) { toggle('pt-icons-' + s, (f.iconStyle || 'tinted') === s); });
    var motion = U.get(settings, 'motion.level', 'full');
    toggle('pt-motion', motion !== 'off' && !reducedMotionPreferred());
    toggle('pt-motion-reduced', motion === 'reduced');
    toggle('pt-compact', U.get(settings, 'shape.density', 'comfortable') === 'compact');
    toggle('pt-card-' + (U.get(settings, 'shape.cardStyle', 'elevated')), true);
    html.setAttribute('data-pt-hero', U.get(settings, 'appearance.heroStyle', 'tinted'));
    html.setAttribute('data-pt-hero-align', U.get(settings, 'layout.heroAlign', 'center'));
    toggle('pt-status-title', U.get(settings, 'layout.statusInTitle', true) !== false);
    toggle('pt-mobile-cards', f.mobileCards !== false);
    toggle('pt-loading-bar', f.loadingBar !== false);

    styleTag('pt-tokens', PT.tokens.css(settings));
    var custom = typeof settings.customCss === 'string' ? settings.customCss.replace(/<\/?style/gi, '') : '';
    styleTag('pt-custom', custom ? '/* Portal Theme — custom CSS (advanced) */\n' + custom : '');

    var mapped = U.merge({}, settings, { dictionary: U.merge(textMappings(settings), settings.dictionary || {}) });
    PT.text.configure(mapped, builtinTexts(settings));
    return true;
  }

  function toggle(cls, on) { html.classList[on ? 'add' : 'remove'](cls); }

  // Set the <html> state as early as possible (this script may run in <head>), so the first
  // paint already uses the theme and no English/unstyled flash is visible.
  try {
    html.classList.add('pt', 'pt-loading', 'pt-waiting');
    html.setAttribute('data-pt-page', state.page);
    applySettings(computeSettings());
  } catch (e) {
    html.classList.remove('pt', 'pt-loading');
    return;
  }

  // ------------------------------------------------------------------ DOM work

  function headerIsDark() {
    var c = U.get(state.settings, 'colors.header', '#ffffff');
    if (U.get(state.settings, 'appearance.mode', 'light') === 'dark') { return true; }
    return PT.color.isDark(PT.color.normalize(c, '#ffffff'));
  }

  function processSubtree(node) {
    if (node.nodeType === 1) {
      if (node.classList && node.classList.contains('pt-own')) { return; }
      PT.compat.tag(node);
    }
    PT.text.apply(node);
  }

  var enhanceQueued = false;
  function queueEnhance() {
    if (enhanceQueued) { return; }
    enhanceQueued = true;
    var run = function () {
      enhanceQueued = false;
      try {
        PT.compat.refreshState();
        PT.enhance.run(null);
        if (observer) { observer.takeRecords(); } // our own changes need no processing
        maybeReveal();
      } catch (e) { failOpen(e); }
    };
    // requestAnimationFrame is paused in background tabs; a timeout keeps the page consistent.
    if (win.requestAnimationFrame && !doc.hidden) { win.requestAnimationFrame(run); } else { win.setTimeout(run, 16); }
  }

  function routeChanged() {
    if (win.location.pathname === state.path) { return; }
    state.path = win.location.pathname;
    var page = PT.compat.page(state.path);
    var portalId = PT.compat.portalId(state.path);
    var portalChanged = portalId !== state.portalId;
    state.page = page;
    state.portalId = portalId;
    html.setAttribute('data-pt-page', page);
    html.setAttribute('data-pt-swap', html.getAttribute('data-pt-swap') === 'a' ? 'b' : 'a');
    PT.enhance.setPage(page);
    if (portalChanged && docConfig && docConfig.portals && Object.keys(docConfig.portals).length) {
      if (applySettings(computeSettings())) {
        PT.enhance.teardown();
        startEnhance();
        processSubtree(doc.body);
      }
    }
  }

  /** JSM's own "Customize" mode needs the native portal: the theme steps aside until reload. */
  function customizing() {
    var panel = doc.querySelector('.cv-help-center-branding-sidepanel, [data-pt~="customize-panel"]');
    return !!(panel && panel.children.length);
  }

  var customizePaused = false;
  function stepAsideForCustomize() {
    if (customizePaused) { return; }
    customizePaused = true;
    visualOff();
    var note = doc.createElement('div');
    note.className = 'pt-customize-note';
    note.setAttribute('role', 'status');
    note.setAttribute('style', 'position:fixed;z-index:2147483000;top:12px;left:50%;transform:translateX(-50%);padding:8px 14px;' +
      'border-radius:999px;background:#1f2937;color:#fff;font:600 13px/1.5 system-ui,Tahoma,sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.25)');
    note.textContent = /^fa/.test(state.original.lang || state.lang || '') || state.lang === 'fa'
      ? 'پوسته‌ی پرتال در حالت سفارشی‌سازی جیرا موقتاً خاموش است. پس از پایان، صفحه را دوباره بارگذاری کنید.'
      : 'The portal theme is paused while you customise the portal. Reload the page when you are done.';
    doc.body.appendChild(note);
    win.setTimeout(function () { if (note.parentNode) { note.parentNode.removeChild(note); } }, 7000);
  }

  var observer = null;
  function onMutations(records) {
    try {
      if (!customizePaused && customizing()) { stepAsideForCustomize(); }
      if (customizePaused) {
        // Customize mode: only the language layer keeps working.
        for (var c = 0; c < records.length; c++) {
          for (var a = 0; a < records[c].addedNodes.length; a++) { PT.text.apply(records[c].addedNodes[a]); }
          if (records[c].type !== 'childList') { PT.text.apply(records[c].target); }
        }
        observer.takeRecords();
        return;
      }
      routeChanged();
      for (var i = 0; i < records.length; i++) {
        var r = records[i];
        if (r.type === 'childList') {
          for (var j = 0; j < r.addedNodes.length; j++) {
            var n = r.addedNodes[j];
            if (n.nodeType === 1 || n.nodeType === 3) { processSubtree(n); }
          }
        } else if (r.type === 'characterData') {
          PT.text.apply(r.target);
        } else if (r.type === 'attributes') {
          PT.text.applyAttributes(r.target);
        }
      }
      observer.takeRecords(); // records caused by our own synchronous changes above
      queueEnhance();
    } catch (e) { failOpen(e); }
  }

  function startEnhance() {
    PT.enhance.setup({
      settings: state.settings,
      assets: assets,
      viewer: viewer,
      page: state.page,
      lang: state.lang,
      tokens: { headerIsDark: headerIsDark() }
    });
  }

  function reveal() {
    html.classList.remove('pt-loading');
    html.classList.add('pt-ready');
  }

  var READY_ROLES = '[data-pt~="portal-card"],[data-pt~="rt-card"],[data-pt~="form-card"],[data-pt~="activity"],' +
    '[data-pt~="table-wrap"],[data-pt~="empty"],[data-pt~="login-form"],[data-pt~="profile-row"],[data-pt~="hero-title"],' +
    '[data-pt~="list-toolbar"],[data-pt~="request-panel"],[data-pt~="title"],[data-pt~="field"]';
  function maybeReveal() {
    var ready = doc.querySelector(READY_ROLES);
    if (ready) { html.classList.remove('pt-waiting'); }
    if (html.classList.contains('pt-loading') && ready) { reveal(); }
  }

  function failOpen(e) {
    try { if (win.console && console.warn) { console.warn('[Portal Theme] disabled on this page:', e); } } catch (x) { /* ignore */ }
    off();
  }

  /** Removes the visual layer (styles, classes, added elements) but keeps the page language. */
  function visualOff() {
    try { PT.enhance.teardown(); } catch (e) { /* ignore */ }
    ['pt-tokens', 'pt-custom'].forEach(function (id) { var el = doc.getElementById(id); if (el) { el.parentNode.removeChild(el); } });
    Array.prototype.slice.call(html.classList).filter(function (c) { return c === 'pt' || c.indexOf('pt-') === 0; })
      .forEach(function (c) { html.classList.remove(c); });
  }

  /** Switches the theme off at runtime (also used by fail-open). Texts need a reload to restore. */
  function off() {
    if (observer) { observer.disconnect(); observer = null; }
    try { PT.enhance.teardown(); } catch (e) { /* ignore */ }
    ['pt-tokens', 'pt-custom'].forEach(function (id) { var el = doc.getElementById(id); if (el) { el.parentNode.removeChild(el); } });
    var classes = Array.prototype.slice.call(html.classList).filter(function (c) { return c === 'pt' || c.indexOf('pt-') === 0; });
    classes.forEach(function (c) { html.classList.remove(c); });
    if (state.original.dir === null) { html.removeAttribute('dir'); } else { html.setAttribute('dir', state.original.dir); }
    if (state.original.lang === null) { html.removeAttribute('lang'); } else { html.setAttribute('lang', state.original.lang); }
  }

  function start() {
    try {
      PT.compat.init(data.jiraVersion);
      html.setAttribute('data-pt-adapter', PT.compat.adapter());
      startEnhance();
      if (PT.date && U.get(state.settings, 'locale.jalali', true) !== false && state.lang === 'fa') { PT.date.watchInputs(); }
      processSubtree(doc.body);
      PT.compat.refreshState();
      PT.enhance.run(null);
      maybeReveal();
      win.setTimeout(reveal, 700); // never keep content hidden for long
      win.setTimeout(function () { html.classList.remove('pt-waiting'); }, 20000);
      observer = new MutationObserver(onMutations);
      var opts = { childList: true, subtree: true };
      if (PT.text.isActive()) {
        opts.characterData = true;
        opts.attributes = true;
        opts.attributeFilter = PT.text.ATTRS;
      }
      observer.observe(doc.body, opts);
      if (preview || previewMissing) { previewPill(); }
    } catch (e) { failOpen(e); }
  }

  function previewPill() {
    var el = doc.createElement('div');
    el.className = 'pt-own pt-preview-pill';
    el.setAttribute('role', 'status');
    var fa = state.lang === 'fa';
    var label = doc.createElement('span');
    label.textContent = previewMissing
      ? (fa ? 'پیش‌نمایشی پیدا نشد؛ در صفحه‌ی تنظیمات دکمه‌ی «پیش‌نمایش در پرتال» را بزنید.' : 'No preview found — use “Preview on portal” in the settings page.')
      : (fa ? 'پیش‌نمایش تنظیمات ذخیره‌نشده' : 'Previewing unsaved theme settings');
    var end = doc.createElement('a');
    end.href = win.location.pathname + '?portalTheme=on';
    end.textContent = fa ? 'پایان پیش‌نمایش' : 'End preview';
    el.appendChild(label);
    el.appendChild(end);
    doc.body.appendChild(el);
  }

  // Coming back through the browser cache must not leave the page hidden.
  win.addEventListener('pageshow', function () { if (html.classList.contains('pt')) { maybeReveal(); } });

  PT.runtime = {
    off: off,
    settings: function () { return state.settings; },
    page: function () { return state.page; },
    retag: function () { processSubtree(doc.body); PT.enhance.run(null); }
  };

  U.onReady(start);
})(window, document);
