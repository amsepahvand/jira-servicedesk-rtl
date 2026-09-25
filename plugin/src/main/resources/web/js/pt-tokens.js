/*!
 * Parsira — design-token engine.
 *
 * Turns the handful of admin settings (brand colours, radius, density…) into the complete set of
 * CSS custom properties used by the stylesheets. Every foreground/background pair is checked and,
 * if needed, nudged until it meets WCAG AA — so any brand colour an admin enters stays readable.
 *
 * The same code renders the admin page's live preview and contrast report.
 */
(function (PT) {
  'use strict';

  var C = PT.color;
  var U = PT.util;

  var WIDTHS = { narrow: 1040, standard: 1200, wide: 1400 };

  function num(v, min, max, fallback) {
    var n = Number(v);
    if (!isFinite(n)) { return fallback; }
    return Math.max(min, Math.min(max, n));
  }

  function fontStack(t) {
    var persian = '"Vazirmatn", "Vazir", "IRANSans", Tahoma, system-ui, sans-serif';
    var system = 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Tahoma, Arial, sans-serif';
    if (t.font === 'system') { return system; }
    if (t.font === 'custom') {
      var s = String(t.customStack || '').replace(/[^\w\s"',\-]/g, '').trim();
      return s ? s + ', ' + persian : persian;
    }
    return persian;
  }

  /** Light-scheme colour roles. */
  function lightPalette(c) {
    var surface = C.normalize(c.surface, '#ffffff');
    var bg = C.normalize(c.background, '#f5f7fa');
    var text = C.ensureContrast(C.normalize(c.text, '#0f1b2d'), bg, 7);
    var brand = C.normalize(c.primary, '#16407a');
    var accent = C.normalize(c.accent, brand);
    return build({
      bg: bg, surface: surface, text: text,
      muted: C.normalize(c.muted, '#4a5568'),
      border: C.normalize(c.border, '#e2e7ee'),
      brand: brand, accent: accent,
      focus: C.normalize(c.focus, brand),
      success: C.normalize(c.success, '#15803d'),
      warning: C.normalize(c.warning, '#b45309'),
      error: C.normalize(c.error, '#c0262d'),
      header: C.normalize(c.header, surface),
      scheme: 'light'
    });
  }

  /** Dark scheme derived from the brand, unless explicit colors.dark.* values are given. */
  function darkPalette(c) {
    var d = U.isPlainObject(c.dark) ? c.dark : {};
    var brand = C.normalize(c.primary, '#16407a');
    var accent = C.normalize(c.accent, brand);
    var bg = C.normalize(d.background, C.mix('#0d1117', brand, 0.05));
    var surface = C.normalize(d.surface, C.mix('#161b23', brand, 0.06));
    // A very dark brand colour (e.g. black) disappears on a dark surface: use the accent instead.
    var darkBrand = C.contrast(brand, surface) >= 3 ? brand
      : (C.contrast(accent, surface) >= 3 ? accent : C.ensureContrast(brand, surface, 3));
    var header = C.normalize(d.header, C.isDark(C.normalize(c.header, '#ffffff')) ? C.normalize(c.header) : surface);
    return build({
      bg: bg, surface: surface,
      text: C.normalize(d.text, '#e8ecf2'),
      muted: C.normalize(d.muted, '#a7b0be'),
      border: C.normalize(d.border, C.mix(surface, '#ffffff', 0.12)),
      brand: darkBrand, accent: accent,
      focus: C.ensureContrast(C.normalize(c.focus, darkBrand), surface, 3),
      success: C.lighten(C.normalize(c.success, '#15803d'), 0.35),
      warning: C.lighten(C.normalize(c.warning, '#b45309'), 0.35),
      error: C.lighten(C.normalize(c.error, '#c0262d'), 0.35),
      header: header,
      scheme: 'dark'
    });
  }

  function statusSet(color, surface, scheme) {
    var bg = C.mix(surface, color, scheme === 'dark' ? 0.2 : 0.11);
    return {
      bg: bg,
      fg: C.ensureContrast(scheme === 'dark' ? C.lighten(color, 0.2) : C.darken(color, 0.12), bg, 4.8),
      dot: color,
      border: C.mix(surface, color, 0.3)
    };
  }

  function build(p) {
    var dark = p.scheme === 'dark';
    var surface2 = C.mix(p.surface, p.text, dark ? 0.04 : 0.025);
    var surface3 = C.mix(p.surface, p.text, dark ? 0.08 : 0.055);
    var muted = C.ensureContrast(C.ensureContrast(p.muted, p.surface, 4.6), p.bg, 4.6);
    var subtle = C.ensureContrast(C.mix(muted, p.surface, 0.18), p.surface, 4.5);
    var borderStrong = C.ensureContrast(C.mix(p.border, p.text, dark ? 0.25 : 0.32), p.surface, 3);
    // Field outline: meets 3:1 against the surface (WCAG 1.4.11), a touch darker on hover.
    var fieldBorder = C.ensureContrast(C.mix(p.border, p.text, dark ? 0.2 : 0.26), p.surface, 3);
    var fieldBorderHover = C.mix(fieldBorder, p.text, 0.3);
    var onBrand = C.onColor(p.brand, '#111111', '#ffffff');
    var onAccent = C.onColor(p.accent, '#111111', '#ffffff');
    var brandText = C.ensureContrast(p.brand, p.surface, 4.6);
    var accentText = C.ensureContrast(p.accent, p.surface, 4.6);
    var onHeader = C.onColor(p.header, p.text === '#ffffff' ? '#111111' : (dark ? '#111111' : p.text), '#ffffff');
    var headerIsDark = C.isDark(p.header);
    var brandSoft = C.mix(p.surface, p.brand, dark ? 0.16 : 0.07);
    var accentSoft = C.mix(p.surface, p.accent, dark ? 0.18 : 0.14);
    var focus = C.ensureContrast(p.focus, p.surface, 3);
    var info = statusSet(p.brand, p.surface, p.scheme);

    return {
      scheme: p.scheme,
      bg: p.bg,
      surface: p.surface,
      surface2: surface2,
      surface3: surface3,
      text: C.ensureContrast(p.text, p.surface, 7),
      muted: muted,
      subtle: subtle,
      border: p.border,
      borderStrong: borderStrong,
      fieldBg: dark ? C.mix(p.surface, '#000000', 0.12) : p.surface,
      fieldBorder: fieldBorder,
      fieldBorderHover: fieldBorderHover,
      brand: p.brand,
      brandHover: C.shade(p.brand, 1),
      brandActive: C.shade(p.brand, 2),
      onBrand: onBrand,
      brandText: brandText,
      brandSoft: brandSoft,
      brandSoftText: C.ensureContrast(p.brand, brandSoft, 4.6),
      accent: p.accent,
      accentHover: C.shade(p.accent, 1),
      onAccent: onAccent,
      accentText: accentText,
      accentSoft: accentSoft,
      accentSoftText: C.ensureContrast(C.darken(p.accent, 0.35), accentSoft, 4.6),
      focus: focus,
      header: p.header,
      onHeader: onHeader,
      onHeaderMuted: C.ensureContrast(C.mix(onHeader, p.header, 0.28), p.header, 4.5),
      headerHover: C.mix(p.header, onHeader, headerIsDark ? 0.1 : 0.05),
      headerBorder: headerIsDark ? C.mix(p.header, '#ffffff', 0.1) : p.border,
      headerIsDark: headerIsDark,
      success: statusSet(p.success, p.surface, p.scheme),
      warning: statusSet(p.warning, p.surface, p.scheme),
      error: statusSet(p.error, p.surface, p.scheme),
      info: info,
      // Status semantics: fixed, recognisable hues (not the brand), contrast-checked per scheme.
      stNew: statusSet('#52607a', p.surface, p.scheme),
      stProgress: statusSet('#1f5fbf', p.surface, p.scheme),
      stWaiting: statusSet('#b45309', p.surface, p.scheme),
      stApproval: statusSet('#6d3fc0', p.surface, p.scheme),
      stDone: statusSet(p.success, p.surface, p.scheme),
      stRejected: statusSet(p.error, p.surface, p.scheme),
      stCancelled: statusSet('#6b7280', p.surface, p.scheme),
      neutral: {
        bg: surface3,
        fg: C.ensureContrast(p.text, surface3, 7),
        dot: C.mix(p.text, p.surface, 0.45),
        border: p.border
      },
      shadowColor: dark ? '#000000' : C.mix(p.text, '#000000', 0.4)
    };
  }

  var SHADOWS = {
    none: [0, 0, 0],
    soft: [1, 1, 1],
    medium: [1.6, 1.5, 1.4]
  };

  function shadowsFor(level, color, dark) {
    var f = SHADOWS[level] || SHADOWS.soft;
    if (level === 'none') {
      return { s1: 'none', s2: 'none', s3: '0 12px 32px -12px ' + C.rgba(color, dark ? 0.6 : 0.22) };
    }
    var a = dark ? 2.6 : 1;
    return {
      s1: '0 1px 2px ' + C.rgba(color, 0.05 * f[0] * a) + ', 0 2px 6px -2px ' + C.rgba(color, 0.06 * f[0] * a),
      s2: '0 2px 4px ' + C.rgba(color, 0.05 * f[1] * a) + ', 0 12px 28px -12px ' + C.rgba(color, 0.2 * f[1] * a),
      s3: '0 0 0 1px ' + C.rgba(color, 0.05 * a) + ', 0 18px 48px -12px ' + C.rgba(color, 0.3 * f[2] * a)
    };
  }

  /** Complete token map (CSS custom property name → value) for one scheme. */
  function tokenMap(settings, scheme) {
    var s = settings;
    var p = scheme === 'dark' ? darkPalette(s.colors || {}) : lightPalette(s.colors || {});
    var shape = s.shape || {};
    var r = num(shape.radius, 0, 24, 12);
    var compact = shape.density === 'compact';
    var sh = shadowsFor(shape.shadow, p.shadowColor, scheme === 'dark');
    var card = shape.cardStyle || 'elevated';
    var t = {};

    function put(k, v) { t['--pt-' + k] = v; }

    ['bg', 'surface', 'surface2', 'surface3', 'text', 'muted', 'subtle', 'border', 'borderStrong', 'fieldBg', 'fieldBorder',
      'fieldBorderHover', 'brand', 'brandHover',
      'brandActive', 'onBrand', 'brandText', 'brandSoft', 'brandSoftText', 'accent', 'accentHover', 'onAccent',
      'accentText', 'accentSoft', 'accentSoftText', 'focus', 'header', 'onHeader', 'onHeaderMuted', 'headerHover',
      'headerBorder'].forEach(function (k) {
      put(k.replace(/[A-Z]/g, function (m) { return '-' + m.toLowerCase(); }), p[k]);
    });
    ['success', 'warning', 'error', 'info', 'neutral', 'stNew', 'stProgress', 'stWaiting', 'stApproval', 'stDone', 'stRejected',
      'stCancelled'].forEach(function (k) {
      var n = k.replace(/^st([A-Z])/, function (m, c) { return 'st-' + c.toLowerCase(); });
      put(n + '-bg', p[k].bg);
      put(n + '-fg', p[k].fg);
      put(n + '-dot', p[k].dot);
      put(n + '-border', p[k].border);
    });
    put('scrim', C.rgba(scheme === 'dark' ? '#000000' : C.darken(p.text, 0.4), scheme === 'dark' ? 0.66 : 0.48));
    put('focus-ring', '0 0 0 2px ' + p.surface + ', 0 0 0 4px ' + p.focus);
    put('focus-glow', '0 0 0 4px ' + C.rgba(p.focus, 0.16));
    put('selection', C.rgba(p.accent, 0.35));

    // Shape
    put('radius-xs', Math.round(r * 0.34) + 'px');
    put('radius-sm', Math.round(r * 0.55) + 'px');
    put('radius-md', Math.round(r * 0.75) + 'px');
    put('radius-lg', r + 'px');
    put('radius-xl', Math.round(Math.min(r * 1.4, 28)) + 'px');
    put('radius-pill', r === 0 ? '0' : '999px');

    // Depth and card style
    put('shadow-xs', shape.shadow === 'none' ? 'none' : '0 1px 2px ' + C.rgba(p.shadowColor, scheme === 'dark' ? 0.3 : 0.05));
    put('shadow-1', sh.s1);
    put('shadow-2', sh.s2);
    put('shadow-3', sh.s3);
    put('card-bg', card === 'flat' ? p.surface2 : p.surface);
    put('card-border', card === 'elevated' ? C.mix(p.border, p.surface, 0.35) : (card === 'flat' ? 'transparent' : p.border));
    put('card-shadow', card === 'elevated' ? sh.s1 : 'none');
    put('card-shadow-hover', sh.s2 === 'none' ? '0 0 0 1px ' + p.borderStrong : sh.s2);

    // Density and layout
    put('control-h', compact ? '40px' : '44px');
    put('button-h', compact ? '40px' : '46px');
    put('card-pad', compact ? '16px' : '22px');
    put('gap', compact ? '12px' : '16px');
    put('section-gap', compact ? '32px' : '44px');
    put('container', (WIDTHS[shape.contentWidth] || WIDTHS.standard) + 'px');

    // Typography
    var typo = s.typography || {};
    put('font', fontStack(typo));
    put('font-size', typo.scale === 'large' ? '16px' : '15px');

    // Logo box: the uploaded logo is scaled to fit inside it, never stretched or cropped.
    put('logo-h', num(U.get(s, 'identity.logoHeight', 36), 20, 64, 36) + 'px');
    put('logo-w', num(U.get(s, 'identity.logoMaxWidth', 200), 60, 360, 200) + 'px');

    // Layout
    var L = s.layout || {};
    put('search-w', ({ narrow: '560px', medium: '720px', wide: '960px', full: '100%' })[L.searchWidth] || '720px');
    put('form-w', ({ narrow: '680px', standard: '820px', wide: '1040px' })[L.formWidth] || '820px');
    var cols = parseInt(L.portalColumns, 10);
    put('cards-cols', cols >= 2 && cols <= 4 ? 'repeat(' + cols + ', minmax(0, 1fr))' : 'repeat(auto-fit, minmax(290px, 1fr))');

    // Hero
    var hero = (s.appearance || {}).heroStyle || 'tinted';
    put('hero-bg', hero === 'brand' ? p.brand
      : hero === 'plain' ? 'transparent'
        : 'radial-gradient(900px 380px at 85% -10%, ' + C.rgba(p.accent, scheme === 'dark' ? 0.18 : 0.2) + ', transparent 70%), '
          + 'radial-gradient(700px 320px at 0% 0%, ' + C.rgba(p.brand, scheme === 'dark' ? 0.22 : 0.08) + ', transparent 72%)');
    if (hero === 'image') {
      // A brand-coloured veil over the photo keeps white text readable whatever the image.
      var veil = C.isDark(p.brand) ? p.brand : C.darken(p.brand, 0.55);
      var o = num(U.get(s, 'appearance.heroOverlay', 60), 0, 90, 60) / 100;
      put('hero-veil', 'linear-gradient(180deg, ' + C.rgba(veil, Math.min(0.95, o + 0.1)) + ', ' + C.rgba(veil, o) + ')');
      put('hero-bg', 'transparent');
    }
    var light = hero === 'brand' || hero === 'image';
    put('hero-text', light ? (hero === 'image' ? '#ffffff' : p.onBrand) : p.text);
    put('hero-muted', light ? (hero === 'image' ? 'rgba(255, 255, 255, .88)' : C.ensureContrast(C.mix(p.onBrand, p.brand, 0.25), p.brand, 4.5)) : p.muted);

    // Atlassian design tokens used by the React parts of the portal, so they follow the theme too.
    var ds = {
      '--ds-text': p.text, '--ds-text-subtle': p.muted, '--ds-text-subtlest': p.subtle,
      '--ds-link': p.brandText, '--ds-link-pressed': p.brandText,
      '--ds-background-brand-bold': p.brand, '--ds-background-brand-bold-hovered': C.shade(p.brand, 1),
      '--ds-background-brand-bold-pressed': C.shade(p.brand, 2),
      '--ds-background-selected': p.brandSoft, '--ds-background-selected-hovered': C.mix(p.brandSoft, p.brand, 0.08),
      '--ds-background-selected-bold': p.brand, '--ds-text-selected': p.brandSoftText, '--ds-icon-selected': p.brandSoftText,
      '--ds-border-focused': p.focus, '--ds-border-selected': p.brand, '--ds-border-input': p.borderStrong,
      '--ds-border': p.border, '--ds-surface': p.surface, '--ds-surface-overlay': p.surface,
      '--ds-surface-raised': p.surface, '--ds-surface-sunken': p.surface2,
      '--ds-background-input': p.surface, '--ds-background-input-hovered': p.surface2,
      '--ds-background-input-pressed': p.surface, '--ds-background-neutral': p.surface3,
      '--ds-background-neutral-subtle-hovered': p.surface3, '--ds-text-inverse': p.onBrand,
      '--ds-text-danger': p.error.fg, '--ds-text-success': p.success.fg, '--ds-text-warning': p.warning.fg,
      '--ds-font-family-body': 'var(--pt-font)', '--ds-font-family-heading': 'var(--pt-font)',
      '--ds-font-family-product': 'var(--pt-font)', '--ds-font-family-sans': 'var(--pt-font)',
      '--ds-border-radius': 'var(--pt-radius-md)', '--ds-border-radius-050': 'var(--pt-radius-xs)',
      '--ds-border-radius-100': 'var(--pt-radius-sm)', '--ds-border-radius-200': 'var(--pt-radius-md)',
      '--ds-border-radius-300': 'var(--pt-radius-lg)',
      '--aui-body-background': 'transparent', '--aui-focus': p.focus, '--aui-link-color': p.brandText,
      '--aui-link-hover-color': p.brandText, '--aui-button-primary-bg-color': p.brand
    };
    for (var k in ds) { if (U.hasOwn.call(ds, k)) { t[k] = ds[k]; } }
    return t;
  }

  function block(selector, map) {
    var out = [];
    for (var k in map) {
      if (U.hasOwn.call(map, k)) { out.push('  ' + k + ': ' + map[k] + ';'); }
    }
    return selector + ' {\n' + out.join('\n') + '\n}\n';
  }

  /**
   * CSS text with all tokens for the settings. selector defaults to "html.pt"; the admin preview
   * passes its own scope. mode: light | dark | auto.
   */
  function css(settings, selector) {
    var sel = selector || 'html.pt';
    var mode = (settings.appearance || {}).mode || 'light';
    if (mode === 'dark') {
      return block(sel, tokenMap(settings, 'dark')) + sel + ' { color-scheme: dark; }\n';
    }
    var out = block(sel, tokenMap(settings, 'light'));
    if (mode === 'auto') {
      out += '@media (prefers-color-scheme: dark) {\n' + block(sel, tokenMap(settings, 'dark')) +
        sel + ' { color-scheme: dark; }\n}\n';
    }
    return out;
  }

  /** Contrast report for the admin page: [{pair, ratio, min, ok}]. */
  function contrastReport(settings) {
    var c = settings.colors || {};
    var raw = function (k, f) { return C.normalize(c[k], f); };
    var bg = raw('background', '#f5f7fa'), surface = raw('surface', '#ffffff');
    var brand = raw('primary', '#16407a'), header = raw('header', surface);
    var pairs = [
      ['text', raw('text', '#0f1b2d'), surface, 4.5],
      ['muted', raw('muted', '#4a5568'), surface, 4.5],
      ['mutedOnBackground', raw('muted', '#4a5568'), bg, 4.5],
      ['brandButton', C.onColor(brand), brand, 4.5],
      ['link', brand, surface, 4.5],
      ['header', C.onColor(header), header, 4.5],
      ['focus', raw('focus', brand), surface, 3],
      ['border', raw('border', '#e2e7ee'), surface, 1.2]
    ];
    return pairs.map(function (p) {
      var ratio = C.contrast(p[1], p[2]);
      return { id: p[0], fg: p[1], bg: p[2], ratio: Math.round(ratio * 100) / 100, min: p[3], ok: ratio >= p[3] };
    });
  }

  PT.tokens = {
    tokenMap: tokenMap,
    css: css,
    contrastReport: contrastReport,
    fontStack: fontStack
  };
})(window.PortalTheme);
