/*!
 * Parsira — customer-facing text layer.
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
    '[data-testid="cv-summary-cell"]', '[data-pt~="user-content"]', '[data-pt-skip]', '.pt-own'
  ].join(',');

  // Jira sentences that wrap a value in markup ("Your request status changed to <strong>Done</strong>.").
  // They live inside activity items that are otherwise skipped as user content, so they are
  // handled as whole sentences: the text parts are rewritten in place and the inline elements keep
  // their position, with their own text translated when it is a known text (status names…).
  var SENTENCE_SCOPE = '[data-pt~="activity-event"] > .content, [data-pt~="activity-approval"] > .content, [data-pt-sentence]';
  var INLINE = /^(STRONG|B|EM|I|SPAN|A)$/;

  var ATTRS = ['placeholder', 'title', 'aria-label', 'alt'];
  var AMPM = { AM: 'ق.ظ.', PM: 'ب.ظ.' };
  var LATIN_KEEP = /\b[A-Z][A-Z0-9_]+-\d+\b|@|https?:|www\.|\d+\.\d+\.\d+/;

  var exact = {};
  var patterns = [];
  var sentences = {};
  var persianDigits = false;
  var jalali = false;
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
    sentences = {};
    var useBuiltin = builtin && loc.translate !== false;
    if (useBuiltin) {
      U.merge(exact, builtin.exact);
      U.merge(sentences, builtin.sentences || {});
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
    jalali = loc.jalali !== false && loc.language === 'fa' && !!PT.date;
    active = patterns.length > 0 || Object.keys(exact).length > 0 || jalali || persianDigits;
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
    if (out === null && jalali) {
      out = PT.date.convertText(t);            // "24/Sep/26 3:15 PM" → "۲ مهر ۱۴۰۵، ساعت ۱۵:۱۵"
    }
    if (out === null && persianDigits && /^[\d\s\-–/:.,]{1,24}$/.test(t) && /\d/.test(t)) {
      out = t;                                  // counters, page numbers, "1 - 20"
    }
    if (out === null) { return null; }
    if (persianDigits) {
      out = out.replace(/\b(\d{1,2}:\d{2}) ?(AM|PM)\b/g, function (m, time, ap) { return time + ' ' + AMPM[ap]; });
      if (!LATIN_KEEP.test(out)) { out = U.toPersianDigits(out); }
    }
    return raw.match(/^\s*/)[0] + out + raw.match(/\s*$/)[0];
  }

  // Jira's own labels inside skipped areas (the status badge inside the request title in JSM 5)
  var UNSKIP = '.aui-lozenge, [data-pt~="status-pill"]';

  function skipped(el) {
    if (!el || !el.closest) { return false; }
    if (el.closest(UNSKIP)) { return false; }
    return !!el.closest(SKIP);
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

  /**
   * Sentence with inline elements: "Your request status changed to {1}." → "… «{1}» …".
   * Placeholders must keep their order in the translation, because nodes are never moved.
   */
  function sentence(el) {
    var kids = el.childNodes;
    var src = '';
    var slots = [[]];      // text nodes before, between and after the inline elements
    var elems = [];
    for (var i = 0; i < kids.length; i++) {
      var k = kids[i];
      if (k.nodeType === 3) { src += k.nodeValue; slots[slots.length - 1].push(k); continue; }
      if (k.nodeType !== 1 || !INLINE.test(k.tagName) || k.children.length) { systemTexts(el); return; }
      elems.push(k);
      src += '{' + elems.length + '}';
      slots.push([]);
    }
    src = src.replace(/\s+/g, ' ').trim();
    if (!elems.length || !U.hasOwn.call(sentences, src)) { systemTexts(el); return; }
    // A sentence is "target" or { text: "target", values: { english: persian } } when the inline
    // values need a wording specific to this sentence ("approved" → "تأیید کرد").
    var def = sentences[src];
    var values = (def && def.values) || {};
    var parts = String(def && def.text !== undefined ? def.text : def).split(/\{(\d)\}/);
    for (var p = 1; p < parts.length; p += 2) {
      if (+parts[p] !== (p + 1) / 2) { return; }   // order changed: not supported
    }
    if ((parts.length - 1) / 2 !== elems.length) { return; }
    for (var s = 0; s < slots.length; s++) {
      var text = parts[s * 2];
      if (!slots[s].length) {
        if (!text) { continue; }
        var t = document.createTextNode(text);
        el.insertBefore(t, s < elems.length ? elems[s] : null);
        continue;
      }
      slots[s][0].nodeValue = text;
      for (var r = 1; r < slots[s].length; r++) { slots[s][r].nodeValue = ''; }
    }
    for (var e = 0; e < elems.length; e++) {
      var v = elems[e].textContent.replace(/\s+/g, ' ').trim();
      if (U.hasOwn.call(values, v)) { elems[e].textContent = values[v]; } else if (U.hasOwn.call(exact, v)) { elems[e].textContent = exact[v]; }
      elems[e].setAttribute('dir', 'auto');
    }
  }

  /**
   * Plain system texts inside an event item ("Request requires approval. 1 approval needed.").
   * Only exact/pattern matches are replaced, so a person's own words are left as they are.
   */
  function systemTexts(el) {
    var walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null);
    var n;
    while ((n = walker.nextNode())) {
      if (!/[A-Za-z]/.test(n.nodeValue)) { continue; }
      var p = n.parentElement;
      if (p && p.closest && p.closest('textarea, input, code, pre, [contenteditable="true"], .pt-own')) { continue; }
      var t = translate(n.nodeValue);
      if (t !== null && t !== n.nodeValue) { n.nodeValue = t; }
    }
  }

  function sentences_(node) {
    if (node.nodeType === 3) {
      var host = node.parentElement && node.parentElement.closest && node.parentElement.closest(SENTENCE_SCOPE);
      if (host) { sentence(host); }
      return;
    }
    if (node.matches && node.matches(SENTENCE_SCOPE)) { sentence(node); }
    var list = node.querySelectorAll ? node.querySelectorAll(SENTENCE_SCOPE) : [];
    for (var i = 0; i < list.length; i++) { sentence(list[i]); }
    if (!list.length && node.closest) {
      var up = node.closest(SENTENCE_SCOPE);
      if (up) { sentence(up); }
    }
  }

  /** Translates a subtree (or a single text node). */
  function apply(node) {
    if (!active || !node) { return; }
    if (node.nodeType === 3) { textNode(node); sentences_(node); return; }
    if (node.nodeType !== 1) { return; }
    attributes(node);
    var walker = document.createTreeWalker(node, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, null);
    var n;
    while ((n = walker.nextNode())) {
      if (n.nodeType === 3) { textNode(n); } else { attributes(n); }
    }
    sentences_(node);
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
