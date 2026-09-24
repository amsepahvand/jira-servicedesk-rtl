/*!
 * Portal Theme — emergency bypass (?portalTheme=off).
 *
 * Loaded only when the server-side gate sees the bypass (the theme itself is then not loaded at
 * all). Remembers the choice for the browser session with a session cookie, so the whole portal
 * stays unthemed while an admin or support engineer investigates, and shows a small, dismissable
 * notice with a link to switch the theme back on (?portalTheme=on).
 */
(function (win, doc) {
  'use strict';
  if (win.__portalThemeBypass) { return; }
  win.__portalThemeBypass = true;

  function contextPath() {
    try { if (win.AJS && win.AJS.contextPath) { return win.AJS.contextPath() || ''; } } catch (e) { /* ignore */ }
    var p = win.location.pathname;
    var i = p.indexOf('/servicedesk/');
    return i > 0 ? p.slice(0, i) : '';
  }

  if (/[?&]portalTheme=off\b/.test(win.location.search)) {
    doc.cookie = 'portalTheme=off; Path=' + contextPath() + '/; SameSite=Lax';
  }

  function show() {
    if (doc.getElementById('pt-bypass')) { return; }
    var fa = /^fa/.test(doc.documentElement.getAttribute('lang') || '') || /[؀-ۿ]/.test(doc.title);
    var url = win.location.pathname + '?portalTheme=on';
    var box = doc.createElement('div');
    box.id = 'pt-bypass';
    box.setAttribute('role', 'status');
    box.setAttribute('style', [
      'position:fixed', 'z-index:2147483000', 'inset-block-end:16px', 'inset-inline-start:16px', 'display:flex',
      'align-items:center', 'gap:12px', 'max-width:calc(100vw - 32px)', 'padding:10px 14px', 'border-radius:10px',
      'background:#1f2937', 'color:#fff', 'font:500 13px/1.5 system-ui,-apple-system,Segoe UI,Tahoma,sans-serif',
      'box-shadow:0 8px 24px rgba(0,0,0,.25)'
    ].join(';'));
    var text = doc.createElement('span');
    text.textContent = fa ? 'پوسته‌ی پرتال برای این نشست خاموش است.' : 'Portal theme is off for this browser session.';
    var on = doc.createElement('a');
    on.href = url;
    on.textContent = fa ? 'روشن کردن' : 'Turn on';
    on.setAttribute('style', 'color:#fff;font-weight:700;text-decoration:underline;text-underline-offset:3px');
    var close = doc.createElement('button');
    close.type = 'button';
    close.setAttribute('aria-label', fa ? 'بستن' : 'Dismiss');
    close.textContent = '×';
    close.setAttribute('style', 'min-width:32px;min-height:32px;border:0;border-radius:6px;background:transparent;color:#fff;font-size:18px;cursor:pointer');
    close.addEventListener('click', function () { box.parentNode.removeChild(box); });
    box.appendChild(text);
    box.appendChild(on);
    box.appendChild(close);
    doc.body.appendChild(box);
  }

  if (doc.readyState !== 'loading') { show(); } else { doc.addEventListener('DOMContentLoaded', show); }
})(window, document);
