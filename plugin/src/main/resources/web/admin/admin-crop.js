/*!
 * Parsira — image preparation for uploads: crop dialog, downscaling and compression.
 *
 * Raster images are cropped (optional) and re-encoded in the browser, so uploads stay small
 * whatever the original photo is, and never hit a proxy's request-size limit. SVG and ICO files
 * are uploaded unchanged (after a size check), because re-encoding them would lose quality.
 *
 * PT.adminCrop.prepare(file, slotOptions, texts) → Promise<dataUrl | null (cancelled)>
 */
(function (PT) {
  'use strict';

  function readAsDataUrl(file) {
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onload = function () { resolve(r.result); };
      r.onerror = function () { reject(new Error('read')); };
      r.readAsDataURL(file);
    });
  }

  function loadImage(src) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.onload = function () { resolve(img); };
      img.onerror = function () { reject(new Error('decode')); };
      img.src = src;
    });
  }

  function byteLength(dataUrl) {
    var i = dataUrl.indexOf(',');
    return Math.floor((dataUrl.length - i - 1) * 3 / 4);
  }

  /** Draws the crop area into a canvas no larger than max, then encodes within the byte budget. */
  function encode(img, crop, opts) {
    var scale = Math.min(1, opts.maxW / crop.w, opts.maxH / crop.h);
    var w = Math.max(1, Math.round(crop.w * scale));
    var h = Math.max(1, Math.round(crop.h * scale));
    var canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    var ctx = canvas.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, crop.x, crop.y, crop.w, crop.h, 0, 0, w, h);
    var attempts = opts.photo
      ? [['image/jpeg', 0.88], ['image/jpeg', 0.8], ['image/jpeg', 0.7], ['image/jpeg', 0.6]]
      : [['image/png'], ['image/webp', 0.92], ['image/webp', 0.82]];
    for (var i = 0; i < attempts.length; i++) {
      var url = canvas.toDataURL(attempts[i][0], attempts[i][1]);
      // Browsers without WebP encoding silently return PNG: accept only the requested type.
      if (url.indexOf('data:' + attempts[i][0]) === 0 && byteLength(url) <= opts.maxBytes) { return url; }
    }
    return null;
  }

  // ------------------------------------------------------------------ crop dialog

  function dialog(img, opts, T) {
    return new Promise(function (resolve) {
      var doc = document;
      var prevFocus = doc.activeElement;
      var overlay = doc.createElement('div');
      overlay.className = 'pt-crop-overlay';
      var box = doc.createElement('div');
      box.className = 'pt-crop';
      box.setAttribute('role', 'dialog');
      box.setAttribute('aria-modal', 'true');
      box.setAttribute('aria-labelledby', 'pt-crop-title');
      box.dir = T.dir;

      var maxStageW = Math.min(640, window.innerWidth - 64);
      var maxStageH = Math.min(420, window.innerHeight - 260);
      var k = Math.min(maxStageW / img.naturalWidth, maxStageH / img.naturalHeight, 1);
      var sw = Math.round(img.naturalWidth * k);
      var sh = Math.round(img.naturalHeight * k);

      box.innerHTML = '<h2 id="pt-crop-title" class="pt-crop-title"></h2><p class="pt-crop-help"></p>' +
        '<div class="pt-crop-stage" style="width:' + sw + 'px;height:' + sh + 'px"><img alt="" draggable="false">' +
        '<div class="pt-crop-rect" tabindex="0" role="group"><span class="pt-crop-h nw"></span><span class="pt-crop-h ne"></span>' +
        '<span class="pt-crop-h sw"></span><span class="pt-crop-h se"></span></div></div>' +
        '<div class="pt-crop-bar"><div class="pt-crop-ratios" role="group"></div><span class="pt-crop-size" dir="ltr"></span></div>' +
        '<div class="pt-crop-actions"><button type="button" class="pt-a-btn pt-a-btn--primary" data-act="ok"></button>' +
        '<button type="button" class="pt-a-btn" data-act="full"></button>' +
        '<button type="button" class="pt-a-btn pt-a-btn--ghost" data-act="cancel"></button></div>';
      box.querySelector('.pt-crop-title').textContent = T.cropTitle;
      box.querySelector('.pt-crop-help').textContent = T.cropHelp;
      box.querySelector('[data-act="ok"]').textContent = T.cropApply;
      box.querySelector('[data-act="full"]').textContent = T.cropNone;
      box.querySelector('[data-act="cancel"]').textContent = T.cropCancel;
      var stage = box.querySelector('.pt-crop-stage');
      stage.querySelector('img').src = img.src;
      var rect = box.querySelector('.pt-crop-rect');
      rect.setAttribute('aria-label', T.cropArea);
      var sizeEl = box.querySelector('.pt-crop-size');

      var ratio = opts.ratio || null; // width / height, or null = free
      var r = { x: 0, y: 0, w: sw, h: sh };

      function fitRatio() {
        if (!ratio) { return; }
        var w = sw, h = Math.round(sw / ratio);
        if (h > sh) { h = sh; w = Math.round(sh * ratio); }
        r = { x: Math.round((sw - w) / 2), y: Math.round((sh - h) / 2), w: w, h: h };
      }
      function clamp() {
        r.w = Math.max(16, Math.min(r.w, sw));
        r.h = Math.max(16, Math.min(r.h, sh));
        r.x = Math.max(0, Math.min(r.x, sw - r.w));
        r.y = Math.max(0, Math.min(r.y, sh - r.h));
      }
      function draw() {
        clamp();
        rect.style.left = r.x + 'px';
        rect.style.top = r.y + 'px';
        rect.style.width = r.w + 'px';
        rect.style.height = r.h + 'px';
        sizeEl.textContent = Math.round(r.w / k) + ' × ' + Math.round(r.h / k) + ' px';
      }

      var ratios = [{ id: 'free', v: null, label: T.ratioFree }, { id: 'orig', v: img.naturalWidth / img.naturalHeight, label: T.ratioOriginal },
        { id: 'square', v: 1, label: T.ratioSquare }];
      if (opts.suggest) { ratios.push({ id: 'wide', v: opts.suggest, label: T.ratioWide }); }
      var group = box.querySelector('.pt-crop-ratios');
      group.setAttribute('aria-label', T.ratio);
      ratios.forEach(function (o) {
        var b = doc.createElement('button');
        b.type = 'button';
        b.className = 'pt-a-seg';
        b.textContent = o.label;
        b.setAttribute('aria-pressed', (o.v === ratio || (!o.v && !ratio && o.id === 'free')) ? 'true' : 'false');
        b.addEventListener('click', function () {
          ratio = o.v;
          Array.prototype.forEach.call(group.children, function (c) { c.setAttribute('aria-pressed', c === b ? 'true' : 'false'); });
          if (ratio) { fitRatio(); } else { r = { x: 0, y: 0, w: sw, h: sh }; }
          draw();
        });
        group.appendChild(b);
      });
      if (ratio) { fitRatio(); }

      // Pointer: drag inside to move, drag a corner to resize (ratio kept when set).
      var drag = null;
      stage.addEventListener('pointerdown', function (e) {
        var handle = e.target.closest('.pt-crop-h');
        if (!handle && !e.target.closest('.pt-crop-rect')) { return; }
        e.preventDefault();
        stage.setPointerCapture(e.pointerId);
        drag = { mode: handle ? handle.className.replace('pt-crop-h ', '') : 'move', x: e.clientX, y: e.clientY, r: { x: r.x, y: r.y, w: r.w, h: r.h } };
      });
      stage.addEventListener('pointermove', function (e) {
        if (!drag) { return; }
        var dx = e.clientX - drag.x, dy = e.clientY - drag.y, o = drag.r;
        if (drag.mode === 'move') {
          r.x = o.x + dx; r.y = o.y + dy;
        } else {
          var left = /w/.test(drag.mode), top = /n/.test(drag.mode);
          var w = o.w + (left ? -dx : dx);
          var h = ratio ? w / ratio : o.h + (top ? -dy : dy);
          w = Math.max(16, w); h = Math.max(16, h);
          r.w = w; r.h = h;
          r.x = left ? o.x + o.w - w : o.x;
          r.y = top ? o.y + o.h - h : o.y;
        }
        draw();
      });
      function endDrag() { drag = null; }
      stage.addEventListener('pointerup', endDrag);
      stage.addEventListener('pointercancel', endDrag);

      // Keyboard: arrows move, Shift+arrows resize (10 px steps with Alt for fine 1 px).
      rect.addEventListener('keydown', function (e) {
        var step = e.altKey ? 1 : 10;
        var map = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
        if (!map[e.key]) { return; }
        e.preventDefault();
        if (e.shiftKey) {
          r.w += map[e.key][0]; r.h = ratio ? r.w / ratio : r.h + map[e.key][1];
        } else {
          r.x += map[e.key][0]; r.y += map[e.key][1];
        }
        draw();
      });

      function close(result) {
        doc.removeEventListener('keydown', onKey, true);
        overlay.parentNode.removeChild(overlay);
        if (prevFocus && prevFocus.focus) { prevFocus.focus(); }
        resolve(result);
      }
      function onKey(e) {
        if (e.key === 'Escape') { e.preventDefault(); close(null); }
        if (e.key === 'Tab') { // keep focus inside the dialog
          var f = box.querySelectorAll('button, [tabindex="0"]');
          var first = f[0], last = f[f.length - 1];
          if (e.shiftKey && doc.activeElement === first) { e.preventDefault(); last.focus(); }
          else if (!e.shiftKey && doc.activeElement === last) { e.preventDefault(); first.focus(); }
        }
      }
      doc.addEventListener('keydown', onKey, true);
      box.addEventListener('click', function (e) {
        var act = e.target.getAttribute && e.target.getAttribute('data-act');
        if (act === 'cancel') { close(null); }
        if (act === 'full') { close({ x: 0, y: 0, w: img.naturalWidth, h: img.naturalHeight }); }
        if (act === 'ok') { close({ x: r.x / k, y: r.y / k, w: r.w / k, h: r.h / k }); }
      });
      overlay.addEventListener('click', function (e) { if (e.target === overlay) { close(null); } });

      overlay.appendChild(box);
      doc.body.appendChild(overlay);
      draw();
      box.querySelector('[data-act="ok"]').focus();
    });
  }

  /**
   * opts: { maxW, maxH, maxBytes, photo (encode as JPEG), ratio (initial), suggest (extra ratio),
   *         crop (show dialog) }
   */
  function prepare(file, opts, T) {
    var type = (file.type || '').toLowerCase();
    if (/svg|icon|x-icon/.test(type) || /\.(svg|ico)$/i.test(file.name || '')) {
      if (file.size > opts.maxBytes) { return Promise.reject(new Error(T.tooLarge)); }
      return readAsDataUrl(file);
    }
    if (!/^image\//.test(type)) { return Promise.reject(new Error(T.notImage)); }
    return readAsDataUrl(file).then(loadImage).then(function (img) {
      var full = { x: 0, y: 0, w: img.naturalWidth, h: img.naturalHeight };
      var step = opts.crop === false ? Promise.resolve(full) : dialog(img, opts, T);
      return step.then(function (crop) {
        if (!crop) { return null; }
        var url = encode(img, crop, opts);
        if (!url) { throw new Error(T.tooLarge); }
        return url;
      });
    }, function () { throw new Error(T.notImage); });
  }

  PT.adminCrop = { prepare: prepare };
})(window.PortalTheme);
