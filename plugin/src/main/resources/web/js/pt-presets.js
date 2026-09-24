/*!
 * Portal Theme — configuration model, defaults and presets.
 *
 * Document (stored by the server as JSON, schemaVersion 1):
 *   {
 *     schemaVersion: 1,
 *     enabled: true,              // admin master switch
 *     preset: "persian",          // which preset the admin started from (informational)
 *     global: <Settings>,         // applies to every portal
 *     portals: { "<portalId>": <partial Settings> }   // per-portal overrides (deep-merged)
 *   }
 *
 * Effective settings for a page = DEFAULTS ← PRESETS[preset] ← global ← portals[currentPortalId].
 * Unknown keys are ignored, missing keys fall back, so documents stay compatible across versions.
 */
(function (PT) {
  'use strict';

  var U = PT.util;

  var DEFAULTS = {
    identity: {
      companyName: 'مرکز پشتیبانی',
      logoAlt: '',
      logoHeight: 36,          // px, the logo is scaled to fit — never stretched
      logoMaxWidth: 200,       // px
      showName: true           // show the company name next to the logo
    },
    colors: {
      primary: '#16407a',
      accent: '#0f8a8c',
      background: '#f5f7fa',
      surface: '#ffffff',
      text: '#0f1b2d',
      muted: '#4a5568',
      border: '#e2e7ee',
      focus: '#2563eb',
      success: '#15803d',
      warning: '#b45309',
      error: '#c0262d',
      header: '#ffffff'
    },
    shape: {
      radius: 12,              // 0–24 px, base radius of cards; controls derive from it
      cardStyle: 'elevated',   // elevated | outlined | flat
      shadow: 'soft',          // none | soft | medium
      density: 'comfortable',  // comfortable | compact
      contentWidth: 'standard' // narrow | standard | wide
    },
    typography: {
      font: 'vazirmatn',       // vazirmatn | system | custom
      customStack: '',
      scale: 'default'         // default | large
    },
    appearance: {
      mode: 'light',           // light | dark | auto
      heroStyle: 'tinted'      // tinted | plain | brand
    },
    locale: {
      direction: 'rtl',        // rtl | ltr
      language: 'fa',          // fa | en  (built-in dictionary for Jira's English UI texts)
      translate: true,         // replace Jira's customer-facing English texts
      persianDigits: true      // show numbers in Jira-generated texts with Persian digits
    },
    texts: {
      homeTitle: 'چطور می‌توانیم کمکتان کنیم؟',
      homeSubtitle: 'درخواست خود را ثبت کنید، وضعیت آن را پیگیری کنید یا پاسخ پرسش‌هایتان را در راهنما پیدا کنید.',
      searchPlaceholder: 'جست‌وجو در خدمات و راهنما…',
      portalsHeading: 'خدمات پشتیبانی',
      requestTypesHeading: 'چه درخواستی دارید؟',
      emptyRequestsTitle: 'درخواستی برای نمایش نیست',
      emptyRequestsBody: 'هر زمان درخواستی ثبت کنید، وضعیت و پاسخ‌های آن را همین‌جا می‌بینید.',
      emptySearchTitle: 'نتیجه‌ای پیدا نشد',
      emptySearchBody: 'عبارت دیگری را امتحان کنید یا درخواست تازه‌ای ثبت کنید.',
      createSuccess: 'درخواست شما ثبت شد. پاسخ‌ها و تغییر وضعیت را در همین صفحه و از راه ایمیل دریافت می‌کنید.',
      loginTitle: 'ورود به {company}',
      loginSubtitle: 'برای ثبت و پیگیری درخواست‌ها وارد حساب کاربری خود شوید.',
      footerText: 'همراه شما در ثبت و پیگیری درخواست‌ها',
      supportTitle: 'ارتباط با پشتیبانی',
      supportText: '',
      supportEmail: '',
      supportPhone: '',
      supportHours: '',
      copyright: '© {year} {company} — همه‌ی حقوق محفوظ است.'
    },
    // Exact Jira text → replacement. Overrides the built-in dictionary.
    dictionary: {},
    // Texts with a variable part: { source: "Please provide a value for '{1}'", target: "..." }
    patterns: [],
    backToJira: {
      enabled: false,
      label: 'بازگشت به جیرا',
      url: '/secure/Dashboard.jspa',
      newTab: false,
      audience: 'jira-users',  // jira-users (have a Jira licence) | authenticated
      showIcon: true
    },
    footer: {
      enabled: true,
      links: [
        { label: 'ثبت درخواست جدید', url: '/servicedesk/customer/portals' },
        { label: 'درخواست‌های من', url: '/servicedesk/customer/user/requests' }
      ]
    },
    features: {
      hideJiraBranding: true,  // "Powered by Jira Service Management", Jira logo
      hideAdminTools: false,   // "Customise", "Add announcement", "Edit visible columns"
      favicon: true,
      pageTitle: true,         // "<page> | <company>" in the browser tab
      iconStyle: 'tinted',     // tinted | original | mono  (request type icons)
      statusColors: true       // colour status badges by category
    },
    motion: {
      level: 'full'            // full | reduced | off   (the OS "reduce motion" setting always wins)
    },
    customCss: ''
  };

  var PRESETS = {
    persian: {
      id: 'persian',
      name: { fa: 'فارسی سازمانی (پیش‌فرض)', en: 'Persian enterprise (default)' },
      settings: {}
    },

    'bimeh-bazaar': {
      id: 'bimeh-bazaar',
      name: { fa: 'بیمه‌بازار — مشکی و زرد', en: 'Bimeh Bazaar — black & yellow' },
      settings: {
        identity: { companyName: 'بیمه‌بازار' },
        colors: {
          primary: '#111111',
          accent: '#f2bf00',
          background: '#f6f6f3',
          surface: '#ffffff',
          text: '#1a1a1a',
          muted: '#5c5c57',
          border: '#e4e4df',
          focus: '#111111',
          success: '#1d6431',
          warning: '#8a6500',
          error: '#b3261e',
          header: '#000000'
        },
        shape: { radius: 12, cardStyle: 'outlined', shadow: 'soft' },
        appearance: { heroStyle: 'tinted' },
        features: { iconStyle: 'mono' }
      }
    },

    'clean-ltr': {
      id: 'clean-ltr',
      name: { fa: 'انگلیسی چپ‌به‌راست', en: 'Clean English (LTR)' },
      settings: {
        identity: { companyName: 'Help Center' },
        locale: { direction: 'ltr', language: 'en', translate: false, persianDigits: false },
        typography: { font: 'system' },
        texts: {
          homeTitle: 'How can we help?',
          homeSubtitle: 'Raise a request, follow its progress or find answers in our help articles.',
          searchPlaceholder: 'Search services and help…',
          portalsHeading: 'Services',
          requestTypesHeading: 'What do you need?',
          emptyRequestsTitle: 'No requests to show',
          emptyRequestsBody: 'When you raise a request, its status and replies appear here.',
          emptySearchTitle: 'No results',
          emptySearchBody: 'Try another term or raise a new request.',
          createSuccess: 'Your request was created. We will keep you posted here and by email.',
          loginTitle: 'Log in to {company}',
          loginSubtitle: 'Log in to raise and follow your requests.',
          footerText: 'We are here to help.',
          supportTitle: 'Contact support',
          copyright: '© {year} {company}. All rights reserved.'
        },
        backToJira: { label: 'Back to Jira' },
        footer: {
          links: [
            { label: 'New request', url: '/servicedesk/customer/portals' },
            { label: 'My requests', url: '/servicedesk/customer/user/requests' }
          ]
        }
      }
    }
  };

  function presetSettings(id) {
    var p = PRESETS[id] || PRESETS.persian;
    return U.merge({}, DEFAULTS, p.settings);
  }

  /** Normalises a stored document (or null) into a complete document. */
  function normalizeDocument(doc) {
    var d = U.isPlainObject(doc) ? doc : {};
    return {
      schemaVersion: 1,
      enabled: d.enabled !== false,
      preset: PRESETS[d.preset] ? d.preset : 'persian',
      global: U.isPlainObject(d.global) ? d.global : {},
      portals: U.isPlainObject(d.portals) ? d.portals : {}
    };
  }

  /** Effective settings for one portal (portalId may be null). */
  function effective(doc, portalId) {
    var d = normalizeDocument(doc);
    var s = presetSettings(d.preset);
    U.merge(s, d.global);
    if (portalId != null && U.isPlainObject(d.portals[String(portalId)])) {
      U.merge(s, d.portals[String(portalId)]);
    }
    return s;
  }

  /** A new document that starts from a preset. */
  function documentFromPreset(id) {
    var p = PRESETS[id] ? id : 'persian';
    return { schemaVersion: 1, enabled: true, preset: p, global: U.clone(PRESETS[p].settings), portals: {} };
  }

  PT.presets = {
    DEFAULTS: DEFAULTS,
    PRESETS: PRESETS,
    presetSettings: presetSettings,
    normalizeDocument: normalizeDocument,
    effective: effective,
    documentFromPreset: documentFromPreset
  };
})(window.PortalTheme);
