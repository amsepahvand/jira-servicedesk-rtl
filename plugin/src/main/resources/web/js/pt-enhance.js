/*!
 * Parsira — additive page enhancements: brand, "Back to Jira", footer, hero texts, favicon,
 * mobile table labels, status categories, text direction of user content.
 *
 * Principle: add, never rebuild. Jira's own controls stay the controls (same elements, same
 * listeners, same ARIA). Everything this file creates carries class "pt-own" and is removed by
 * PT.enhance.teardown(), so switching the theme off at runtime restores the page.
 */
(function (PT) {
  'use strict';

  var U = PT.util;
  var ctx = null;   // { settings, assets, viewer, tokens:{headerIsDark}, page, lang }
  var originals = []; // [element, original innerHTML] of Jira elements we re-filled

  function assetUrl(slot) {
    var v = ctx.assets && ctx.assets[slot];
    return v ? U.contextPath() + '/plugins/servlet/portal-theme/asset/' + slot + '?v=' + encodeURIComponent(v) : '';
  }

  function company(settings) { return U.get(settings || (ctx && ctx.settings), 'identity.companyName', ''); }

  /** Fills {company} and {year}; usable before setup() by passing the settings. */
  function fill(template, settings) {
    var s = settings || (ctx && ctx.settings) || {};
    return String(template || '')
      .replace(/\{company\}/g, company(s))
      .replace(/\{year\}/g, year(s));
  }

  function year(settings) {
    var fa = U.get(settings || (ctx && ctx.settings), 'locale.language', 'fa') === 'fa';
    try {
      if (fa) {
        return new Intl.DateTimeFormat('fa-IR-u-ca-persian', { year: 'numeric' }).format(new Date()).replace(/[^۰-۹0-9]/g, '');
      }
    } catch (e) { /* fall through */ }
    var y = new Date().getFullYear();
    return fa ? U.toPersianDigits(String(y - 621)) : String(y);
  }

  // ------------------------------------------------------------------ brand

  var ICONS = {
    back: '<svg class="pt-icon pt-flip-rtl" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M15 6l-6 6 6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    grid: '<svg class="pt-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>',
    mail: '<svg class="pt-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 6h16v12H4z M4 7l8 6 8-6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>',
    phone: '<svg class="pt-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M6.6 3.5l2.6 3.4-1.7 2.1a12 12 0 0 0 7.5 7.5l2.1-1.7 3.4 2.6-1.3 3.1a2 2 0 0 1-2 1.2A17 17 0 0 1 2.3 6.8a2 2 0 0 1 1.2-2z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>',
    clock: '<svg class="pt-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 7.5V12l3 2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>'
  };

  function logoHtml(onDark) {
    var name = U.escapeHtml(company());
    var alt = U.escapeHtml(U.get(ctx.settings, 'identity.logoAlt', company()));
    var light = assetUrl('logo');
    var dark = assetUrl('logoDark');
    var showName = U.get(ctx.settings, 'identity.showName', true) !== false;
    var img = '';
    var src = onDark && dark ? dark : light || dark;
    if (src) {
      var auto = U.get(ctx.settings, 'appearance.mode', 'light') === 'auto' && dark && light && !onDark;
      img = (auto ? '<picture class="pt-logo-wrap"><source media="(prefers-color-scheme: dark)" srcset="' + U.escapeHtml(dark) + '">' : '') +
        '<img class="pt-logo" src="' + U.escapeHtml(src) + '" alt="' + (showName ? '' : alt) + '" decoding="async">' +
        (auto ? '</picture>' : '');
    } else {
      var initial = company().replace(/^\s+/, '').charAt(0) || '•';
      img = '<span class="pt-mark" aria-hidden="true">' + U.escapeHtml(initial) + '</span>';
      showName = true;
    }
    return img + (showName && name ? '<span class="pt-brand-name">' + name + '</span>' : '');
  }

  function brand() {
    var link = document.querySelector('[data-pt~="brand-link"]');
    if (link && link.getAttribute('data-pt-branded') !== sig()) {
      if (!link.hasAttribute('data-pt-branded')) { originals.push([link, link.innerHTML]); }
      link.setAttribute('data-pt-branded', sig());
      link.classList.add('pt-brand');
      var sub = U.get(ctx.settings, 'identity.portalTitle', '');
      link.innerHTML = logoHtml(ctx.tokens.headerIsDark) +
        (sub ? '<span class="pt-brand-sub">' + U.escapeHtml(sub) + '</span>' : '');
      if (!link.getAttribute('aria-label')) { link.setAttribute('aria-label', company()); }
    }
    // Pages without the portal header (login, sign-up): our own minimal top bar.
    var needBar = ctx.page === 'login' && !document.querySelector('#header [data-pt~="brand-link"]');
    var bar = document.getElementById('pt-topbar');
    if (needBar && !bar && document.body) {
      bar = document.createElement('header');
      bar.id = 'pt-topbar';
      bar.className = 'pt-own pt-topbar';
      bar.innerHTML = '<div class="pt-topbar-inner"><a class="pt-brand" href="' +
        U.escapeHtml(U.contextPath() + PT.compat.PORTAL_PREFIX + 'portals') + '">' + logoHtml(ctx.tokens.headerIsDark) + '</a></div>';
      var host = document.getElementById('page') || document.body;
      host.insertBefore(bar, host.firstChild);
    } else if (!needBar && bar) {
      bar.parentNode.removeChild(bar);
    }
  }

  function sig() {
    return (ctx.assets.logo || '') + '|' + (ctx.assets.logoDark || '') + '|' + company() + '|' + U.get(ctx.settings, 'identity.portalTitle', '');
  }

  // ------------------------------------------------------------------ Back to Jira

  function backToJira() {
    var cfg = ctx.settings.backToJira || {};
    var existing = document.getElementById('pt-back-jira');
    var allowed = cfg.enabled && ctx.viewer.authenticated &&
      (cfg.audience === 'authenticated' || ctx.viewer.jiraAccess) && ctx.page !== 'login';
    var host = document.querySelector('[data-pt~="header-actions"]');
    if (!allowed || !host) {
      if (existing) { existing.parentNode.removeChild(existing); }
      return;
    }
    if (existing && existing.parentNode === host) { return; }
    var href = U.absolute(cfg.url || '/secure/Dashboard.jspa') || U.contextPath() + '/secure/Dashboard.jspa';
    var a = document.createElement('a');
    a.id = 'pt-back-jira';
    a.className = 'pt-own pt-back-jira';
    a.href = href;
    if (cfg.newTab) { a.target = '_blank'; a.rel = 'noopener'; }
    var label = U.escapeHtml(cfg.label || 'Jira');
    a.innerHTML = (cfg.showIcon !== false ? ICONS.grid : '') + '<span class="pt-back-jira-label">' + label + '</span>' +
      (cfg.newTab ? '<span class="pt-sr-only"> (' + (ctx.lang === 'fa' ? 'در زبانه‌ی جدید' : 'opens in a new tab') + ')</span>' : '');
    host.insertBefore(a, host.firstChild);
  }

  // ------------------------------------------------------------------ footer

  function footer() {
    var cfg = ctx.settings.footer || {};
    var el = document.getElementById('pt-footer');
    if (cfg.enabled === false) {
      if (el) { el.parentNode.removeChild(el); }
      return;
    }
    if (el || !document.body) { return; }
    var t = ctx.settings.texts || {};
    var links = (Array.isArray(cfg.links) ? cfg.links : []).map(function (l) {
      var href = U.absolute(l && l.url);
      return href && l.label ? '<li><a href="' + U.escapeHtml(href) + '">' + U.escapeHtml(l.label) + '</a></li>' : '';
    }).join('');
    var support = '';
    if (t.supportEmail) {
      support += '<li>' + ICONS.mail + '<a dir="ltr" href="mailto:' + U.escapeHtml(t.supportEmail) + '">' + U.escapeHtml(t.supportEmail) + '</a></li>';
    }
    if (t.supportPhone) {
      support += '<li>' + ICONS.phone + '<a dir="ltr" href="tel:' + U.escapeHtml(String(t.supportPhone).replace(/[^+0-9]/g, '')) + '">' +
        U.escapeHtml(t.supportPhone) + '</a></li>';
    }
    if (t.supportHours) { support += '<li>' + ICONS.clock + '<span>' + U.escapeHtml(t.supportHours) + '</span></li>'; }
    var supportBlock = support || t.supportText ?
      '<section class="pt-footer-support" aria-labelledby="pt-footer-support-title"><h2 id="pt-footer-support-title">' +
      U.escapeHtml(t.supportTitle || '') + '</h2>' + (t.supportText ? '<p>' + U.escapeHtml(t.supportText) + '</p>' : '') +
      (support ? '<ul>' + support + '</ul>' : '') + '</section>' : '';

    el = document.createElement('footer');
    el.id = 'pt-footer';
    el.className = 'pt-own pt-footer';
    el.innerHTML = '<div class="pt-footer-inner">' +
      '<div class="pt-footer-brand"><span class="pt-brand pt-brand--footer">' + logoHtml(false) + '</span>' +
      (t.footerText ? '<p>' + U.escapeHtml(fill(t.footerText)) + '</p>' : '') + '</div>' +
      (links ? '<nav class="pt-footer-links" aria-label="' + (ctx.lang === 'fa' ? 'پیوندهای پایین صفحه' : 'Footer') + '"><ul>' + links + '</ul></nav>' : '') +
      supportBlock +
      '<div class="pt-footer-bottom">' +
      (t.copyright ? '<p class="pt-copyright">' + U.escapeHtml(fill(t.copyright)) + '</p>' : '') + '</div>' +
      '</div>';
    (document.getElementById('page') || document.body).appendChild(el);
  }

  // ------------------------------------------------------------------ hero

  var DEFAULT_TITLES = /^(Welcome to the Help Center|Welcome to the help center|Help Center|خوش آمدید|What can we help you with\?|چطور می‌توانیم کمکتان کنیم؟)$/;

  function setText(el, text) {
    // Change the existing text node only; React keeps a reference to it.
    if (!el || !text) { return; }
    var n = el.firstChild;
    if (n && n.nodeType === 3 && el.childNodes.length === 1 && n.nodeValue !== text) { n.nodeValue = text; }
  }

  function hero() {
    var t = ctx.settings.texts || {};
    if (ctx.page === 'home') {
      var h1 = document.querySelector('[data-pt~="hero-title"]');
      if (h1 && DEFAULT_TITLES.test(h1.textContent.replace(/\s+/g, ' ').trim()) || (h1 && h1.textContent.trim() === company())) {
        setText(h1, fill(t.homeTitle));
      }
      var heroBox = document.querySelector('[data-pt~="hero"]');
      if (heroBox && t.homeSubtitle && !heroBox.querySelector('.pt-hero-sub')) {
        var hasDesc = heroBox.querySelector('[data-pt~="hero-text"]');
        if (!hasDesc || !hasDesc.textContent.trim()) {
          var p = document.createElement('p');
          p.className = 'pt-own pt-hero-sub';
          p.textContent = fill(t.homeSubtitle);
          heroBox.appendChild(p);
        }
      }
    }
    quickLinks();
    heroBand();
    var input = document.querySelector('[data-pt~="search-input"]');
    if (input && t.searchPlaceholder && input.getAttribute('placeholder') !== t.searchPlaceholder) {
      input.setAttribute('placeholder', t.searchPlaceholder);
    }
  }

  var QUICK_ICONS = {
    requests: '<svg class="pt-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M5 4h14v16H5zM9 9h6M9 13h6M9 17h3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    approvals: '<svg class="pt-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M20 6 9 17l-5-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    link: '<svg class="pt-icon pt-flip-rtl" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>'
  };

  /** Shortcut chips under the home search, for logged-in customers. */
  function quickLinks() {
    var existing = document.getElementById('pt-quick');
    var L = ctx.settings.layout || {};
    var box = document.querySelector('[data-pt~="search"]');
    var items = Array.isArray(L.quickLinkItems) ? L.quickLinkItems : [];
    if (ctx.page !== 'home' || L.quickLinks === false || !ctx.viewer.authenticated || !box || !items.length) {
      if (existing) { existing.parentNode.removeChild(existing); }
      return;
    }
    if (existing && existing.parentNode === box) { return; }
    var html = items.map(function (it) {
      var href = U.absolute(it && it.url);
      if (!href || !it.label) { return ''; }
      var icon = /requests/.test(href) ? QUICK_ICONS.requests : /approvals/.test(href) ? QUICK_ICONS.approvals : QUICK_ICONS.link;
      return '<li><a href="' + U.escapeHtml(href) + '">' + icon + '<span>' + U.escapeHtml(it.label) + '</span></a></li>';
    }).join('');
    if (!html) { return; }
    var ul = document.createElement('ul');
    ul.id = 'pt-quick';
    ul.className = 'pt-own pt-quick';
    ul.setAttribute('aria-label', ctx.lang === 'fa' ? 'دسترسی سریع' : 'Quick links');
    ul.innerHTML = html;
    box.appendChild(ul);
  }

  /** Uploaded background image behind the header area of the home and portal pages. */
  function heroBand() {
    var band = document.getElementById('pt-hero-band');
    var want = U.get(ctx.settings, 'appearance.heroStyle', 'tinted') === 'image' && assetUrl('background') &&
      (ctx.page === 'home' || ctx.page === 'portal');
    if (!want) {
      if (band) { band.parentNode.removeChild(band); }
      return;
    }
    var host = document.querySelector('[data-pt~="page"]');
    if (!host || (band && band.parentNode === host)) { return; }
    band = document.createElement('div');
    band.id = 'pt-hero-band';
    band.className = 'pt-own pt-hero-band';
    band.setAttribute('aria-hidden', 'true');
    band.style.backgroundImage = 'url("' + assetUrl('background').replace(/"/g, '%22') + '")';
    band.style.backgroundPosition = 'center ' + ({ top: 'top', bottom: 'bottom' }[U.get(ctx.settings, 'appearance.heroImagePosition', 'center')] || 'center');
    host.insertBefore(band, host.firstChild);
  }

  // ------------------------------------------------------------------ document title & favicon

  function pageTitle() {
    if (U.get(ctx.settings, 'features.pageTitle', true) === false) { return; }
    var name = company();
    if (!name) { return; }
    var h = document.querySelector('[data-pt~="title"], [data-pt~="hero-title"], #login-header h1');
    var text = h ? h.textContent.replace(/\s+/g, ' ').trim() : '';
    var want = ctx.page === 'home' || ctx.page === 'login' || !text || text === name ? name : text + ' | ' + name;
    if (document.title !== want) { document.title = want; }
  }

  function favicon() {
    if (U.get(ctx.settings, 'features.favicon', true) === false || document.getElementById('pt-favicon')) { return; }
    var url = assetUrl('favicon');
    if (!url) { return; }
    var old = document.querySelectorAll('link[rel~="icon"], link[rel="shortcut icon"]');
    for (var i = 0; i < old.length; i++) {
      old[i].setAttribute('data-pt-original-rel', old[i].getAttribute('rel'));
      old[i].setAttribute('rel', 'pt-disabled-icon');
    }
    var l = document.createElement('link');
    l.id = 'pt-favicon';
    l.className = 'pt-own';
    l.rel = 'icon';
    l.href = url;
    document.head.appendChild(l);
  }

  // ------------------------------------------------------------------ lists & statuses

  /** Copies column names to cells so rows can become labelled cards on phones. */
  function tableLabels(scope) {
    var tables = (scope || document).querySelectorAll('[data-pt~="table"]');
    for (var t = 0; t < tables.length; t++) {
      var ths = tables[t].querySelectorAll('thead th');
      if (!ths.length) { continue; }
      var names = [];
      for (var i = 0; i < ths.length; i++) { names.push(ths[i].textContent.replace(/\s+/g, ' ').trim()); }
      var rows = tables[t].querySelectorAll('tbody tr');
      for (var r = 0; r < rows.length; r++) {
        var cells = rows[r].children;
        for (var c = 0; c < cells.length; c++) {
          if (names[c] !== undefined && cells[c].getAttribute('data-pt-label') !== names[c]) {
            cells[c].setAttribute('data-pt-label', names[c]);
          }
        }
      }
    }
  }

  /**
   * Semantic category of a status name. Order matters: "approved" is done, not "approval";
   * "waiting for approval" is approval, not generic waiting. Persian names typed by admins are
   * matched too (ي/ك and half-spaces normalised). Unknown names return null, so the caller falls
   * back to the category Jira itself exposes — a status is never guessed from nothing.
   */
  var STATUS_RULES = [
    ['done', /^(done|resolved|closed|completed|complete|approved|fixed|delivered)$|انجام ?شد|انجام ?شده|حل ?شد|حل ?شده|بسته ?شد|^بسته$|تکمیل ?شد|خاتمه|تایید ?شد|تایید ?شده|پایان ?یافت/],
    ['rejected', /declin|reject|denied|^رد$|رد ?شد|رد ?شده|عدم ?تایید|نامنظور/],
    ['cancelled', /cancel|withdrawn|won'?t do|obsolete|لغو|انصراف|منصرف|ابطال/],
    ['error', /fail|error|broken|خطا|ناموفق|شکست/],
    ['approval', /approv|\bcab\b|تایید|منتظر ?تایید|بررسی ?مدیر/],
    ['waiting', /waiting for (the )?customer|awaiting customer|pending|on hold|انتظار پاسخ|منتظر پاسخ|در انتظار شما|انتظار مشتری|منتظر مشتری|معلق|نیازمند اطلاعات/],
    ['progress', /progress|escalat|review|implement|investigat|working|waiting for support|triage|planning|در حال|ارجاع|بررسی|پیگیری|اجرا|انتظار پشتیبانی|درجریان|شروع/],
    ['new', /^(open|new|to do|todo|backlog|reopened|submitted)$|^باز$|^جدید$|در صف|ثبت ?شده|باز ?شده/]
  ];
  function statusCategory(text) {
    var t = String(text || '').toLowerCase().replace(/[يى]/g, 'ی').replace(/ك/g, 'ک').replace(/أ/g, 'ا')
      .replace(/[‌‏‎]/g, ' ').replace(/\s+/g, ' ').trim();
    if (!t) { return null; }
    for (var i = 0; i < STATUS_RULES.length; i++) {
      if (STATUS_RULES[i][1].test(t)) { return STATUS_RULES[i][0]; }
    }
    return null;
  }

  /** Category from Jira's own lozenge classes (JSM maps its status categories onto these). */
  function lozengeCategory(cls) {
    return /aui-lozenge-success/.test(cls) ? 'done'
      : /aui-lozenge-(current|inprogress)/.test(cls) ? 'progress'
        : /aui-lozenge-(error|removed)/.test(cls) ? 'error'
          : /aui-lozenge-(new|moved|default)/.test(cls) ? 'new' : null;
  }

  function statuses(scope) {
    if (U.get(ctx.settings, 'features.statusColors', true) === false) { return; }
    var root = scope || document;
    var loz = root.querySelectorAll('.aui-lozenge');
    for (var i = 0; i < loz.length; i++) {
      var el = loz[i];
      var text = el.textContent;
      if (el.getAttribute('data-pt-status-text') === text) { continue; }
      el.setAttribute('data-pt-status-text', text);
      // The "Latest" marker in the activity list is not a status.
      var isMarker = !!(el.closest && el.closest('[data-pt~="activity-item"] header'));
      var cat = isMarker ? 'marker' : (statusCategory(text) || lozengeCategory(el.className) || 'neutral');
      el.setAttribute('data-pt-status', cat);
    }
    // React table status (no category in the DOM): the only child span of a status cell.
    var cells = root.querySelectorAll('[data-pt~="table"] td');
    for (var j = 0; j < cells.length; j++) {
      var cell = cells[j];
      var inner = cell.children.length === 1 && cell.firstElementChild.tagName === 'SPAN' ? cell.firstElementChild : null;
      if (!inner || inner.children.length !== 1 || inner.firstElementChild.tagName !== 'SPAN' || inner.querySelector('a, img, .aui-lozenge')) { continue; }
      var catT = statusCategory(inner.textContent) || 'neutral';
      if (inner.getAttribute('data-pt-status') !== catT) {
        inner.setAttribute('data-pt-status', catT);
        inner.setAttribute('data-pt', (inner.getAttribute('data-pt') || '').replace(/\bstatus-pill\b/, '').trim() + ' status-pill');
      }
    }
  }

  // ------------------------------------------------------------------ direction of mixed content

  function directions(scope) {
    var root = scope || document;
    var list = root.querySelectorAll('[data-pt~="user-content"]:not([dir]), [data-pt~="authored"]:not([dir]):not(label):not(legend)');
    for (var i = 0; i < list.length; i++) { list[i].setAttribute('dir', 'auto'); }
    var ltr = root.querySelectorAll('[data-pt~="ltr-token"]:not([dir])');
    for (var j = 0; j < ltr.length; j++) { ltr[j].setAttribute('dir', 'ltr'); }
  }

  /** Empty states have no stable class: recognise them by their (translated) heading text. */
  function emptyStates() {
    var t = ctx.settings.texts || {};
    var titles = [t.emptyRequestsTitle, t.emptySearchTitle, 'No requests were found.', 'No requests found', 'No results found']
      .filter(Boolean).map(function (x) { return String(x).replace(/\s+/g, ' ').trim(); });
    var heads = document.querySelectorAll('[data-pt~="main"] :is(h2, h3, h4):not([data-pt-empty])');
    for (var i = 0; i < heads.length; i++) {
      heads[i].setAttribute('data-pt-empty', '0');
      if (titles.indexOf(heads[i].textContent.replace(/\s+/g, ' ').trim()) >= 0 && heads[i].parentElement) {
        heads[i].setAttribute('data-pt-empty', '1');
        var box = heads[i].parentElement;
        var cur = box.getAttribute('data-pt') || '';
        if ((' ' + cur + ' ').indexOf(' empty ') < 0) { box.setAttribute('data-pt', (cur + ' empty').trim()); }
      }
    }
  }

  /** Whole request-type tile is clickable (the title link stays the real, focusable control). */
  function onTileClick(e) {
    if (ctx && U.get(ctx.settings, 'features.tileClick', true) === false) { return; }
    var tile = e.target.closest && e.target.closest('[data-pt~="rt-card"]');
    if (!tile || e.target.closest('a, button, input, label, select, textarea')) { return; }
    var a = tile.querySelector('a[href]');
    if (a) { a.click(); }
  }

  // ------------------------------------------------------------------ lifecycle

  function setup(context) {
    ctx = context;
    document.addEventListener('click', onTileClick);
  }

  /**
   * Login pages: brand row at the top of the card, and visible labels for the classic JSM form,
   * whose fields only have placeholders (a placeholder disappears while typing).
   */
  function loginPage() {
    if (ctx.page !== 'login') { return; }
    var card = document.querySelector('[data-pt~="login-classic"] #cv-content, [data-pt~="login-card"]');
    if (card && !card.querySelector('.pt-login-brand')) {
      var head = document.createElement('p');
      head.className = 'pt-own pt-login-brand';
      head.innerHTML = logoHtml(false);
      card.insertBefore(head, card.firstChild);
    }
    var fields = document.querySelectorAll('[data-pt~="login-form"] input#os_username, [data-pt~="login-form"] input#os_password');
    for (var i = 0; i < fields.length; i++) {
      var input = fields[i];
      if (document.querySelector('label[for="' + input.id + '"]')) { continue; }
      var label = document.createElement('label');
      label.className = 'pt-own pt-login-label';
      label.setAttribute('for', input.id);
      label.textContent = input.getAttribute('placeholder') || (input.id === 'os_username' ? 'Username' : 'Password');
      input.parentNode.insertBefore(label, input);
      input.setAttribute('autocomplete', input.id === 'os_username' ? 'username' : 'current-password');
      input.setAttribute('placeholder', ''); // the visible label replaces it
    }
  }

  /** In JSM's Customize panel: explain which parts Parsira controls, with a link to its settings. */
  function customizeNote() {
    var form = document.querySelector('[data-pt~="customize-panel"] form, [data-pt~="customize-panel"] .cv-help-center-branding');
    if (!form || form.querySelector('.pt-customize-note')) { return; }
    var fa = ctx.lang === 'fa';
    var note = document.createElement('p');
    note.className = 'pt-own pt-customize-note';
    note.appendChild(document.createTextNode(fa
      ? 'رنگ‌ها، نشان، تصویر سربرگ و متن‌های این پرتال را پارسیرا تعیین می‌کند. اطلاعیه‌ها را می‌توانید همین‌جا بنویسید؛ برای بقیه به '
      : 'Colours, logo, header image and texts of this portal are managed by Parsira. Announcements can be edited here; for everything else open '));
    var a = document.createElement('a');
    a.href = U.contextPath() + '/plugins/servlet/portal-theme/admin';
    a.target = '_blank';
    a.rel = 'noopener';
    a.textContent = fa ? 'تنظیمات پارسیرا' : 'Parsira settings';
    note.appendChild(a);
    note.appendChild(document.createTextNode(fa ? ' بروید.' : '.'));
    form.insertBefore(note, form.firstChild);
  }

  function run(scope) {
    if (!ctx) { return; }
    brand();
    loginPage();
    customizeNote();
    backToJira();
    footer();
    hero();
    pageTitle();
    favicon();
    tableLabels(scope);
    statuses(scope);
    directions(scope);
    emptyStates();
    if (PT.date && U.get(ctx.settings, 'locale.jalali', true) !== false && ctx.lang === 'fa') { PT.date.decorateTimes(scope); }
    if (PT.date && ctx.lang === 'fa') { PT.date.explainGuides(scope); }
  }

  function setPage(page) { if (ctx) { ctx.page = page; } }

  function teardown() {
    document.removeEventListener('click', onTileClick);
    var own = document.querySelectorAll('.pt-own');
    for (var i = 0; i < own.length; i++) { if (own[i].parentNode) { own[i].parentNode.removeChild(own[i]); } }
    var icons = document.querySelectorAll('link[data-pt-original-rel]');
    for (var j = 0; j < icons.length; j++) { icons[j].setAttribute('rel', icons[j].getAttribute('data-pt-original-rel')); }
    for (var k = 0; k < originals.length; k++) {
      originals[k][0].innerHTML = originals[k][1];
      originals[k][0].removeAttribute('data-pt-branded');
      originals[k][0].classList.remove('pt-brand');
    }
    originals = [];
    ctx = null;
  }

  PT.enhance = { setup: setup, run: run, setPage: setPage, teardown: teardown, statusCategory: statusCategory, fill: fill };
})(window.PortalTheme);
