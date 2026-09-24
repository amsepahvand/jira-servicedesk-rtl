/*!
 * Portal Theme for Jira Service Management — namespace and small utilities.
 * Plain ES5 on purpose: it runs through every Jira version's resource minifier unchanged.
 */
(function (root) {
  'use strict';

  var PT = root.PortalTheme || {};
  root.PortalTheme = PT;

  PT.version = '1.0.2';
  PT.PLUGIN_KEY = 'io.portaltheme.jsm-portal-theme';

  var hasOwn = Object.prototype.hasOwnProperty;

  function isPlainObject(v) {
    return v !== null && typeof v === 'object' && Object.prototype.toString.call(v) === '[object Object]';
  }

  /** Deep merge: objects merge key by key, everything else (incl. arrays) is replaced. */
  function merge(target) {
    for (var a = 1; a < arguments.length; a++) {
      var src = arguments[a];
      if (!isPlainObject(src)) { continue; }
      for (var k in src) {
        if (!hasOwn.call(src, k)) { continue; }
        var v = src[k];
        if (v === undefined) { continue; }
        if (isPlainObject(v)) {
          target[k] = merge(isPlainObject(target[k]) ? target[k] : {}, v);
        } else if (Array.isArray(v)) {
          target[k] = v.slice();
        } else {
          target[k] = v;
        }
      }
    }
    return target;
  }

  function clone(v) { return merge({}, { v: v }).v; }

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /** Relative, http(s), mailto: and tel: only — mirrors the server-side validator. */
  function safeUrl(url) {
    var u = String(url == null ? '' : url).trim();
    if (!u) { return ''; }
    if (/^(https?:\/\/|\/(?!\/)|\?|#|mailto:|tel:)/i.test(u) && !/[\s"'<>]/.test(u)) { return u; }
    return '';
  }

  /** Jira context path ("" or "/jira"), without relying on AJS being present. */
  function contextPath() {
    try {
      if (root.AJS && typeof root.AJS.contextPath === 'function') { return root.AJS.contextPath() || ''; }
    } catch (e) { /* fall through */ }
    var p = root.location.pathname;
    var markers = ['/servicedesk/', '/plugins/servlet/', '/secure/', '/browse/', '/login.jsp'];
    for (var i = 0; i < markers.length; i++) {
      var at = p.indexOf(markers[i]);
      if (at > 0) { return p.slice(0, at); }
    }
    return '';
  }

  function absolute(href) {
    var u = safeUrl(href);
    if (!u) { return ''; }
    return u.charAt(0) === '/' ? contextPath() + u : u;
  }

  function get(obj, path, fallback) {
    var parts = path.split('.');
    var cur = obj;
    for (var i = 0; i < parts.length; i++) {
      if (cur == null || typeof cur !== 'object') { return fallback; }
      cur = cur[parts[i]];
    }
    return cur === undefined || cur === null || cur === '' ? fallback : cur;
  }

  function onReady(fn) {
    if (document.readyState !== 'loading') { fn(); } else { document.addEventListener('DOMContentLoaded', fn); }
  }

  var PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
  function toPersianDigits(s) {
    return String(s).replace(/[0-9]/g, function (d) { return PERSIAN_DIGITS.charAt(+d); });
  }

  PT.util = {
    hasOwn: hasOwn,
    isPlainObject: isPlainObject,
    merge: merge,
    clone: clone,
    escapeHtml: escapeHtml,
    safeUrl: safeUrl,
    contextPath: contextPath,
    absolute: absolute,
    get: get,
    onReady: onReady,
    toPersianDigits: toPersianDigits
  };
})(window);
