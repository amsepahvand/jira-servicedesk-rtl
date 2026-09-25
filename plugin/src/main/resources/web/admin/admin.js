/*!
 * Parsira — admin configuration page.
 *
 * A small, dependency-free script application inside Jira's admin decorator. It edits one draft
 * document, renders a live preview through the same token engine the portal uses, and talks to
 * /plugins/servlet/portal-theme/api/* (admin-only, WebSudo, CSRF header).
 */
(function (win, doc) {
  'use strict';

  // Jira may load this script in <head>, before the page body exists: start once the DOM is ready.
  function boot() {

  var PT = win.PortalTheme;
  var U = PT.util;
  var root = doc.getElementById('pt-admin');
  if (!root || !PT.presets || !PT.tokens) { return; }

  var BASE = (root.getAttribute('data-context-path') || U.contextPath()) + '/plugins/servlet/portal-theme';
  var LANG_KEY = 'portalTheme.adminLang';

  var lang = (function () {
    try { var s = win.localStorage.getItem(LANG_KEY); if (s === 'fa' || s === 'en') { return s; } } catch (e) { /* ignore */ }
    return 'fa';
  })();
  var T = PT.adminI18n[lang];

  var state = {
    saved: null,      // normalised document as stored
    draft: null,      // document being edited
    assets: {},       // { logo: {hash,type,bytes}, … }
    tab: 'overview',
    viewport: 'desktop',
    previewPage: 'home',
    meta: null,       // { updatedAt, updatedBy } of the stored document
    jiraVersion: '',
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
    var show = function () {
      var u = unit === 'px' ? (lang === 'fa' ? ' پیکسل' : ' px') : (unit || '');
      out.textContent = (lang === 'fa' ? U.toPersianDigits(input.value) : input.value) + u;
    };
    show();
    input.addEventListener('input', function () { show(); update(path, Number(input.value)); });
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

  // Upload rules per image slot: output size, byte budget, crop suggestion.
  var IMAGE_SLOTS = {
    logo: { maxW: 1200, maxH: 480, maxBytes: 500 * 1024 },
    logoDark: { maxW: 1200, maxH: 480, maxBytes: 500 * 1024 },
    favicon: { maxW: 256, maxH: 256, maxBytes: 120 * 1024, ratio: 1 },
    background: { maxW: 2400, maxH: 1000, maxBytes: 1400 * 1024, photo: true, ratio: 16 / 5, suggest: 16 / 5 }
  };

  function uploadImage(slot, file, fieldEl) {
    var err = fieldEl.querySelector('.pt-a-error');
    err.textContent = '';
    var opts = IMAGE_SLOTS[slot];
    PT.adminCrop.prepare(file, opts, T.crop).then(function (dataUrl) {
      if (!dataUrl) { return null; }
      fieldEl.setAttribute('aria-busy', 'true');
      status(T.uploading);
      return api('PUT', '/asset/' + slot, { dataUrl: dataUrl }).then(function (res) {
        state.assets = res.assets || {};
        status(T.imageSaved, 'ok');
        render();
      });
    }).catch(function (e) {
      fieldEl.removeAttribute('aria-busy');
      var msg = /413|too large|Request body/i.test(e.message) ? T.crop.tooLargeServer : e.message;
      err.textContent = msg;
      status(T.saveError + msg, 'error');
    });
  }

  function imageField(slot) {
    var info = state.assets[slot];
    var fileId = id('file');
    var errId = id('err');
    var preview = el('div', { class: 'pt-a-image-preview' + (slot === 'logoDark' ? ' is-dark' : '') + (slot === 'background' ? ' is-wide' : '') });
    if (info) {
      preview.appendChild(el('img', { src: BASE + '/asset/' + slot + '?v=' + encodeURIComponent(info.hash), alt: '' }));
      preview.appendChild(el('span', { class: 'pt-a-image-meta', dir: 'ltr', text: Math.round(info.bytes / 1024) + ' KB · ' + String(info.type).replace('image/', '').toUpperCase() }));
    } else {
      preview.appendChild(el('span', { class: 'pt-a-dropnote', text: T.dropHere }));
    }
    var file = el('input', { id: fileId, type: 'file', accept: 'image/png,image/jpeg,image/webp,image/gif,image/svg+xml,image/x-icon,.ico', class: 'pt-a-file', 'aria-describedby': errId });
    var wrap;
    file.addEventListener('change', function () {
      var f = file.files && file.files[0];
      file.value = '';
      if (f) { uploadImage(slot, f, wrap); }
    });
    // Drag and drop onto the preview area
    preview.addEventListener('dragover', function (e) { e.preventDefault(); preview.classList.add('is-drop'); });
    preview.addEventListener('dragleave', function () { preview.classList.remove('is-drop'); });
    preview.addEventListener('drop', function (e) {
      e.preventDefault();
      preview.classList.remove('is-drop');
      var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) { uploadImage(slot, f, wrap); }
    });
    var actions = el('div', { class: 'pt-a-image-actions' }, [
      el('label', { for: fileId, class: 'pt-a-btn', text: info ? T.replace : T.upload }),
      file,
      info ? el('button', {
        type: 'button', class: 'pt-a-btn pt-a-btn--ghost', text: T.remove,
        onclick: function () {
          api('DELETE', '/asset/' + slot, {}).then(function (res) { state.assets = res.assets || {}; render(); status(T.imageRemoved, 'ok'); },
            function (err) { status(T.saveError + err.message, 'error'); });
        }
      }) : null
    ]);
    var h = help(slot);
    wrap = el('div', { class: 'pt-a-field pt-a-field--image' }, [
      el('div', { class: 'pt-a-label', text: label(slot) }),
      preview, actions,
      el('p', { class: 'pt-a-error', id: errId, role: 'alert' }),
      el('p', { class: 'pt-a-help', text: (h ? h + ' ' : '') + T.imageHelp })
    ]);
    return wrap;
  }

  function more(title, children) {
    return el('details', { class: 'pt-a-more' }, [
      el('summary', { class: 'pt-a-more-summary', text: title }),
      el('div', { class: 'pt-a-grid' }, children)
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
      var c = function (k) { return colorField('colors.' + k); };
      return [
        section(null, [
          textField('identity.companyName'),
          textField('identity.portalTitle'),
          imageField('logo'),
          toggleField('identity.showName'),
          rangeField('identity.logoHeight', 20, 64, 'px'),
          more(T.moreOptions, [
            imageField('logoDark'),
            rangeField('identity.logoMaxWidth', 60, 360, 'px'),
            textField('identity.logoAlt')
          ])
        ]),
        section(T.brandColours, [
          c('primary'), c('accent'), c('header'),
          more(T.moreColours, [c('background'), c('surface'), c('text'), c('muted'), c('border'), c('focus'), c('success'), c('warning'), c('error')])
        ]),
        contrastPanel()
      ];
    },
    appearance: function () {
      var img = value('appearance.heroStyle') === 'image';
      return [section(T.layoutTitle, [
        selectField('layout.heroAlign', ['center', 'start']),
        selectField('layout.searchWidth', ['narrow', 'medium', 'wide', 'full']),
        selectField('layout.portalColumns', ['auto', '2', '3', '4']),
        selectField('layout.formWidth', ['narrow', 'standard', 'wide'])
      ]), section(T.heroTitle, [
        selectField('appearance.heroStyle', ['tinted', 'plain', 'brand', 'image']),
        img ? imageField('background') : null,
        img ? rangeField('appearance.heroOverlay', 0, 90, '%') : null,
        img ? selectField('appearance.heroImagePosition', ['top', 'center', 'bottom']) : null
      ]), section(T.styleTitle, [
        rangeField('shape.radius', 0, 24, 'px'),
        selectField('shape.cardStyle', ['elevated', 'outlined', 'flat']),
        selectField('appearance.mode', ['light', 'dark', 'auto']),
        more(T.moreOptions, [
          selectField('shape.shadow', ['none', 'soft', 'medium']),
          selectField('shape.density', ['comfortable', 'compact']),
          selectField('shape.contentWidth', ['narrow', 'standard', 'wide']),
          selectField('features.iconStyle', ['tinted', 'original', 'mono']),
          selectField('typography.font', ['vazirmatn', 'system', 'custom']),
          value('typography.font') === 'custom' ? textField('typography.customStack', { dir: 'ltr', code: true }) : null,
          selectField('typography.scale', ['default', 'large']),
          selectField('motion.level', ['full', 'reduced', 'off'])
        ])
      ])];
    },
    texts: function () {
      var t = function (k, multi) { return textField('texts.' + k, multi ? { multiline: true, rows: 2 } : null); };
      return [
        section(null, [
          selectField('locale.language', ['fa', 'en']),
          selectField('locale.direction', ['rtl', 'ltr']),
          toggleField('locale.translate'),
          toggleField('locale.persianDigits'),
          toggleField('locale.jalali')
        ]),
        section(T.textsHome, [t('homeTitle'), t('homeSubtitle', true), t('searchPlaceholder'), t('portalsHeading'), t('requestTypesHeading')]),
        section(T.textsActions, [t('myRequests'), t('myApprovals'), t('submitRequest'), t('cancel'), t('approve'), t('decline'),
          t('addComment'), t('attachFile')]),
        section(T.textsMessages, [t('emptyRequestsTitle'), t('emptyRequestsBody', true), t('emptySearchTitle'), t('emptySearchBody', true), t('createSuccess', true)]),
        section(T.textsLogin, [t('loginTitle'), t('loginSubtitle', true)]),
        section(T.textsFooter, [t('footerText'), t('copyright'), t('supportTitle'), t('supportText', true),
          textField('texts.supportEmail', { type: 'email', dir: 'ltr' }), textField('texts.supportPhone', { type: 'tel', dir: 'ltr' }), t('supportHours')])
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
          rowsField('layout.quickLinkItems', [{ key: 'label', label: T.label }, { key: 'url', label: T.url, dir: 'ltr' }],
            function () { return (value('layout.quickLinkItems') || []).map(function (l) { return { label: l.label, url: l.url }; }); },
            function (rows) { update('layout.quickLinkItems', rows.filter(function (r) { return r.label || r.url; })); })
        ]),
        section(null, [imageField('favicon')])
      ];
    },
    features: function () {
      // Every switchable capability in one place, grouped by what it affects.
      var groups = [
        [T.flags.portal, ['layout.quickLinks', 'layout.statusInTitle', 'features.tileClick', 'features.mobileCards', 'features.statusColors', 'features.loadingBar']],
        [T.flags.language, ['locale.translate', 'locale.persianDigits', 'locale.jalali']],
        [T.flags.branding, ['features.hideJiraBranding', 'features.pageTitle', 'features.favicon', 'footer.enabled', 'backToJira.enabled']],
        [T.flags.admin, ['features.hideAdminTools']]
      ];
      return groups.map(function (g) {
        return el('section', { class: 'pt-a-section' }, [
          el('h3', { class: 'pt-a-section-title', text: g[0] }),
          el('div', { class: 'pt-a-flags' }, g[1].map(function (path) { return toggleField(path); }))
        ]);
      }).concat([section(null, [selectField('motion.level', ['full', 'reduced', 'off'])])]);
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
        ]),
        section(null, [fieldWrap('customCss', css, cssId, 'pt-a-field--wide')]),
        section(null, [fieldWrap('portals', json, jsonId, 'pt-a-field--wide'), jsonErr]),
        section(T.bypassTitle, [el('p', { class: 'pt-a-help', text: T.bypassText })])
      ];
    }
  };


  // ------------------------------------------------------------------ overview (dashboard)

  function relTime(iso) {
    var t = Date.parse(iso);
    if (!t) { return ''; }
    var diff = (t - Date.now()) / 1000;
    var units = [['year', 31536000], ['month', 2592000], ['day', 86400], ['hour', 3600], ['minute', 60]];
    try {
      var rtf = new Intl.RelativeTimeFormat(lang, { numeric: 'auto' });
      for (var i = 0; i < units.length; i++) {
        if (Math.abs(diff) >= units[i][1]) { return rtf.format(Math.round(diff / units[i][1]), units[i][0]); }
      }
      return rtf.format(0, 'minute');
    } catch (e) { return new Date(t).toLocaleString(); }
  }

  function fillT(str, vars) {
    var out = String(str).replace(/\{(\w+)\}/g, function (m, k) { return vars[k] != null ? vars[k] : m; });
    return lang === 'fa' ? U.toPersianDigits(out) : out;
  }

  function card(title, body, action) {
    return el('section', { class: 'pt-a-card' }, [
      el('h3', { class: 'pt-a-card-title', text: title }),
      el('div', { class: 'pt-a-card-body' }, body),
      action || null
    ]);
  }

  function goTab(tab) {
    return el('button', { type: 'button', class: 'pt-a-link', onclick: function () { state.tab = tab; renderPanel(); var t = doc.getElementById('pt-a-tab-' + tab); if (t) { t.focus(); } } });
  }

  function swatches(s) {
    return el('div', { class: 'pt-a-swatches' }, ['primary', 'accent', 'header', 'background', 'surface', 'text'].map(function (k) {
      var c = PT.color.normalize(U.get(s, 'colors.' + k, '#ffffff'), '#ffffff');
      return el('span', { class: 'pt-a-swatch-dot', style: 'background:' + c, title: label('colors.' + k) + ' ' + c });
    }));
  }

  function presetGallery() {
    var O = T.overview;
    var cards = Object.keys(PT.presets.PRESETS).map(function (k) {
      var p = PT.presets.PRESETS[k];
      var s = PT.presets.presetSettings(k);
      var c = s.colors;
      var current = state.draft.preset === k;
      var mini = el('div', { class: 'pt-a-preset-mini', 'aria-hidden': 'true', style: 'background:' + c.background }, [
        el('span', { class: 'pt-a-preset-bar', style: 'background:' + c.header + ';border-color:' + c.border }, [
          el('i', { style: 'background:' + c.accent })
        ]),
        el('span', { class: 'pt-a-preset-card', style: 'background:' + c.surface + ';border-color:' + c.border }, [
          el('i', { style: 'background:' + c.text }), el('b', { style: 'background:' + c.primary })
        ])
      ]);
      var btn = el('button', {
        type: 'button', class: 'pt-a-btn' + (current ? '' : ' pt-a-btn--primary'), text: current ? O.current : O.apply, disabled: current,
        'aria-label': (current ? O.current : O.apply) + ': ' + p.name[lang],
        onclick: function () {
          if (!win.confirm(T.presetConfirm)) { return; }
          var fresh = PT.presets.documentFromPreset(k);
          fresh.enabled = state.draft.enabled;
          fresh.portals = state.draft.portals;
          fresh.global = PT.presets.effective(fresh, null);
          state.draft = fresh;
          render();
          status(T.unsaved, 'warn');
        }
      });
      return el('li', { class: 'pt-a-preset' + (current ? ' is-current' : '') }, [mini,
        el('div', { class: 'pt-a-preset-foot' }, [el('strong', { text: p.name[lang] }), btn])]);
    });
    return el('section', { class: 'pt-a-section' }, [
      el('h3', { class: 'pt-a-section-title', text: T.overview.presetsTitle }),
      el('p', { class: 'pt-a-help', text: T.overview.presetsText }),
      el('ul', { class: 'pt-a-presets' }, cards)
    ]);
  }

  TABS.overview = function () {
    var O = T.overview;
    var s = effective();
    var on = state.draft.enabled !== false;
    var report = PT.tokens.contrastReport(s);
    var okCount = report.filter(function (r) { return r.ok; }).length;
    var major = parseInt(String(state.jiraVersion).split('.')[0], 10) || 0;
    var adapter = major >= 10 ? O.adapterJ10 : major >= 9 ? O.adapterJ9 : O.adapterUnknown;
    var meta = state.meta;

    var toggle = el('input', { type: 'checkbox', role: 'switch', class: 'pt-a-switch pt-a-switch--lg', id: 'pt-a-ov-enabled' });
    toggle.checked = on;
    toggle.addEventListener('change', function () { state.draft.enabled = toggle.checked; changed(); renderPanel(); });

    var hero = el('section', { class: 'pt-a-hero' + (on ? ' is-on' : ' is-off') }, [
      el('div', { class: 'pt-a-hero-main' }, [
        el('span', { class: 'pt-a-hero-dot', 'aria-hidden': 'true' }),
        el('div', {}, [
          el('h3', { class: 'pt-a-hero-title', text: on ? O.statusOn : O.statusOff }),
          el('p', { class: 'pt-a-help', text: on ? O.statusOnText : O.statusOffText }),
          el('p', { class: 'pt-a-hero-meta', text: meta && meta.updatedAt ? fillT(O.lastSaved, { when: relTime(meta.updatedAt), who: meta.updatedBy || '—' }) : O.neverSaved }),
          dirty() ? el('p', { class: 'pt-a-hero-dirty', text: O.unsavedNote }) : null
        ])
      ]),
      el('label', { class: 'pt-a-master', for: 'pt-a-ov-enabled' }, [toggle, el('span', { text: on ? T.enabled : T.disabled })])
    ]);

    var logo = state.assets.logo ? el('img', { class: 'pt-a-brand-logo', alt: '', src: BASE + '/asset/logo?v=' + encodeURIComponent(state.assets.logo.hash) })
      : el('span', { class: 'pt-a-brand-mark', style: 'background:' + PT.color.normalize(U.get(s, 'colors.accent'), '#0f8a8c') + ';color:' + PT.color.onColor(PT.color.normalize(U.get(s, 'colors.accent'), '#0f8a8c')), text: (U.get(s, 'identity.companyName', '•') || '•').charAt(0) });
    var brandCard = card(O.brand, [
      el('div', { class: 'pt-a-brand-row' }, [logo, el('strong', { class: 'pt-a-brand-name', text: U.get(s, 'identity.companyName', '') })]),
      swatches(s)
    ], el('div', { class: 'pt-a-card-actions' }, [
      (function () { var b = goTab('identity'); b.textContent = O.editIdentity; return b; })(),
      (function () { var b = goTab('identity'); b.textContent = O.editColours; return b; })()
    ]));

    var a11yCard = card(O.a11y, [
      el('div', { class: 'pt-a-meter', role: 'img', 'aria-label': okCount + '/' + report.length }, [
        el('span', { class: 'pt-a-meter-fill' + (okCount === report.length ? ' is-ok' : ' is-warn'), style: 'width:' + Math.round(100 * okCount / report.length) + '%' })
      ]),
      el('p', { class: 'pt-a-help', text: okCount === report.length ? fillT(O.a11yAll, { n: report.length }) : fillT(O.a11ySome, { ok: okCount, n: report.length }) })
    ], okCount === report.length ? null : el('div', { class: 'pt-a-card-actions' }, [(function () { var b = goTab('identity'); b.textContent = O.editColours; return b; })()]));

    var compatCard = card(O.compat, [
      el('dl', { class: 'pt-a-facts' }, [
        el('dt', { text: O.jiraVersion }), el('dd', { dir: 'ltr', text: state.jiraVersion || '—' }),
        el('dt', { text: O.adapter }), el('dd', {}, [el('span', { text: adapter }), major >= 9 ? el('span', { class: 'pt-a-chip is-ok', text: O.supported }) : null])
      ])
    ]);

    var portals = Object.keys(state.draft.portals || {}).length;
    var featCard = card(O.features, [
      el('dl', { class: 'pt-a-facts' }, [
        el('dt', { text: O.language }), el('dd', { text: opt(U.get(s, 'locale.language', 'fa')) }),
        el('dt', { text: O.direction }), el('dd', { text: opt(U.get(s, 'locale.direction', 'rtl')) }),
        el('dt', { text: O.backToJira }), el('dd', { text: U.get(s, 'backToJira.enabled', false) ? O.on : O.off }),
        el('dt', { text: O.footer }), el('dd', { text: U.get(s, 'footer.enabled', true) !== false ? O.on : O.off }),
        el('dt', { text: O.customCss }), el('dd', { text: U.get(s, 'customCss', '') ? O.on : O.none }),
        el('dt', { text: O.perPortal }), el('dd', { text: portals ? String(portals) : O.none })
      ])
    ]);

    var portalUrl = U.contextPath() + '/servicedesk/customer/portals';
    var quick = card(O.quick, [el('ul', { class: 'pt-a-quick' }, [
      el('li', {}, [el('a', { href: portalUrl, target: '_blank', rel: 'noopener', class: 'pt-a-quick-link', text: O.openPortal + ' ↗' })]),
      el('li', {}, [el('button', { type: 'button', class: 'pt-a-quick-link', text: O.openDraft + ' ↗', onclick: previewOnPortal })]),
      el('li', {}, [el('a', { href: portalUrl + '?portalTheme=off', target: '_blank', rel: 'noopener', class: 'pt-a-quick-link', text: O.openBypass + ' ↗' })]),
      el('li', {}, [el('button', { type: 'button', class: 'pt-a-quick-link', text: T.exportJson, onclick: exportJson })])
    ])]);

    return [hero, el('div', { class: 'pt-a-cards' }, [brandCard, a11yCard, compatCard, featCard, quick]), presetGallery()];
  };

  var TAB_ICONS = (function () {
    function svg(d) { return '<svg class="pt-a-tab-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="' + d + '" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>'; }
    return {
      overview: svg('M4 13h6V4H4zM14 20h6v-9h-6zM14 4v3h6V4zM4 20h6v-3H4z'),
      features: svg('M5 7h8M17 7h2M5 17h2M11 17h8M15 5v4M9 15v4'),
      identity: svg('M4 20V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v14M9 10a3 3 0 1 0 6 0 3 3 0 0 0-6 0M7 20c.8-2.6 2.8-4 5-4s4.2 1.4 5 4'),
      colors: svg('M12 3a9 9 0 1 0 0 18c1.1 0 1.6-.9 1.2-1.8-.5-1.1.2-2.2 1.4-2.2H17a4 4 0 0 0 4-4c0-5-4-10-9-10zM7.5 11.5h.01M10 7.5h.01M15 7.5h.01'),
      appearance: svg('M4 6h16M4 12h10M4 18h6M18 14l3 3-3 3'),
      texts: svg('M5 6V4h14v2M12 4v16M9 20h6'),
      language: svg('M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18'),
      navigation: svg('M4 6h16M4 12h16M4 18h9'),
      advanced: svg('M9 7 4 12l5 5M15 7l5 5-5 5')
    };
  })();

  var TAB_ORDER = ['overview', 'identity', 'appearance', 'texts', 'navigation', 'features', 'advanced'];

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
      fin: 'امور مالی', find: 'پرداخت‌ها، فاکتورها و تنخواه', fac: 'پشتیبانی اداری', facd: 'تجهیزات، پذیرایی و نگهداری ساختمان',
      newReq: 'درخواست دسترسی به سامانه', attach: 'پیوست', drop: 'فایل‌ها را اینجا رها کنید یا انتخاب کنید',
      myReq: 'درخواست‌های من', open: 'درخواست‌های باز', all: 'همه‌ی درخواست‌ها',
      rows: [['SD-128', 'دسترسی به سامانه‌ی حقوق', 'در حال انجام', 'progress'], ['SD-121', 'تعویض کارتریج چاپگر', 'انجام‌شده', 'done'], ['SD-119', 'VPN connection drops', 'در انتظار پاسخ شما', 'waiting']]
    } : {
      requests: 'Requests', it: 'IT support', itd: 'Computers, network and access', hr: 'Human resources', hrd: 'Letters, leave and admin',
      summary: 'Summary', desc: 'Description', err: 'This field is required.', send: 'Send', cancel: 'Cancel',
      fin: 'Finance', find: 'Payments, invoices and expenses', fac: 'Facilities', facd: 'Equipment, catering and building care',
      newReq: 'Request system access', attach: 'Attachment', drop: 'Drop files here or browse',
      myReq: 'My requests', open: 'Open requests', all: 'All requests',
      rows: [['SD-128', 'Payroll system access', 'In progress', 'progress'], ['SD-121', 'Printer cartridge', 'Done', 'done'], ['SD-119', 'VPN connection drops', 'Waiting for customer', 'waiting']]
    };
    var back = U.get(s, 'backToJira.enabled', false) ? '<span class="pv-headbtn pv-back">' + e(U.get(s, 'backToJira.label', '')) + '</span>' : '';
    return '' +
      '<div class="pv-header"><div class="pv-brand">' + brand + '</div><div class="pv-nav">' + back +
      '<span class="pv-headbtn">' + L.requests + ' <b class="pv-badge">۳</b></span><span class="pv-avatar"></span></div></div>' +
      previewBody(s, t, L, e) +
      '<div class="pv-footer">' + e(t.footerText) + '</div>';
  }

  function previewBody(s, t, L, e) {
    var page = state.previewPage;
    if (page === 'form') {
      return '<div class="pv-body pv-body--page"><div class="pv-title"><span class="pv-tile"></span><div><small>' + L.it + '</small><h1>' + L.newReq + '</h1></div></div>' +
        '<div class="pv-form"><label>' + L.summary + ' <span class="pv-req">*</span></label><div class="pv-input pv-input--error"></div>' +
        '<p class="pv-error">' + L.err + '</p><label>' + L.desc + '</label><div class="pv-input pv-input--focus pv-input--tall"></div>' +
        '<label>' + L.attach + '</label><div class="pv-drop">' + L.drop + '</div>' +
        '<div class="pv-actions"><span class="pv-btn pv-btn--primary">' + L.send + '</span><span class="pv-btn">' + L.cancel + '</span></div></div></div>';
    }
    if (page === 'list') {
      return '<div class="pv-body pv-body--page"><div class="pv-title"><div><h1>' + L.myReq + '</h1></div></div>' +
        '<div class="pv-filters"><span class="pv-chip is-on">' + L.open + '</span><span class="pv-chip">' + L.all + '</span><span class="pv-input pv-input--search"></span></div>' +
        '<div class="pv-list">' + L.rows.map(function (r) {
          return '<div class="pv-row"><span class="pv-key" dir="ltr">' + r[0] + '</span><span class="pv-sum" dir="auto">' + e(r[1]) + '</span>' +
            '<span class="pv-pill" data-st="' + r[3] + '">' + e(r[2]) + '</span></div>';
        }).join('') + '</div></div>';
    }
    var lay = s.layout || {};
    var heroImg = U.get(s, 'appearance.heroStyle', 'tinted') === 'image' && state.assets.background;
    var heroStyle = heroImg ? ' style="background-image:var(--pt-hero-veil), url(&quot;' + e(BASE + '/asset/background?v=' + state.assets.background.hash) + '&quot;)"' : '';
    var chips = lay.quickLinks !== false ? (lay.quickLinkItems || []).map(function (q) { return q && q.label ? '<span class="pv-quick">' + e(q.label) + '</span>' : ''; }).join('') : '';
    return '<div class="pv-hero' + (lay.heroAlign === 'start' ? '' : ' is-center') + (heroImg ? ' is-image' : '') + '"' + heroStyle + '><h1>' + e(t.homeTitle) + '</h1><p>' + e(t.homeSubtitle) + '</p>' +
      '<div class="pv-search"><span class="pv-search-icon"></span>' + e(t.searchPlaceholder) + '</div>' +
      (chips ? '<div class="pv-quicks">' + chips + '</div>' : '') + '</div>' +
      '<div class="pv-body"><h2 class="pv-section">' + e(t.portalsHeading) + '</h2>' +
      '<div class="pv-grid"><div class="pv-card"><span class="pv-tile"></span><div><strong>' + L.it + '</strong><p>' + L.itd + '</p></div></div>' +
      '<div class="pv-card"><span class="pv-tile"></span><div><strong>' + L.hr + '</strong><p>' + L.hrd + '</p></div></div>' +
      '<div class="pv-card"><span class="pv-tile"></span><div><strong>' + L.fin + '</strong><p>' + L.find + '</p></div></div>' +
      '<div class="pv-card"><span class="pv-tile"></span><div><strong>' + L.fac + '</strong><p>' + L.facd + '</p></div></div></div></div>';
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
      if (c && state.tab === 'identity') { c.parentNode.replaceWith(contrastPanel()); }
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
    state.meta = res.config && res.config.meta ? res.config.meta : null;
    state.jiraVersion = res.jiraVersion || state.jiraVersion;
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
    // Keep the current status message (e.g. "image saved") across the re-render.
    var lastStatus = statusEl ? [statusEl.textContent, statusEl.className] : null;
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
    saveBtn.setAttribute('title', T.shortcut);
    saveBtn.setAttribute('aria-keyshortcuts', 'Control+S Meta+S');

    var tabList = el('div', { class: 'pt-a-tabs', role: 'tablist', 'aria-orientation': 'vertical' }, TAB_ORDER.map(function (k) {
      return el('button', {
        type: 'button', role: 'tab', id: 'pt-a-tab-' + k, class: 'pt-a-tab', 'data-tab': k, 'aria-controls': 'pt-a-panel',
        html: TAB_ICONS[k] + '<span>' + U.escapeHtml(T.tabs[k]) + '</span>',
        onclick: function () { state.tab = k; renderPanel(); }
      });
    }));
    tabList.addEventListener('keydown', function (e) {
      var keys = TAB_ORDER;
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
    var pageSeg = el('div', { class: 'pt-a-segmented', role: 'group', 'aria-label': T.previewTitle }, ['home', 'form', 'list'].map(function (p) {
      return el('button', { type: 'button', class: 'pt-a-seg', 'aria-pressed': state.previewPage === p ? 'true' : 'false', text: T.previewPages[p],
        onclick: function () {
          state.previewPage = p;
          var btns = pageSeg.querySelectorAll('button');
          for (var i = 0; i < btns.length; i++) { btns[i].setAttribute('aria-pressed', btns[i] === this ? 'true' : 'false'); }
          renderPreview();
        } });
    }));
    var previewCol = el('aside', { class: 'pt-a-preview', 'aria-label': T.previewTitle }, [
      el('div', { class: 'pt-a-preview-head' }, [el('h3', { class: 'pt-a-section-title', text: T.previewTitle }),
        el('div', { class: 'pt-a-segmented', role: 'group' }, [vpDesk, vpMob])]),
      pageSeg,
      previewStyle,
      el('div', { class: 'pt-a-preview-stage' }, [previewFrame])
    ]);

    statusEl = el('p', { class: 'pt-a-status', role: 'status', 'aria-live': 'polite' });
    if (lastStatus) { statusEl.textContent = lastStatus[0]; statusEl.className = lastStatus[1]; }

    root.appendChild(header);
    root.appendChild(statusEl);
    root.appendChild(el('div', { class: 'pt-a-layout' }, [side, panelEl, previewCol]));
    root.appendChild(el('p', { class: 'pt-a-madeby', dir: 'ltr', lang: 'en', html: 'Parsira ' + PT.version +
      ' · Made with <span role="img" aria-label="love">\u2764\ufe0f</span> by <strong>Sepahvand Bros</strong> — ' +
      '<a href="https://www.linkedin.com/in/asepahvand/" target="_blank" rel="noopener">Amir</a> &amp; ' +
      '<a href="https://www.linkedin.com/in/taha-sepahvand-3b5063420/" target="_blank" rel="noopener">Taha Sepahvand</a>' }));
    renderPanel();
    renderPreview();
    toolbarState();
  }

  doc.addEventListener('keydown', function (e) {
    if ((e.ctrlKey || e.metaKey) && !e.altKey && (e.key === 's' || e.key === 'S')) {
      if (state.draft && dirty() && !state.busy) { e.preventDefault(); save(); }
    }
  });

  win.addEventListener('beforeunload', function (e) {
    if (state.draft && dirty()) { e.preventDefault(); e.returnValue = ''; }
  });

  api('GET', '/state').then(accept, function (err) {
    root.innerHTML = '';
    root.appendChild(el('div', { class: 'aui-message aui-message-error', role: 'alert' }, [el('p', { text: T.loadError + ' ' + err.message })]));
  });
  }

  if (doc.readyState === 'loading') { doc.addEventListener('DOMContentLoaded', boot); } else { boot(); }
})(window, document);
