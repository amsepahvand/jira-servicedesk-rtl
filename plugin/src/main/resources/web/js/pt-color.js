/*!
 * Parsira — colour maths (WCAG 2.x contrast, mixing, accessible adjustments).
 * Used by the portal token engine and by the admin page's live preview and contrast checks.
 */
(function (PT) {
  'use strict';

  function parse(hex) {
    var h = String(hex || '').trim().replace(/^#/, '');
    if (/^[0-9a-f]{3}$/i.test(h)) { h = h.replace(/(.)/g, '$1$1'); }
    if (!/^[0-9a-f]{6}$/i.test(h)) { return null; }
    return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) };
  }

  function clamp(v) { return Math.max(0, Math.min(255, Math.round(v))); }

  function toHex(c) {
    return '#' + [c.r, c.g, c.b].map(function (v) { var s = clamp(v).toString(16); return s.length === 1 ? '0' + s : s; }).join('');
  }

  function valid(hex) { return parse(hex) !== null; }

  function normalize(hex, fallback) { var c = parse(hex); return c ? toHex(c) : fallback; }

  function channel(v) {
    var s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  }

  function luminance(hex) {
    var c = parse(hex);
    if (!c) { return 0; }
    return 0.2126 * channel(c.r) + 0.7152 * channel(c.g) + 0.0722 * channel(c.b);
  }

  /** WCAG contrast ratio, 1..21. */
  function contrast(a, b) {
    var l1 = luminance(a), l2 = luminance(b);
    var hi = Math.max(l1, l2), lo = Math.min(l1, l2);
    return (hi + 0.05) / (lo + 0.05);
  }

  /** Linear sRGB-space mix: weight 0 → a, 1 → b. */
  function mix(a, b, weight) {
    var x = parse(a), y = parse(b);
    if (!x || !y) { return a; }
    var w = Math.max(0, Math.min(1, weight));
    return toHex({ r: x.r + (y.r - x.r) * w, g: x.g + (y.g - x.g) * w, b: x.b + (y.b - x.b) * w });
  }

  function lighten(hex, w) { return mix(hex, '#ffffff', w); }
  function darken(hex, w) { return mix(hex, '#000000', w); }

  function rgba(hex, alpha) {
    var c = parse(hex);
    if (!c) { return 'transparent'; }
    return 'rgba(' + c.r + ', ' + c.g + ', ' + c.b + ', ' + alpha + ')';
  }

  function isDark(hex) { return luminance(hex) < 0.18; }

  /** The more readable of the two candidates on bg (defaults: near-black / white). */
  function onColor(bg, dark, light) {
    dark = dark || '#111111';
    light = light || '#ffffff';
    return contrast(dark, bg) >= contrast(light, bg) ? dark : light;
  }

  /**
   * Moves fg towards black or white (whichever direction increases contrast against bg) until the
   * ratio reaches min. Keeps the hue recognisable; returns fg unchanged if it already passes.
   */
  function ensureContrast(fg, bg, min) {
    if (!valid(fg) || !valid(bg)) { return fg; }
    if (contrast(fg, bg) >= min) { return normalize(fg); }
    var towards = luminance(bg) > 0.4 ? '#000000' : '#ffffff';
    for (var w = 0.05; w <= 1.0001; w += 0.05) {
      var c = mix(fg, towards, w);
      if (contrast(c, bg) >= min) { return c; }
    }
    return towards;
  }

  /** Hover/pressed shade that stays in the same family and remains visibly different. */
  function shade(hex, step) {
    return isDark(hex) ? lighten(hex, 0.12 * step) : darken(hex, 0.08 * step);
  }

  PT.color = {
    parse: parse,
    toHex: toHex,
    valid: valid,
    normalize: normalize,
    luminance: luminance,
    contrast: contrast,
    mix: mix,
    lighten: lighten,
    darken: darken,
    rgba: rgba,
    isDark: isDark,
    onColor: onColor,
    ensureContrast: ensureContrast,
    shade: shade
  };
})(window.PortalTheme);
