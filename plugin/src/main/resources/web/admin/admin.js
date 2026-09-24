/*!
 * Portal Theme — admin configuration page.
 *
 * A small, dependency-free script application inside Jira's admin decorator. It edits one draft
 * document, renders a live preview through the same token engine the portal uses, and talks to
 * /plugins/servlet/portal-theme/api/* (admin-only, WebSudo, CSRF header).
 */
(function (win, doc) {
  'use strict';

  var PT = win.PortalTheme;
  var U = PT.util;
  var root = doc.getElementById('pt-admin');
  if (!root || !PT.presets || !PT.tokens) { return; }

  var BASE = (root.getAttribute('data-context-path') || U.contextPath()) + '/plugins/servlet/portal-theme';
  var LANG_KEY = 'portalTheme.adminLang';

  var lang = (function () {
    try { var s = win.localStorage.getItem(LANG_KEY); if (s === 'fa' || s === 'en') { return s; } } catch (e) { /* ignore */ }
    return /^fa/i.test(doc.documentElement.getAttribute('lang') || '') ? 'fa' : 'en';
  })();
  var T = PT.adminI18n[lang];

  var state = {
    saved: null,      // normalised document as stored
    draft: null,      // document being edited
    assets: {},       // { logo: {hash,type,bytes}, … }
    tab: 'identity',
    viewport: 'desktop',
    busy: false
  };

  // ------------------------------------------------------------------ helpers

  function el(tag, attrs, children) {
    var e = doc.createElement(tag);
    if (attrs) {
      for (var k in attrs) {
        if (!U.hasOwn.call(attrs, k) || attrs[k] == null || attrs[k] === false) { continue; }
        if (k === 'text') { e.textContent = attrs[k]; } else if (k === 'html') { e.innerHTML = attrs[k]; } else if (k.indexOf('on') === 0) {
          e.addEventListener(k.slice(2), attrs[k]);
        } else { e.setAttribute(k, attrs[k] === true ? '' : attrs[k]); }
      }
    }
    (children || []).forEach(function (c) { if (c) { e.appendChild(typeof c === 'string' ? doc.createTextNode(c) : c); } });
    return e;
  }

  function getPath(obj, path) { return U.get(obj, path, undefined); }

  function setPath(obj, path, value) {
    var parts = path.split('.');
    var cur = obj;
    for (var i = 0; i < parts.length - 1; i++) {
      if (!U.isPlainObject(cur[parts[i]])) { cur[parts[i]] = {}; }
      cur = cur[parts[i]];
    }
    cur[parts[parts.length - 1]] = value;
  }

  function effective() { return PT.presets.effective(state.draft, null); }
  function value(path) { return getPath(effective(), path); }

  function label(path) { return (T.fields[path] || [path, ''])[0]; }
  function help(path) { return (T.fields[path] || ['', ''])[1]; }
  function opt(v) { return T.options[v] || v; }

  var uid = 0;
  function id(prefix) { uid += 1; return 'pt-a-' + prefix + '-' + uid; }

  function dirty() { return JSON.stringify(state.draft) !== JSON.stringify(state.saved); }

  function api(method, path, body) {
    return new Promise(function (resolve, reject) {
      var xhr = new XMLHttpRequest();
      xhr.open(method, BASE + '/api' + path);
      xhr.setRequestHeader('Accept', 'application/json');
      if (method !== 'GET') {
        xhr.setRequestHeader('Content-Type', 'application/json');
        xhr.setRequestHeader('X-Portal-Theme', '1');
      }
      xhr.onload = function () {
        var data = null;
        try { data = JSON.parse(xhr.responseText); } catch (e) { /* non-JSON */ }
        if (xhr.status >= 200 && xhr.status < 300) { resolve(data || {}); return; }
        var msg = data && data.error ? data.error : 'HTTP ' + xhr.status;
        if (data && data.websudo) { msg = T.websudo; }
        reject(new Error(msg));
      };
      xhr.onerror = function () { reject(new Error('Network error')); };
      xhr.send(method === 'GET' ? null : JSON.stringify(body || {}));
    });
  }

  // ------------------------------------------------------------------ status line (aria-live)

  var statusEl;
  function status(msg, kind) {
    if (!statusEl) { return; }
    statusEl.textContent = msg || '';
    statusEl.className = 'pt-a-status' + (kind ? ' is-' + kind : '');
  }

  // ------------------------------------------------------------------ field renderers

  function fieldWrap(path, control, controlId, extraClass) {
    var h = help(path);
    var helpId = h ? id('help') : null;
    if (helpId && control.setAttribute) { control.setAttribute('aria-describedby', helpId); }
    return el('div', { class: 'pt-a-field' + (extraClass ? ' ' + extraClass : '') }, [
      el('label', { for: controlId, class: 'pt-a-label', text: label(path) }),
      control,
      h ? el('p', { id: helpId, class: 'pt-a-help', text: h }) : null
    ]);
  }

  function textField(path, opts) {
    opts = opts || {};
    var cid = id('f');
    var input = el(opts.multiline ? 'textarea' : 'input', {
      id: cid, class: 'pt-a-input' + (opts.code ? ' is-code' : ''), type: opts.multiline ? null : (opts.type || 'text'),
      dir: opts.dir || 'auto', rows: opts.multiline ? (opts.rows || 3) : null, spellcheck: opts.code ? 'false' : null
    });
    input.value = value(path) == null ? '' : value(path);
    input.addEventListener('input', function () { update(path, input.value); });
    return fieldWrap(path, input, cid);
  }

  function selectField(path, options) {
    var cid = id('f');
    var select = el('select', { id: cid, class: 'pt-a-input' }, options.map(function (o) {
      return el('option', { value: o, text: opt(o) });
    }));
    select.value = String(value(path));
    select.addEventListener('change', function () { update(path, select.value); rerenderSoon(); });
    return fieldWrap(path, select, cid);
  }

  function toggleField(path) {
    var cid = id('f');
    var input = el('input', { id: cid, type: 'checkbox', class: 'pt-a-switch', role: 'switch' });
    input.checked = value(path) !== false && value(path) != null;
    input.addEventListener('change', function () { update(path, input.checked); rerenderSoon(); });
    var h = help(path);
    var helpId = h ? id('help') : null;
    if (helpId) { input.setAttribute('aria-describedby', helpId); }
    return el('div', { class: 'pt-a-field pt-a-field--toggle' }, [
      el('div', { class: 'pt-a-toggle-row' }, [input, el('label', { for: cid, class: 'pt-a-label', text: label(path) })]),
      h ? el('p', { id: helpId, class: 'pt-a-help', text: h }) : null
    ]);
  }

  function rangeField(path, min, max, unit) {
    var cid = id('f');
    var out = el('output', { for: cid, class: 'pt-a-range-value' });
    var input = el('input', { id: cid, type: 'range', min: min, max: max, step: 1, class: 'pt-a-range' });
    input.value = value(path);
    out.textContent = input.value + (unit || '');
    input.addEventListener('input', function () { out.textContent = input.value + (unit || ''); update(path, Number(input.value)); });
    var wrap = fieldWrap(path, el('div', { class: 'pt-a-range-row' }, [input, out]), cid);
    return wrap;
  }

  function colorField(path) {
    var cid = id('f');
    var v = PT.color.normalize(value(path), '#000000');
    var picker = el('input', { type: 'color', class: 'pt-a-color', 'aria-label': label(path) });
    var text = el('input', { id: cid, type: 'text', class: 'pt-a-input pt-a-hex', dir: 'ltr', maxlength: 7, spellcheck: 'false', autocomplete: 'off' });
    picker.value = v;
    text.value = v;
    picker.addEventListener('input', function () { text.value = picker.value; text.removeAttribute('aria-invalid'); update(path, picker.value); });
    text.addEventListener('input', function () {
      var t = text.value.trim();
      if (!/^#/.test(t)) { t = '#' + t; }
      if (PT.color.valid(t)) {
        text.removeAttribute('aria-invalid');
        picker.value = PT.color.normalize(t);
        update(path, PT.color.normalize(t));
      } else {
        text.setAttribute('aria-invalid', 'true');
      }
    });
    return fieldWrap(path, el('div', { class: 'pt-a-color-row' }, [picker, text]), cid, 'pt-a-field--color');
  }

  /** Editable list of rows, e.g. dictionary entries or footer links. */
  function rowsField(path, cols, read, write) {
    var rows = read();
    var list = el('div', { class: 'pt-a-rows', role: 'group', 'aria-label': label(path) });
    function commit() { write(rows); }
    function draw() {
      list.innerHTML = '';
      rows.forEach(function (row, idx) {
        var line = el('div', { class: 'pt-a-row' });
        cols.forEach(function (c) {
          var inp = el('input', { type: 'text', class: 'pt-a-input', dir: c.dir || 'auto', 'aria-label': c.label + ' ' + (idx + 1), placeholder: c.label });
          inp.value = row[c.key] || '';
          inp.addEventListener('input', function () { row[c.key] = inp.value; commit(); });
          line.appendChild(inp);
        });
        line.appendChild(el('button', {
          type: 'button', class: 'pt-a-btn pt-a-btn--icon', 'aria-label': T.remove + ' ' + (idx + 1), text: '×',
          onclick: function () { rows.splice(idx, 1); commit(); draw(); }
        }));
        list.appendChild(line);
      });
    }
    draw();
    var add = el('button', {
      type: 'button', class: 'pt-a-btn pt-a-btn--ghost', text: '+ ' + T.addRow,
      onclick: function () {
        var r = {};
        cols.forEach(function (c) { r[c.key] = ''; });
        rows.push(r);
        draw();
        var inputs = list.querySelectorAll('input');
        if (inputs.length) { inputs[inputs.length - cols.length].focus(); }
      }
    });
    var h = help(path);
    return el('div', { class: 'pt-a-field pt-a-field--wide' }, [
      el('div', { class: 'pt-a-label', text: label(path) }),
      h ? el('p', { class: 'pt-a-help', text: h }) : null,
      list, add
    ]);
  }

  function imageField(slot) {
    var info = state.assets[slot];
    var fileId = id('file');
    var preview = el('div', { class: 'pt-a-image-preview' + (slot === 'logoDark' ? ' is-dark' : '') });
    if (info) {
      preview.appendChild(el('img', { src: BASE + '/asset/' + slot + '?v=' + encodeURIComponent(info.hash), alt: '' }));
    } else {
      preview.appendChild(el('span', { class: 'pt-a-muted', text: T.noImage }));
    }
    var file = el('input', { id: fileId, type: 'file', accept: 'image/png,image/jpeg,image/webp,image/gif,image/svg+xml,image/x-icon,.ico', class: 'pt-a-file' });
    file.addEventListener('change', function () {
      var f = file.files && file.files[0];
      if (!f) { return; }
      var reader = new FileReader();
      reader.onload = function () {
        status(T.uploading);
        api('PUT', '/asset/' + slot, { dataUrl: reader.result }).then(function (res) {
          state.assets = res.assets || {};
          status(T.saved, 'ok');
          render();
        }, function (err) { status(T.saveError + err.message, 'error'); });
      };
      reader.readAsDataURL(f);
    });
    var actions = el('div', { class: 'pt-a-image-actions' }, [
      el('label', { for: fileId, class: 'pt-a-btn', text: info ? T.replace : T.upload }),
      file,
      info ? el('button', {
        type: 'button', class: 'pt-a-btn pt-a-btn--ghost', text: T.remove,
        onclick: function () {
          api('DELETE', '/asset/' + slot, {}).then(function (res) { state.assets = res.assets || {}; render(); },
            function (err) { status(T.saveError + err.message, 'error'); });
        }
      }) : null
    ]);
    var h = help(slot);
    return el('div', { class: 'pt-a-field pt-a-field--image' }, [
      el('div', { class: 'pt-a-label', text: label(slot) }),
      preview, actions,
      el('p', { class: 'pt-a-help', text: (h ? h + ' ' : '') + T.imageHelp })
    ]);
  }

  function section(title, children, desc) {
    return el('section', { class: 'pt-a-section' }, [
      title ? el('h3', { class: 'pt-a-section-title', text: title }) : null,
      desc ? el('p', { class: 'pt-a-help', text: desc }) : null,
      el('div', { class: 'pt-a-grid' }, children)
    ]);
  }

  // ------------------------------------------------------------------ tabs

  var TABS = {
    identity: function () {
      var presetSelect = el('select', { id: 'pt-a-preset', class: 'pt-a-input' }, Object.keys(PT.presets.PRESETS).map(function (k) {
        return el('option', { value: k, text: PT.presets.PRESETS[k].name[lang] });
      }));
      presetSelect.value = state.draft.preset;
      return [
        section(null, [
          el('div', { class: 'pt-a-field pt-a-field--wide pt-a-preset' }, [
            el('label', { for: 'pt-a-preset', class: 'pt-a-label', text: T.presets }),
            el('div', { class: 'pt-a-inline' }, [presetSelect, el('button', {
              type: 'button', class: 'pt-a-btn', text: T.applyPreset,
              onclick: function () {
                if (!win.confirm(T.presetConfirm)) { return; }
                var fresh = PT.presets.documentFromPreset(presetSelect.value);
                fresh.enabled = state.draft.enabled;
                fresh.portals = state.draft.portals;
                state.draft = fresh;
                render();
              }
            })])
          ])
        ]),
        section(null, [
          textField('identity.companyName'),
          toggleField('identity.showName'),
          imageField('logo'),
          imageField('logoDark'),
          rangeField('identity.logoHeight', 20, 64, 'px'),
          rangeField('identity.logoMaxWidth', 60, 360, 'px'),
          textField('identity.logoAlt')
        ])
      ];
    },
    colors: function () {
      var brand = ['primary', 'accent', 'header'].map(function (k) { return colorField('colors.' + k); });
      var neutral = ['background', 'surface', 'text', 'muted', 'border', 'focus'].map(function (k) { return colorField('colors.' + k); });
      var st = ['success', 'warning', 'error'].map(function (k) { return colorField('colors.' + k); });
      return [section(null, brand), section(null, neutral), section(null, st), contrastPanel()];
    },
    appearance: function () {
      return [section(null, [
        rangeField('shape.radius', 0, 24, 'px'),
        selectField('shape.cardStyle', ['elevated', 'outlined', 'flat']),
        selectField('shape.shadow', ['none', 'soft', 'medium']),
        selectField('shape.density', ['comfortable', 'compact']),
        selectField('shape.contentWidth', ['narrow', 'standard', 'wide']),
        selectField('appearance.heroStyle', ['tinted', 'plain', 'brand']),
        selectField('appearance.mode', ['light', 'dark', 'auto']),
        selectField('features.iconStyle', ['tinted', 'original', 'mono']),
        selectField('typography.font', ['vazirmatn', 'system', 'custom']),
        value('typography.font') === 'custom' ? textField('typography.customStack', { dir: 'ltr', code: true }) : null,
        selectField('typography.scale', ['default', 'large']),
        selectField('motion.level', ['full', 'reduced', 'off'])
      ])];
    },
    texts: function () {
      var t = function (k, multi) { return textField('texts.' + k, multi ? { multiline: true, rows: 2 } : null); };
      return [
        section(null, [t('homeTitle'), t('homeSubtitle', true), t('searchPlaceholder'), t('portalsHeading'), t('requestTypesHeading')]),
        section(null, [t('emptyRequestsTitle'), t('emptyRequestsBody', true), t('emptySearchTitle'), t('emptySearchBody', true), t('createSuccess', true)]),
        section(null, [t('loginTitle'), t('loginSubtitle', true)]),
        section(null, [t('footerText'), t('copyright'), t('supportTitle'), t('supportText', true),
          textField('texts.supportEmail', { type: 'email', dir: 'ltr' }), textField('texts.supportPhone', { type: 'tel', dir: 'ltr' }), t('supportHours')])
      ];
    },
    language: function () {
      return [
        section(null, [
          selectField('locale.direction', ['rtl', 'ltr']),
          selectField('locale.language', ['fa', 'en']),
          toggleField('locale.translate'),
          toggleField('locale.persianDigits')
        ]),
        section(null, [
          rowsField('dictionary', [{ key: 'from', label: T.jiraText, dir: 'ltr' }, { key: 'to', label: T.yourText }],
            function () {
              var d = getPath(state.draft.global, 'dictionary') || {};
              return Object.keys(d).map(function (k) { return { from: k, to: d[k] }; });
            },
            function (rows) {
              var d = {};
              rows.forEach(function (r) { if (r.from && r.from.trim()) { d[r.from.trim()] = r.to || ''; } });
              update('dictionary', d);
            }),
          rowsField('patterns', [{ key: 'source', label: T.jiraText, dir: 'ltr' }, { key: 'target', label: T.yourText }],
            function () { return (getPath(state.draft.global, 'patterns') || []).map(function (p) { return { source: p.source, target: p.target }; }); },
            function (rows) { update('patterns', rows.filter(function (r) { return r.source && r.source.trim(); })); })
        ])
      ];
    },
    navigation: function () {
      var btj = value('backToJira.enabled');
      return [
        section(null, [
          toggleField('backToJira.enabled'),
          btj ? textField('backToJira.label') : null,
          btj ? textField('backToJira.url', { dir: 'ltr' }) : null,
          btj ? selectField('backToJira.audience', ['jira-users', 'authenticated']) : null,
          btj ? toggleField('backToJira.newTab') : null,
          btj ? toggleField('backToJira.showIcon') : null
        ]),
        section(null, [
          toggleField('footer.enabled'),
          value('footer.enabled') !== false ? rowsField('footer.links', [{ key: 'label', label: T.label }, { key: 'url', label: T.url, dir: 'ltr' }],
            function () { return (value('footer.links') || []).map(function (l) { return { label: l.label, url: l.url }; }); },
            function (rows) { update('footer.links', rows.filter(function (r) { return r.label || r.url; })); }) : null
        ]),
        section(null, [
          toggleField('features.hideJiraBranding'),
          toggleField('features.hideAdminTools'),
          toggleField('features.pageTitle'),
          toggleField('features.statusColors'),
          toggleField('features.favicon'),
          imageField('favicon')
        ])
      ];
    },
    advanced: function () {
      var cssId = id('f');
      var css = el('textarea', { id: cssId, class: 'pt-a-input is-code', rows: 10, dir: 'ltr', spellcheck: 'false' });
      css.value = value('customCss') || '';
      css.addEventListener('input', function () { update('customCss', css.value); });

      var jsonId = id('f');
      var json = el('textarea', { id: jsonId, class: 'pt-a-input is-code', rows: 8, dir: 'ltr', spellcheck: 'false' });
      json.value = JSON.stringify(state.draft.portals || {}, null, 2);
      var jsonErr = el('p', { class: 'pt-a-error', role: 'alert' });
      json.addEventListener('input', function () {
        try {
          var v = JSON.parse(json.value || '{}');
          if (!U.isPlainObject(v)) { throw new Error('object expected'); }
          jsonErr.textContent = '';
          json.removeAttribute('aria-invalid');
          state.draft.portals = v;
          changed();
        } catch (e) {
          jsonErr.textContent = T.jsonInvalid;
          json.setAttribute('aria-invalid', 'true');
        }
      });
      return [
        section(null, [fieldWrap('customCss', css, cssId, 'pt-a-field--wide')]),
        section(null, [fieldWrap('portals', json, jsonId, 'pt-a-field--wide'), jsonErr]),
        section(T.bypassTitle, [el('p', { class: 'pt-a-help', text: T.bypassText })])
      ];
    }
  };

  function contrastPanel() {
    var report = PT.tokens.contrastReport(effective());
    return el('section', { class: 'pt-a-section' }, [
      el('h3', { class: 'pt-a-section-title', text: T.contrast }),
      el('ul', { class: 'pt-a-contrast' }, report.map(function (r) {
        return el('li', { class: r.ok ? 'is-ok' : 'is-low' }, [
          el('span', { class: 'pt-a-swatch', style: 'background:' + r.bg + ';color:' + r.fg, text: 'Aa', 'aria-hidden': 'true' }),
          el('span', { class: 'pt-a-contrast-name', text: T.pairs[r.id] || r.id }),
          el('span', { class: 'pt-a-contrast-ratio', dir: 'ltr', text: r.ratio.toFixed(2) + ':1' }),
          el('span', { class: 'pt-a-contrast-verdict', text: r.ok ? T.contrastOk : T.contrastLow })
        ]);
      }))
    ]);
  }

  // ------------------------------------------------------------------ preview

  function previewHtml(s) {
    var t = s.texts || {};
    var e = U.escapeHtml;
    var company = e(U.get(s, 'identity.companyName', ''));
    var logo = state.assets.logo ? '<img class="pv-logo" alt="" src="' + e(BASE + '/asset/logo?v=' + state.assets.logo.hash) + '">' : '';
    var logoDark = state.assets.logoDark ? '<img class="pv-logo" alt="" src="' + e(BASE + '/asset/logoDark?v=' + state.assets.logoDark.hash) + '">' : '';
    var headerDark = PT.color.isDark(PT.color.normalize(U.get(s, 'colors.header', '#ffffff'), '#ffffff'));
    var mark = (headerDark && logoDark) ? logoDark : (logo || logoDark);
    var brand = (mark || '<span class="pv-mark">' + e((company || '•').charAt(0)) + '</span>') +
      (U.get(s, 'identity.showName', true) !== false || !mark ? '<span class="pv-name">' + company + '</span>' : '');
    var fa = U.get(s, 'locale.language', 'fa') === 'fa';
    var L = fa ? {
      requests: 'درخواست‌ها', it: 'پشتیبانی فناوری اطلاعات', itd: 'مشکلات رایانه، شبکه و دسترسی‌ها',
      hr: 'منابع انسانی', hrd: 'گواهی اشتغال، مرخصی و امور اداری', summary: 'عنوان', desc: 'شرح',
      err: 'پر کردن این بخش الزامی است.', send: 'ثبت درخواست', cancel: 'انصراف',
      rows: [['SD-128', 'دسترسی به سامانه‌ی حقوق', 'در حال انجام', 'progress'], ['SD-121', 'تعویض کارتریج چاپگر', 'انجام‌شده', 'done'], ['SD-119', 'VPN connection drops', 'در انتظار پاسخ شما', 'waiting']]
    } : {
      requests: 'Requests', it: 'IT support', itd: 'Computers, network and access', hr: 'Human resources', hrd: 'Letters, leave and admin',
      summary: 'Summary', desc: 'Description', err: 'This field is required.', send: 'Send', cancel: 'Cancel',
      rows: [['SD-128', 'Payroll system access', 'In progress', 'progress'], ['SD-121', 'Printer cartridge', 'Done', 'done'], ['SD-119', 'VPN connection drops', 'Waiting for customer', 'waiting']]
    };
    var back = U.get(s, 'backToJira.enabled', false) ? '<span class="pv-headbtn pv-back">' + e(U.get(s, 'backToJira.label', '')) + '</span>' : '';
    return '' +
      '<div class="pv-header"><div class="pv-brand">' + brand + '</div><div class="pv-nav">' + back +
      '<span class="pv-headbtn">' + L.requests + ' <b class="pv-badge">۳</b></span><span class="pv-avatar"></span></div></div>' +
      '<div class="pv-hero"><h1>' + e(t.homeTitle) + '</h1><p>' + e(t.homeSubtitle) + '</p>' +
      '<div class="pv-search"><span class="pv-search-icon"></span>' + e(t.searchPlaceholder) + '</div></div>' +
      '<div class="pv-body"><h2 class="pv-section">' + e(t.portalsHeading) + '</h2>' +
      '<div class="pv-grid"><div class="pv-card"><span class="pv-tile"></span><div><strong>' + L.it + '</strong><p>' + L.itd + '</p></div></div>' +
      '<div class="pv-card"><span class="pv-tile"></span><div><strong>' + L.hr + '</strong><p>' + L.hrd + '</p></div></div></div>' +
      '<div class="pv-form"><label>' + L.summary + ' <span class="pv-req">*</span></label><div class="pv-input pv-input--error"></div>' +
      '<p class="pv-error">' + L.err + '</p><label>' + L.desc + '</label><div class="pv-input pv-input--focus"></div>' +
      '<div class="pv-actions"><span class="pv-btn pv-btn--primary">' + L.send + '</span><span class="pv-btn">' + L.cancel + '</span></div></div>' +
      '<div class="pv-list">' + L.rows.map(function (r) {
        return '<div class="pv-row"><span class="pv-key" dir="ltr">' + r[0] + '</span><span class="pv-sum" dir="auto">' + e(r[1]) + '</span>' +
          '<span class="pv-pill" data-st="' + r[3] + '">' + e(r[2]) + '</span></div>';
      }).join('') + '</div></div>' +
      '<div class="pv-footer">' + e(t.footerText) + '</div>';
  }

  var previewFrame, previewStyle;
  function renderPreview() {
    if (!previewFrame) { return; }
    var s = effective();
    previewStyle.textContent = PT.tokens.css(s, '.pt-preview');
    previewFrame.setAttribute('dir', U.get(s, 'locale.direction', 'rtl') === 'ltr' ? 'ltr' : 'rtl');
    previewFrame.setAttribute('lang', U.get(s, 'locale.language', 'fa'));
    previewFrame.setAttribute('data-card', U.get(s, 'shape.cardStyle', 'elevated'));
    previewFrame.setAttribute('data-hero', U.get(s, 'appearance.heroStyle', 'tinted'));
    previewFrame.className = 'pt-preview is-' + state.viewport;
    previewFrame.innerHTML = previewHtml(s);
  }

  // ------------------------------------------------------------------ state changes

  function update(path, v) {
    setPath(state.draft.global, path, v);
    changed();
  }

  var previewQueued = false;
  function changed() {
    toolbarState();
    if (previewQueued) { return; }
    previewQueued = true;
    win.requestAnimationFrame(function () {
      previewQueued = false;
      renderPreview();
      var c = root.querySelector('.pt-a-contrast');
      if (c && state.tab === 'colors') { c.parentNode.replaceWith(contrastPanel()); }
    });
  }

  var rerenderTimer = null;
  function rerenderSoon() {
    // Some fields show/hide others (e.g. Back to Jira options). Keep focus on the changed control.
    win.clearTimeout(rerenderTimer);
    rerenderTimer = win.setTimeout(function () {
      var active = doc.activeElement;
      var activeLabel = active && active.id ? root.querySelector('label[for="' + active.id + '"]') : null;
      var text = activeLabel ? activeLabel.textContent : null;
      renderPanel();
      if (text) {
        var labels = root.querySelectorAll('.pt-a-panel label');
        for (var i = 0; i < labels.length; i++) {
          if (labels[i].textContent === text) { var c = doc.getElementById(labels[i].getAttribute('for')); if (c) { c.focus(); } break; }
        }
      }
    }, 0);
  }

  var saveBtn, discardBtn, dirtyEl, enabledInput;
  function toolbarState() {
    var d = dirty();
    saveBtn.disabled = !d || state.busy;
    discardBtn.hidden = !d;
    dirtyEl.hidden = !d;
    enabledInput.checked = state.draft.enabled !== false;
    enabledInput.nextSibling.textContent = state.draft.enabled !== false ? T.enabled : T.disabled;
  }

  function save() {
    state.busy = true;
    toolbarState();
    status(T.saving);
    api('PUT', '/config', state.draft).then(function (res) {
      state.busy = false;
      accept(res);
      var w = res.warnings && res.warnings.length ? ' ' + T.warnings + ' ' + res.warnings.join(' · ') : '';
      status(T.saved + w, w ? 'warn' : 'ok');
    }, function (err) {
      state.busy = false;
      toolbarState();
      status(T.saveError + err.message, 'error');
    });
  }

  function accept(res) {
    state.assets = res.assets || {};
    var doc0 = res.config ? PT.presets.normalizeDocument(res.config) : PT.presets.documentFromPreset('persian');
    if (res.config && !U.isPlainObject(res.config.global)) { doc0.global = {}; }
    // The draft stores complete settings so every field shows its effective value.
    doc0.global = PT.presets.effective(doc0, null);
    state.saved = U.clone(doc0);
    state.draft = U.clone(doc0);
    render();
  }

  function exportJson() {
    api('GET', '/export').then(function (res) {
      var blob = new Blob([JSON.stringify(res, null, 2)], { type: 'application/json' });
      var a = el('a', { href: URL.createObjectURL(blob), download: 'portal-theme.json' });
      doc.body.appendChild(a);
      a.click();
      win.setTimeout(function () { URL.revokeObjectURL(a.href); a.parentNode.removeChild(a); }, 0);
    }, function (err) { status(err.message, 'error'); });
  }

  function importJson(file) {
    var reader = new FileReader();
    reader.onload = function () {
      var parsed;
      try { parsed = JSON.parse(reader.result); } catch (e) { status(T.jsonInvalid, 'error'); return; }
      if (!win.confirm(T.importConfirm)) { return; }
      var body = parsed && parsed.config ? parsed : { config: parsed, assets: {} };
      api('POST', '/import', body).then(function (res) {
        accept(res);
        status(T.saved, 'ok');
      }, function (err) { status(T.saveError + err.message, 'error'); });
    };
    reader.readAsText(file);
  }

  function reset() {
    if (!win.confirm(T.resetConfirm)) { return; }
    api('POST', '/reset', {}).then(function (res) { accept(res); status(T.saved, 'ok'); },
      function (err) { status(T.saveError + err.message, 'error'); });
  }

  function previewOnPortal() {
    try { win.localStorage.setItem('portalTheme.preview', JSON.stringify({ config: state.draft })); } catch (e) { /* ignore */ }
    win.open(U.contextPath() + '/servicedesk/customer/portals?portalTheme=preview', '_blank', 'noopener');
  }

  // ------------------------------------------------------------------ layout

  var panelEl;
  function renderPanel() {
    panelEl.innerHTML = '';
    var tabs = root.querySelectorAll('.pt-a-tab');
    for (var i = 0; i < tabs.length; i++) {
      var on = tabs[i].getAttribute('data-tab') === state.tab;
      tabs[i].setAttribute('aria-selected', on ? 'true' : 'false');
      tabs[i].tabIndex = on ? 0 : -1;
    }
    panelEl.setAttribute('aria-labelledby', 'pt-a-tab-' + state.tab);
    TABS[state.tab]().forEach(function (n) { if (n) { panelEl.appendChild(n); } });
  }

  function render() {
    root.innerHTML = '';
    root.setAttribute('dir', lang === 'fa' ? 'rtl' : 'ltr');
    root.setAttribute('lang', lang);

    enabledInput = el('input', { type: 'checkbox', role: 'switch', class: 'pt-a-switch', id: 'pt-a-enabled' });
    enabledInput.addEventListener('change', function () { state.draft.enabled = enabledInput.checked; changed(); });
    saveBtn = el('button', { type: 'button', class: 'pt-a-btn pt-a-btn--primary', text: T.save, onclick: save });
    discardBtn = el('button', { type: 'button', class: 'pt-a-btn pt-a-btn--ghost', text: T.discard, onclick: function () { state.draft = U.clone(state.saved); render(); } });
    dirtyEl = el('span', { class: 'pt-a-dirty', text: T.unsaved });
    var importInput = el('input', { type: 'file', accept: 'application/json,.json', class: 'pt-a-file', id: 'pt-a-import' });
    importInput.addEventListener('change', function () { if (importInput.files[0]) { importJson(importInput.files[0]); } importInput.value = ''; });

    var header = el('header', { class: 'pt-a-header' }, [
      el('div', { class: 'pt-a-heading' }, [
        el('h2', { class: 'pt-a-title', text: T.title }),
        el('p', { class: 'pt-a-subtitle', text: T.subtitle })
      ]),
      el('div', { class: 'pt-a-toolbar' }, [
        el('label', { class: 'pt-a-master', for: 'pt-a-enabled' }, [enabledInput, el('span', { text: '' })]),
        dirtyEl, discardBtn,
        el('button', { type: 'button', class: 'pt-a-btn', text: T.preview, onclick: previewOnPortal }),
        saveBtn
      ])
    ]);

    var tabList = el('div', { class: 'pt-a-tabs', role: 'tablist', 'aria-orientation': 'vertical' }, Object.keys(TABS).map(function (k) {
      return el('button', {
        type: 'button', role: 'tab', id: 'pt-a-tab-' + k, class: 'pt-a-tab', 'data-tab': k, 'aria-controls': 'pt-a-panel', text: T.tabs[k],
        onclick: function () { state.tab = k; renderPanel(); }
      });
    }));
    tabList.addEventListener('keydown', function (e) {
      var keys = Object.keys(TABS);
      var i = keys.indexOf(state.tab);
      var next = null;
      if (e.key === 'ArrowDown' || e.key === 'ArrowRight' && lang !== 'fa' || e.key === 'ArrowLeft' && lang === 'fa') { next = keys[(i + 1) % keys.length]; }
      if (e.key === 'ArrowUp' || e.key === 'ArrowLeft' && lang !== 'fa' || e.key === 'ArrowRight' && lang === 'fa') { next = keys[(i - 1 + keys.length) % keys.length]; }
      if (e.key === 'Home') { next = keys[0]; }
      if (e.key === 'End') { next = keys[keys.length - 1]; }
      if (next) { e.preventDefault(); state.tab = next; renderPanel(); doc.getElementById('pt-a-tab-' + next).focus(); }
    });

    var side = el('div', { class: 'pt-a-side' }, [
      tabList,
      el('div', { class: 'pt-a-side-actions' }, [
        el('button', { type: 'button', class: 'pt-a-btn pt-a-btn--ghost', text: T.exportJson, onclick: exportJson }),
        el('label', { for: 'pt-a-import', class: 'pt-a-btn pt-a-btn--ghost', text: T.importJson }), importInput,
        el('button', { type: 'button', class: 'pt-a-btn pt-a-btn--danger', text: T.reset, onclick: reset }),
        el('button', {
          type: 'button', class: 'pt-a-btn pt-a-btn--ghost pt-a-lang', text: T.language, lang: lang === 'fa' ? 'en' : 'fa',
          onclick: function () {
            lang = lang === 'fa' ? 'en' : 'fa';
            T = PT.adminI18n[lang];
            try { win.localStorage.setItem(LANG_KEY, lang); } catch (e) { /* ignore */ }
            render();
          }
        })
      ])
    ]);

    panelEl = el('div', { class: 'pt-a-panel', id: 'pt-a-panel', role: 'tabpanel', tabindex: '0' });

    previewStyle = el('style');
    previewFrame = el('div', { class: 'pt-preview', 'aria-hidden': 'true' });
    var vpDesk = el('button', { type: 'button', class: 'pt-a-seg', 'aria-pressed': state.viewport === 'desktop' ? 'true' : 'false', text: T.desktop,
      onclick: function () { state.viewport = 'desktop'; render(); } });
    var vpMob = el('button', { type: 'button', class: 'pt-a-seg', 'aria-pressed': state.viewport === 'mobile' ? 'true' : 'false', text: T.mobile,
      onclick: function () { state.viewport = 'mobile'; render(); } });
    var previewCol = el('aside', { class: 'pt-a-preview', 'aria-label': T.previewTitle }, [
      el('div', { class: 'pt-a-preview-head' }, [el('h3', { class: 'pt-a-section-title', text: T.previewTitle }),
        el('div', { class: 'pt-a-segmented', role: 'group' }, [vpDesk, vpMob])]),
      previewStyle,
      el('div', { class: 'pt-a-preview-stage' }, [previewFrame])
    ]);

    statusEl = el('p', { class: 'pt-a-status', role: 'status', 'aria-live': 'polite' });

    root.appendChild(header);
    root.appendChild(statusEl);
    root.appendChild(el('div', { class: 'pt-a-layout' }, [side, panelEl, previewCol]));
    renderPanel();
    renderPreview();
    toolbarState();
  }

  win.addEventListener('beforeunload', function (e) {
    if (state.draft && dirty()) { e.preventDefault(); e.returnValue = ''; }
  });

  api('GET', '/state').then(accept, function (err) {
    root.innerHTML = '';
    root.appendChild(el('div', { class: 'aui-message aui-message-error', role: 'alert' }, [el('p', { text: T.loadError + ' ' + err.message })]));
  });
})(window, document);
