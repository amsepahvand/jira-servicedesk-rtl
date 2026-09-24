/*!
 * Portal Theme — additive page enhancements: brand, "Back to Jira", footer, hero texts, favicon,
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
      link.innerHTML = logoHtml(ctx.tokens.headerIsDark);
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

  function sig() { return (ctx.assets.logo || '') + '|' + (ctx.assets.logoDark || '') + '|' + company(); }

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
      (t.copyright ? '<p class="pt-copyright">' + U.escapeHtml(fill(t.copyright)) + '</p>' : '') +
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
    var input = document.querySelector('[data-pt~="search-input"]');
    if (input && t.searchPlaceholder && input.getAttribute('placeholder') !== t.searchPlaceholder) {
      input.setAttribute('placeholder', t.searchPlaceholder);
    }
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

  var categoryIndex = null;
  function statusCategory(text) {
    if (!categoryIndex) {
      categoryIndex = {};
      var cats = (PT.i18n && PT.i18n.fa && PT.i18n.fa.statusCategories) || {};
      for (var cat in cats) {
        if (U.hasOwn.call(cats, cat)) {
          for (var i = 0; i < cats[cat].length; i++) { categoryIndex[cats[cat][i].toLowerCase()] = cat; }
        }
      }
    }
    return categoryIndex[String(text || '').replace(/\s+/g, ' ').trim().toLowerCase()] || null;
  }

  function statuses(scope) {
    if (U.get(ctx.settings, 'features.statusColors', true) === false) { return; }
    var root = scope || document;
    // AUI lozenges carry their category as a class; map it to our category names.
    var loz = root.querySelectorAll('.aui-lozenge:not([data-pt-status])');
    for (var i = 0; i < loz.length; i++) {
      var cls = loz[i].className;
      var cat = /aui-lozenge-success/.test(cls) ? 'done'
        : /aui-lozenge-(current|inprogress)/.test(cls) ? 'progress'
          : /aui-lozenge-(error|removed)/.test(cls) ? 'error'
            : /aui-lozenge-(new|moved)/.test(cls) ? 'new' : statusCategory(loz[i].textContent) || 'neutral';
      loz[i].setAttribute('data-pt-status', cat);
    }
    // React table status (no category in the DOM): the only child span of a status cell.
    var cells = root.querySelectorAll('[data-pt~="table"] td');
    for (var j = 0; j < cells.length; j++) {
      var cell = cells[j];
      var inner = cell.children.length === 1 && cell.firstElementChild.tagName === 'SPAN' ? cell.firstElementChild : null;
      if (!inner || inner.children.length !== 1 || inner.firstElementChild.tagName !== 'SPAN' || inner.querySelector('a, img')) { continue; }
      var catT = statusCategory(inner.textContent) || 'progress';
      if (inner.getAttribute('data-pt-status') !== catT) {
        inner.setAttribute('data-pt-status', catT);
        inner.setAttribute('data-pt', (inner.getAttribute('data-pt') || '').replace(/\bstatus-pill\b/, '').trim() + ' status-pill');
      }
    }
  }

  // ------------------------------------------------------------------ direction of mixed content

  function directions(scope) {
    var root = scope || document;
    var list = root.querySelectorAll('[data-pt~="user-content"]:not([dir])');
    for (var i = 0; i < list.length; i++) { list[i].setAttribute('dir', 'auto'); }
    var ltr = root.querySelectorAll('[data-pt~="ltr-token"]:not([dir])');
    for (var j = 0; j < ltr.length; j++) { ltr[j].setAttribute('dir', 'ltr'); }
  }

  /** Whole request-type tile is clickable (the title link stays the real, focusable control). */
  function onTileClick(e) {
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

  function run(scope) {
    if (!ctx) { return; }
    brand();
    backToJira();
    footer();
    hero();
    pageTitle();
    favicon();
    tableLabels(scope);
    statuses(scope);
    directions(scope);
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
