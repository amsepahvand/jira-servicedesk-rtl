/*!
 * Portal Theme — customer-facing text layer.
 *
 * Replaces texts that Jira renders (buttons, headings, validation messages, statuses…) with the
 * built-in Persian texts and/or the admin's own overrides. Safety rules:
 *   - only whole, exact texts (or admin/built-in patterns) are replaced — never substrings;
 *   - text the user or agents wrote, form values, editors and code are never touched;
 *   - React owns the DOM: the text node's value is changed in place, nodes are never replaced;
 *   - request keys, e-mails, URLs and version numbers keep Latin digits.
 */
(function (PT) {
  'use strict';

  var U = PT.util;

  // Nodes whose text is never replaced: user content, inputs, editors, code, our own UI.
  var SKIP = [
    'textarea', 'input', 'select', 'option', 'script', 'style', 'code', 'pre', 'noscript', 'svg',
    '[contenteditable="true"]', '.ak-editor-content-area', '.ProseMirror', '.wiki-edit', '.mce-content-body',
    '.user-content-block', '.cv-user-content', '.vp-request-header', '.vp-activity-list dd',
    '.vp-activity-list .comment-body', '.vp-activity-list .activity-item > .content',
    '[data-testid="cv-summary-cell"]', '[data-pt~="user-content"]', '[data-pt-skip]', '.pt-own', '.cv-help-center-branding-sidepanel'
  ].join(',');

  var ATTRS = ['placeholder', 'title', 'aria-label', 'alt'];
  var AMPM = { AM: 'ق.ظ.', PM: 'ب.ظ.' };
  var LATIN_KEEP = /\b[A-Z][A-Z0-9_]+-\d+\b|@|https?:|www\.|\d+\.\d+\.\d+/;

  var exact = {};
  var patterns = [];
  var persianDigits = false;
  var active = false;

  function escapeRegex(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

  /** Admin pattern "Please fill '{1}'" → /^Please fill '(.+?)'$/ ; target "{1}" → "$1". */
  function compileAdminPattern(p) {
    if (!p || typeof p.source !== 'string' || typeof p.target !== 'string' || !p.source.trim()) { return null; }
    var parts = p.source.trim().split(/\{(\d)\}/);
    var re = '^';
    for (var i = 0; i < parts.length; i++) {
      re += i % 2 === 0 ? escapeRegex(parts[i]).replace(/\s+/g, '\\s+') : '(.+?)';
    }
    try {
      return [new RegExp(re + '$'), p.target.replace(/\{(\d)\}/g, '$$$1')];
    } catch (e) { return null; }
  }

  /**
   * settings: effective settings. builtin: PT.i18n.<lang> or null.
   */
  function configure(settings, builtin) {
    var loc = settings.locale || {};
    exact = {};
    patterns = [];
    var useBuiltin = builtin && loc.translate !== false;
    if (useBuiltin) {
      U.merge(exact, builtin.exact);
      for (var i = 0; i < builtin.patterns.length; i++) {
        try { patterns.push([new RegExp(builtin.patterns[i][0]), builtin.patterns[i][1]]); } catch (e) { /* skip */ }
      }
    }
    // Jira's default brand texts become the company name.
    var company = U.get(settings, 'identity.companyName', '');
    if (company) {
      exact['Help Center'] = company;
      exact['Help center'] = company;
      exact['Customer portal'] = company;
    }
    // Admin overrides win over everything built in.
    var dict = settings.dictionary;
    if (U.isPlainObject(dict)) {
      for (var k in dict) {
        if (U.hasOwn.call(dict, k) && typeof dict[k] === 'string') { exact[k.replace(/\s+/g, ' ').trim()] = dict[k]; }
      }
    }
    var adminPatterns = [];
    (Array.isArray(settings.patterns) ? settings.patterns : []).forEach(function (p) {
      var c = compileAdminPattern(p);
      if (c) { adminPatterns.push(c); }
    });
    patterns = adminPatterns.concat(patterns);
    persianDigits = !!loc.persianDigits && loc.language === 'fa';
    active = patterns.length > 0 || Object.keys(exact).length > 0;
    return active;
  }

  function translate(raw) {
    var t = raw.replace(/\s+/g, ' ').trim();
    if (!t || t.length > 400) { return null; }
    var out = null;
    if (U.hasOwn.call(exact, t)) {
      out = exact[t];
    } else {
      for (var i = 0; i < patterns.length; i++) {
        var m = patterns[i][0].exec(t);
        if (m) {
          out = t.replace(patterns[i][0], patterns[i][1]);
          // Variable parts that are themselves known texts (e.g. a field label) get translated,
          // and «…» parts are bidi-isolated so Latin names keep their order.
          out = out.replace(/«([^»]+)»/g, function (all, g) {
            return '«⁨' + (U.hasOwn.call(exact, g) ? exact[g] : g) + '⁩»';
          });
          break;
        }
      }
    }
    if (out === null) { return null; }
    if (persianDigits) {
      out = out.replace(/\b(\d{1,2}:\d{2}) ?(AM|PM)\b/g, function (m, time, ap) { return time + ' ' + AMPM[ap]; });
      if (!LATIN_KEEP.test(out)) { out = U.toPersianDigits(out); }
    }
    return raw.match(/^\s*/)[0] + out + raw.match(/\s*$/)[0];
  }

  function skipped(el) {
    return !!(el && el.closest && el.closest(SKIP));
  }

  function textNode(node) {
    var v = node.nodeValue;
    if (!v || !/[A-Za-z0-9]/.test(v)) { return; }
    var p = node.parentElement;
    if (!p || skipped(p)) { return; }
    var t = translate(v);
    if (t !== null && t !== v) { node.nodeValue = t; }
  }

  function attributes(el) {
    if (el.tagName === 'INPUT' && el.type === 'hidden') { return; }
    // Jira passes parameters to scripts through title attributes of hidden fieldsets.
    if (el.closest && el.closest('fieldset.parameters, .parameters, fieldset.hidden')) { return; }
    var isField = el.tagName === 'INPUT' || el.tagName === 'TEXTAREA';
    if (!isField && skipped(el)) { return; }
    for (var i = 0; i < ATTRS.length; i++) {
      var a = ATTRS[i];
      if (!el.hasAttribute(a)) { continue; }
      var v = el.getAttribute(a);
      var t = translate(v);
      if (t !== null && t !== v) { el.setAttribute(a, t.trim()); }
    }
    if (el.tagName === 'INPUT' && /^(submit|button|reset)$/i.test(el.type) && el.value) {
      var tv = translate(el.value);
      if (tv !== null && tv !== el.value) { el.value = tv.trim(); }
    }
  }

  /** Translates a subtree (or a single text node). */
  function apply(node) {
    if (!active || !node) { return; }
    if (node.nodeType === 3) { textNode(node); return; }
    if (node.nodeType !== 1) { return; }
    attributes(node);
    var walker = document.createTreeWalker(node, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, null);
    var n;
    while ((n = walker.nextNode())) {
      if (n.nodeType === 3) { textNode(n); } else { attributes(n); }
    }
  }

  PT.text = {
    configure: configure,
    translate: function (s) { return active ? translate(s) : null; },
    apply: apply,
    applyAttributes: function (el) { if (active && el && el.nodeType === 1) { attributes(el); } },
    isActive: function () { return active; },
    ATTRS: ATTRS,
    compileAdminPattern: compileAdminPattern
  };
})(window.PortalTheme);
