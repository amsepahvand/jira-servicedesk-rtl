/*!
 * Portal Theme — Persian (Jalali / Shamsi) dates.
 *
 * Jira keeps storing and sending Gregorian dates; only what customers read is converted:
 *   - whole texts that are a Jira-formatted date ("24/Sep/26 3:15 PM", "Sep 24, 2026", "2026-09-24")
 *   - <time datetime="…"> elements get the full Shamsi date as a tooltip
 *   - date inputs show the Shamsi equivalent under the field while the customer types or picks
 * Uses the browser's built-in Persian calendar (Intl), so no calendar tables are shipped.
 */
(function (PT) {
  'use strict';

  var MONTHS = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
  var M = '(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*';
  var TIME = '(?:[ ,]+(?:at\\s+)?(\\d{1,2}):(\\d{2})(?:\\s*([AaPp][Mm]))?)?';
  var FORMATS = [
    // 24/Sep/26, 24/Sep/2026 3:15 PM (Jira default "dd/MMM/yy h:mm a")
    { re: new RegExp('^(\\d{1,2})/' + M + '/(\\d{2,4})' + TIME + '$'), d: 1, m: 2, y: 3, h: 4 },
    // Sep 24, 2026 / September 24, 2026 3:15 PM
    { re: new RegExp('^' + M + ' (\\d{1,2}),? (\\d{4})' + TIME + '$'), d: 2, m: 1, y: 3, h: 4 },
    // 24 Sep 2026
    { re: new RegExp('^(\\d{1,2}) ' + M + ',? (\\d{4})' + TIME + '$'), d: 1, m: 2, y: 3, h: 4 },
    // 2026-09-24, 2026-09-24 15:15
    { re: /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}):(\d{2}))?(?:\s*([AaPp][Mm]))?$/, d: 3, m: 2, y: 1, h: 4, numericMonth: true }
  ];

  var fmtDate = null;
  var fmtTime = null;
  function formatters() {
    if (!fmtDate) {
      try {
        fmtDate = new Intl.DateTimeFormat('fa-IR-u-ca-persian', { day: 'numeric', month: 'long', year: 'numeric' });
        fmtTime = new Intl.DateTimeFormat('fa-IR', { hour: '2-digit', minute: '2-digit', hour12: false });
      } catch (e) {
        fmtDate = false;
      }
    }
    return fmtDate;
  }

  /** Parses a Jira-formatted date text. Returns {date, hasTime} or null. */
  function parse(text) {
    var t = String(text || '').replace(/\s+/g, ' ').trim();
    if (t.length < 8 || t.length > 40) { return null; }
    for (var i = 0; i < FORMATS.length; i++) {
      var f = FORMATS[i];
      var m = f.re.exec(t);
      if (!m) { continue; }
      var year = +m[f.y];
      if (year < 100) { year += 2000; }
      var month = f.numericMonth ? +m[f.m] - 1 : MONTHS[m[f.m].slice(0, 3).toLowerCase()];
      var day = +m[f.d];
      var hasTime = m[f.h] !== undefined;
      var hour = hasTime ? +m[f.h] : 12;
      var minute = hasTime ? +m[f.h + 1] : 0;
      var ampm = m[f.h + 2];
      if (ampm) {
        var pm = /p/i.test(ampm);
        if (hour === 12) { hour = pm ? 12 : 0; } else if (pm) { hour += 12; }
      }
      var d = new Date(year, month, day, hour, minute);
      if (isNaN(d.getTime()) || d.getMonth() !== month) { return null; }
      return { date: d, hasTime: hasTime };
    }
    return null;
  }

  function format(date, withTime) {
    if (!formatters()) { return null; }
    var out = fmtDate.format(date);
    return withTime ? out + '، ساعت ' + fmtTime.format(date) : out;
  }

  /** Whole-text conversion used by the text layer; null when the text is not a date. */
  function convertText(text) {
    var p = parse(text);
    return p ? format(p.date, p.hasTime) : null;
  }

  /** Full Shamsi date/time as a tooltip on <time datetime> elements (relative texts stay). */
  function decorateTimes(root) {
    if (!formatters()) { return; }
    var list = (root || document).querySelectorAll('time[datetime]:not([data-pt-jalali])');
    for (var i = 0; i < list.length; i++) {
      var d = new Date(list[i].getAttribute('datetime'));
      if (isNaN(d.getTime())) { continue; }
      list[i].setAttribute('data-pt-jalali', '1');
      list[i].setAttribute('title', format(d, true));
    }
  }

  /** Shamsi equivalent under date inputs while the customer types or picks a date. */
  function onDateInput(e) {
    var input = e.target;
    if (!input || input.tagName !== 'INPUT' || input.type === 'hidden') { return; }
    var p = parse(input.value);
    // The hint goes after the whole field (JSM wraps the input and its calendar button together).
    var anchor = (input.closest && input.closest('.cp-date-picker, .field-container')) || input;
    var host = anchor.parentNode;
    var hint = host && host.querySelector(':scope > .pt-jalali-hint');
    if (!p) {
      if (hint) { hint.parentNode.removeChild(hint); }
      return;
    }
    if (!hint) {
      hint = document.createElement('p');
      hint.className = 'pt-own pt-jalali-hint';
      hint.setAttribute('aria-live', 'polite');
      host.insertBefore(hint, anchor.nextSibling);
    }
    hint.textContent = 'معادل شمسی: ' + format(p.date, p.hasTime);
  }

  var listening = false;
  function watchInputs() {
    if (listening) { return; }
    listening = true;
    document.addEventListener('input', onDateInput, true);
    document.addEventListener('change', onDateInput, true);
  }

  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  /** Turns Jira's strftime-like format ("%e/%b/%Y") into a real example ("24/Sep/2026"). */
  function example(fmt) {
    var d = new Date();
    var pad = function (n) { return (n < 10 ? '0' : '') + n; };
    var map = { e: String(d.getDate()), d: pad(d.getDate()), b: MON[d.getMonth()], m: pad(d.getMonth() + 1),
      Y: String(d.getFullYear()), y: String(d.getFullYear()).slice(2), H: pad(d.getHours()), M: pad(d.getMinutes()),
      I: String(d.getHours() % 12 || 12), p: d.getHours() < 12 ? 'AM' : 'PM' };
    return String(fmt).replace(/%([a-zA-Z])/g, function (m, k) { return map[k] !== undefined ? map[k] : m; });
  }

  /** Replaces the technical date-format guide with a readable example (Persian UI only). */
  function explainGuides(root) {
    var guides = (root || document).querySelectorAll('.cp-date-picker-guide:not([data-pt-guide])');
    for (var i = 0; i < guides.length; i++) {
      var g = guides[i];
      var m = /(%[a-zA-Z][^\s«»]*)/.exec(g.textContent);
      if (!m) { continue; }
      g.setAttribute('data-pt-guide', '1');
      var link = g.querySelector('a');
      var text = document.createElement('span');
      text.className = 'pt-own';
      text.textContent = 'تاریخ را مانند «\u2066' + example(m[1].replace(/[.»]+$/, '')) + '\u2069» وارد کنید یا از تقویم انتخاب کنید. ';
      while (g.firstChild) { g.removeChild(g.firstChild); }
      g.appendChild(text);
      if (link) { link.textContent = 'قالب‌های تاریخ'; }
    }
  }

  PT.date = { parse: parse, format: format, convertText: convertText, decorateTimes: decorateTimes, watchInputs: watchInputs,
    example: example, explainGuides: explainGuides };
})(window.PortalTheme);
