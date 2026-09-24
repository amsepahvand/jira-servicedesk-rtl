/*!
 * Portal Theme — Jira/JSM compatibility layer.
 *
 * THE ONLY FILE THAT KNOWS JSM's MARKUP. It maps Jira's (version-specific, partly generated)
 * portal DOM onto stable semantic hooks: data-pt="<role> …" attributes. The stylesheets target
 * only those hooks plus AUI's public component classes (.aui-button, .aui-lozenge, …), never
 * JSM's cv- or vp- prefixed classes. Supporting a new Jira version means adding or adjusting an adapter here.
 *
 * Adapters are chosen by the Jira version reported by the server, with DOM feature detection as
 * a fallback. Selectors prefer ids, ARIA, semantic HTML and long-lived portal classes; data-testid
 * values are used only as fallbacks.
 */
(function (PT) {
  'use strict';

  var PORTAL = '/servicedesk/customer/';

  // ------------------------------------------------------------------ page detection (URL based)

  function pathAfterPrefix(pathname) {
    var i = pathname.indexOf(PORTAL);
    return i < 0 ? null : pathname.slice(i + PORTAL.length);
  }

  /** Page type from the URL — stable across all versions. */
  function page(pathname) {
    var s = pathAfterPrefix(pathname || window.location.pathname);
    if (s === null) { return 'other'; }
    if (/^user\/(login|signup|forgotpassword|resetpassword|password|verify)/.test(s)) { return 'login'; }
    if (/^user\/requests/.test(s)) { return 'requests'; }
    if (/^user\/approvals/.test(s)) { return 'approvals'; }
    if (/^user\/profile/.test(s)) { return 'profile'; }
    if (s === '' || /^portals\/?$/.test(s)) { return 'home'; }
    if (/^portal\/\d+\/create\/\d+/.test(s)) { return 'create'; }
    if (/^portal\/\d+\/[A-Z][A-Z0-9_]*-\d+/.test(s)) { return 'request'; }
    if (/^portal\/\d+(\/group\/\d+)?\/?$/.test(s)) { return 'portal'; }
    if (/(^|\/)(kb|article)\//.test(s)) { return 'article'; }
    return 'other';
  }

  function portalId(pathname) {
    var s = pathAfterPrefix(pathname || window.location.pathname);
    var m = s && /^portal\/(\d+)/.exec(s);
    return m ? m[1] : null;
  }

  // ------------------------------------------------------------------ role maps

  /**
   * Roles shared by every supported generation. Keys are role names (CSS: [data-pt~="role"]),
   * values are selector lists. Order does not matter; an element may get several roles.
   */
  var BASE = {
    // Shell
    'header': ['#header'],
    'header-bar': ['#header .cp-header', '#header > nav', '#header > header'],
    'brand-link': ['#header .cp-logo a', '#header a.cp-help-center', '#header .cp-help-center'],
    'brand-logo': ['#header .cp-logo img', '#header .cp-help-center img'],
    'header-actions': ['#header .cp-header-secondary'],
    'header-button': ['#header .cp-header-item > .aui-button', '#header .cv-header-nav-button', '#header .cp-header-item > button'],
    'user-button': ['#header .cp-user-profile', '#header [data-testid="profile-button"]'],
    'count-badge': ['#header .cp-badge'],
    'jira-footer': ['#footer', '.cv-page-content-footer', '.cv-help-center-content-footer'],
    'admin-tool': ['.cv-customize-theme-actions', '[data-testid="edit-visible-columns"]', '.cp-header-item:has(> .cv-customize-theme-actions)'],
    'announcement': ['.cv-portal-announcement'],
    'page': ['#page'],
    'content': ['#content-wrapper'],
    'main': ['#content'],
    'panel': ['#content .aui-page-panel'],
    'title-block': ['.cv-page-title', '#content .aui-page-header'],
    'title': ['h1.cv-page-title-text', '.cv-page-title h1', '.vp-request-header'],
    'breadcrumbs': ['.aui-nav-breadcrumbs', 'nav[aria-label="Breadcrumb"] ol', 'nav[aria-label="breadcrumbs"] ol'],

    // Home & portal
    'hero': ['.cv-help-center-title-container', '.cv-smart-portal-title-container'],
    'hero-title': ['#cv-help-center-page-title', '.cv-smart-portal-title'],
    'hero-text': ['.cv-help-center-container .cv-description', '.cv-smart-portal-container .cv-description', '.cv-description'],
    'search': ['.cv-help-center-search-container', '.cv-smart-portal-search-container'],
    'search-box': ['.sd-smart-search-input-box-container', '.sd-smart-search-input-container'],
    'search-input': ['#sd-customer-portal-smart-search-input', 'input.sd-smart-search-input'],
    'search-label': ['.sd-customer-portal-smart-search-label'],
    'search-icon': ['.sd-smart-search-icon'],
    'search-clear': ['.sd-smart-search-clear'],
    'search-count': ['.sd-smart-search-input-result-count'],
    'section-title': ['.cv-portal-cards-react-container h2', '.cv-smart-portal-browse-list-title', '.cv-recent-request-type-list-container h3',
      '.cv-help-center-main-content h2'],
    'portal-list': ['.cv-portal-cards-react-container'],
    'portal-toolbar': ['.cv-portal-cards-react-container > div > div:first-child'],
    'portal-grid': ['.cv-portal-cards-react-container ul'],
    'portal-card': ['.cv-portal-cards-react-container li > a'],
    'portal-card-name': ['.cv-portal-cards-react-container [data-testid="portal-card-name"]', '.cv-portal-cards-react-container li > a h3'],
    'portal-card-text': ['.cv-portal-cards-react-container [data-testid="card-description"]'],
    'group-list': ['.cv-request-groups'],
    'group-link': ['.cv-request-group-name'],
    'rt-grid': ['.cv-landing-list', '.cv-smart-portal-request-type-list', 'ul.cv-smart-portal-results'],
    'rt-card': ['.cv-landing-list .cv-request-type', 'li.cv-smart-portal-request-type-list-item'],
    'rt-icon': ['.cv-landing-list .vp-rq-icon', 'li.cv-smart-portal-request-type-list-item .vp-rq-icon'],
    'rt-name': ['.cv-landing-list .cv-request-type strong', '.cv-smart-portal-request-type-name'],
    'rt-text': ['.cv-request-type-description', '.cv-smart-portal-request-type-description'],
    'rt-meta': ['.cv-smart-portal-request-type-portal-name', '.cv-smart-portal-request-type-groups-container'],
    'recent': ['.cv-recent-request-type-list-container'],
    'layout-reset': ['.cv-help-center-container', '.cv-smart-portal-container', '.cv-help-center-content-container',
      '.cv-browse-container', '.cv-help-center-main-content', '.sd-scale-group', '.sd-scale-group > .aui-item',
      '.cv-page-contents-container', '.cv-portal-cards-container', '.cv-portal-cards-react-container > div'],
    'page-bg-image': ['.cv-bg-image', '.cv-help-center-branding-sidepanel'],

    // Create request
    'form-card': ['#content .cp-request-form', '#content form.vp-form.cp-request-form'],
    'rt-heading-icon': ['.cv-page-title-rticon', '.cv-page-title .aui-page-header-image'],
    'field': ['form.aui .field-group', '.cp-request-form .field-group'],
    'field-label': ['form.aui .field-group > label', 'form.aui .field-group > .field-label', 'form.aui legend'],
    'field-help': ['form.aui .field-group .description'],
    'field-error': ['form.aui .field-group .error', '.cp-request-form .error'],
    'required-note': ['.cp-required-fields-msg'],
    'form-actions': ['form.aui .buttons-container'],
    'field-separator': ['.cp-request-form .field-separator'],
    'kb-suggestions': ['#kb-results'],
    'dropzone': ['.sd-attachment-container .controls', '.comment-attachment .controls'],
    'attach-container': ['.sd-attachment-container'],
    'editor': ['.wysiwyg-create-request .akEditor', '.akEditor'],
    'editor-toolbar': ['[data-testid="ak-editor-main-toolbar"]'],
    'user-picker': ['.cp-user-picker sd-user-picker > div > div:nth-child(3)'],

    // View request
    'request-layout': ['.cv-request-details .aui-page-panel-inner.cv-page-body-inner', '.cv-request-details .aui-page-panel-inner'],
    'request-main': ['.cv-request-details .aui-page-panel-content'],
    'request-side': ['.cv-request-details .aui-page-panel-sidebar'],
    'request-panel': ['.cv-request-options'],
    'request-status': ['.cv-request-options > .request-status-lozenge', '.request-status-lozenge'],
    'request-actions': ['.cv-request-actions', 'ul.customer-request-actions'],
    'request-share': ['#cp-request-share-root'],
    'request-sla': ['#cv-request-sla-panel-root'],
    'comment-box': ['.cv-request-comment'],
    'comment-form': ['.comment-form'],
    'activity': ['.vp-activity-list'],
    'activity-item': ['.vp-activity-list .activity-item'],
    'activity-agent': ['.vp-activity-list .activity-item.worker-comment'],
    'activity-customer': ['.vp-activity-list .activity-item.requester-comment'],
    'activity-approval': ['.vp-activity-list .activity-item.approver-decision', '.vp-activity-list .activity-item.approver-decision-with-comment',
      '.vp-activity-list .activity-item.approval-created'],
    'activity-event': ['.vp-activity-list .activity-item.status-update', '.vp-activity-list .activity-item.resolution-update',
      '.vp-activity-list .activity-item.attachment'],
    'activity-fields': ['.vp-activity-list .activity-item.request-fields'],
    'activity-heading': ['.cv-request-activity > div > h2', '.cv-request-activity h2'],

    // Lists
    'list-toolbar': ['.cv-top', '.cp-search-filter-container'],
    'filters': ['form.cp-search-filter', '.cp-search-filter-container > form', 'ul.cp-filter-list'],
    'filter-search': ['.cp-filter-text-input-wrapper'],
    'table-wrap': ['[data-testid="cv-table-container"]'],
    'table': ['[data-testid="cv-table-container"] table', '#content table.aui'],
    'pagination': ['nav[aria-label="pagination"]', 'nav[aria-label="صفحه‌بندی"]', 'nav[aria-label="صفحه بندی"]'],
    'empty': ['.cv-no-requests', '.cp-no-results', '.cv-empty-state', '[data-testid="empty-state"]'],

    // Profile
    'profile-side': ['.cv-profile-details ~ .cv-page-sidebar', '[data-pt-page="profile"] .cv-page-sidebar'],
    'profile-main': ['.vp-request-activity:has(.cv-profile-details)', '.cv-profile-details'],
    'profile-row': ['dl.profile-field'],

    // Login (Jira 10+ generic login page for portal URLs)
    'login-shell': ['[data-testid="two-step-verification-jsm-login"]'],
    'login-card': ['[data-testid="two-step-verification-login"]'],
    'login-banner': ['[data-testid$="jsm-login__banner"]'],
    'login-form': ['#login-form'],
    'login-header': ['#login-header'],

    // Content that users wrote: keep its own text direction (English stays LTR)
    'user-content': ['.user-content-block', '.cv-user-content', '.vp-activity-list .activity-item > .content',
      '.vp-activity-list dd', '.vp-activity-list .comment-body', '[data-testid="cv-summary-cell"]',
      '.cv-request-type-description', '.cv-smart-portal-request-type-description', '[data-testid="card-description"]',
      '.vp-request-header'],
    'ltr-token': ['[data-testid="cv-issue-key-cell"]', '.cv-request-key', 'dd.email', '.profile-field .email']
  };

  /** Jira 9.x / JSM 5.x. The portal markup is the same family; differences are listed here. */
  var JSM5 = {
    'login-shell': ['#content .cv-login-container', '.cv-user-login'],
    'login-card': ['.cv-login-container .aui-page-panel', '.cv-user-login .aui-page-panel', '#login-panel'],
    'login-form': ['#login-form', 'form#vp-login-form', 'form.cv-login-form'],
    'header-bar': ['#header .cp-header'],
    'table-wrap': ['.cv-request-list-table', '.cv-requests-list'],
    'table': ['.cv-request-list-table table', 'table.cv-requests-table']
  };

  /** Jira 10 and 11. */
  var JSM10 = {};

  var ADAPTERS = [
    { id: 'jsm5', match: function (v) { return v.major > 0 && v.major < 10; }, roles: JSM5 },
    { id: 'jsm10', match: function (v) { return v.major >= 10; }, roles: JSM10 }
  ];

  function parseVersion(s) {
    var m = /^(\d+)\.(\d+)/.exec(String(s || ''));
    return m ? { major: +m[1], minor: +m[2] } : { major: 0, minor: 0 };
  }

  var roles = null;
  var adapterId = 'base';

  function init(jiraVersion) {
    var v = parseVersion(jiraVersion);
    if (!v.major) {
      // No server version: detect from the DOM (Jira 10+ login markup, AUI version meta).
      v.major = document.querySelector('[data-testid="two-step-verification-jsm-login"]') ? 10 : 0;
    }
    var merged = {};
    var add = function (map) {
      for (var k in map) {
        if (Object.prototype.hasOwnProperty.call(map, k)) {
          merged[k] = (merged[k] || []).concat(map[k]);
        }
      }
    };
    add(BASE);
    for (var i = 0; i < ADAPTERS.length; i++) {
      if (ADAPTERS[i].match(v)) { add(ADAPTERS[i].roles); adapterId = ADAPTERS[i].id; }
    }
    roles = [];
    for (var role in merged) {
      if (Object.prototype.hasOwnProperty.call(merged, role)) {
        var sel = merged[role].filter(isSupported).join(',');
        if (sel) { roles.push({ role: role, selector: sel }); }
      }
    }
    return adapterId;
  }

  /** Drops selectors the browser cannot parse (e.g. :has in older browsers). */
  function isSupported(sel) {
    try { document.createDocumentFragment().querySelector(sel); return true; } catch (e) { return false; }
  }

  function addRole(el, role) {
    var cur = el.getAttribute('data-pt');
    if (!cur) { el.setAttribute('data-pt', role); return; }
    if ((' ' + cur + ' ').indexOf(' ' + role + ' ') < 0) { el.setAttribute('data-pt', cur + ' ' + role); }
  }

  /**
   * Tags elements in the subtree of `scope` (and scope itself). Called for the whole document on
   * start and afterwards only for subtrees added by JSM, which keeps each pass cheap.
   */
  function tag(scope) {
    if (!roles || !scope || scope.nodeType !== 1) { return; }
    for (var i = 0; i < roles.length; i++) {
      var r = roles[i];
      if (scope.matches && safeMatches(scope, r.selector)) { addRole(scope, r.role); }
      var list = scope.querySelectorAll(r.selector);
      for (var j = 0; j < list.length; j++) { addRole(list[j], r.role); }
    }
  }

  function safeMatches(el, sel) {
    try { return el.matches(sel); } catch (e) { return false; }
  }

  /**
   * Some roles depend on context that changes without new nodes (e.g. an element gains a class).
   * These cheap document-level checks run after every batch.
   */
  function refreshState() {
    var active = document.querySelectorAll('.cv-request-groups > li');
    for (var i = 0; i < active.length; i++) {
      var li = active[i];
      var link = li.querySelector('.cv-request-group-name, a');
      if (!link) { continue; }
      var on = /\bcv-active\b/.test(li.className) || link.getAttribute('aria-current') === 'page' || link.getAttribute('aria-selected') === 'true';
      if (on) { link.setAttribute('data-pt-state', 'active'); } else if (link.hasAttribute('data-pt-state')) { link.removeAttribute('data-pt-state'); }
    }
  }

  PT.compat = {
    page: page,
    portalId: portalId,
    init: init,
    tag: tag,
    refreshState: refreshState,
    adapter: function () { return adapterId; },
    PORTAL_PREFIX: PORTAL
  };
})(window.PortalTheme);
