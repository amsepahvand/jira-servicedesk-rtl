# Rasta — Persian Portal Theme for Jira Service Management

<img src="docs/rasta-logo.png" width="96" alt="Rasta logo" align="right">

A Persian-first, RTL-first theme for the Jira Service Management **customer portal**, packaged as a
native Jira Data Center app (P2 plugin). One JAR runs on Jira **9.12 → 11.x** (JSM 5.12 → 11.x).
It needs no ScriptRunner, no files in `$JIRA_HOME` and no edits to Jira's install folder.

Made by **Sepahvand Bros** — Amir & Taha Sepahvand.

## Features

- **Theme for customers only.** Only customer-portal pages (and the portal login page) are themed;
  Jira itself, agent views and admin pages are untouched.
- **Persian and RTL throughout.** Built-in Persian texts for portal UI, validation messages,
  statuses, resolutions and activity events ("Your request status changed to …"), Persian digits,
  Shamsi (Jalali) dates, the Vazirmatn font (served by the app, OFL licence).
- **Your own texts.** Override any portal text, or add patterns such as `Please fill '{1}'`.
- **Branding.** Logo (light and dark), favicon, header background image, company name, colours,
  corner radius, typography, footer, support text, "Back to Jira" button.
- **Built-in images editor.** Uploads are cropped, resized and compressed in the browser.
- **Ready templates.** Persian (default), Zarrin (black & gold), Firouzeh, Anar, Jangal, Kavir,
  Shab (dark) and Clean LTR.
- **Layout options.** Header style (tinted, plain, brand colour, image), search width, columns,
  form width, quick links, status next to the request title, mobile request cards.
- **Feature switches.** Hide Jira branding, hide admin tools from customers, status colours,
  loading bar, clickable tiles, page titles, favicon, icon style, motion.
- **Admin page** under *Manage apps → Rasta Portal Theme*: live preview (desktop / mobile),
  "preview on portal" for unsaved changes, import / export JSON, reset, English or Persian UI.
- **Accessible and light.** WCAG contrast is checked and corrected automatically, reduced-motion is
  respected, no framework, one shared DOM observer, fail-open on any error.
- **Data Center safe.** Settings and images are stored in Jira's shared settings, so every node sees
  the same theme.

## Install

1. Jira → **Administration → Manage apps → Upload app**.
2. Upload `jsm-portal-theme-<version>.jar` (from `dist/` or a release).
3. Open **Manage apps → Rasta Portal Theme → Customer portal theme** to configure.

The theme is active as soon as the app is enabled.

**Upgrade:** upload the newer JAR over the old one; settings are kept.
**Turn off temporarily:** switch the theme off in the admin page, or disable the app in *Manage apps*.
**Remove:** uninstall the app — Jira is back to its own look immediately.

### Bypass and preview (per browser)

| URL parameter           | Effect                                                        |
| ----------------------- | ------------------------------------------------------------- |
| `?portalTheme=off`      | Show Jira's own portal in this browser (remembered)            |
| `?portalTheme=on`       | Turn the theme back on / end a preview                         |
| `?portalTheme=preview`  | Show the admin's unsaved settings (use the admin page button)  |

### Notes

- If an older ScriptRunner-based portal theme is still installed, turn it off while using Rasta so the
  two do not style the portal at the same time.
- Jira caches web resources per app version: always install a JAR with a new version number.

## Build

Requirements: JDK 17 (build), Maven 3.9, Atlassian repository access.

```bash
mvn -B install
```

The JAR is written to `plugin/target/jsm-portal-theme-<version>.jar`.

Tests: Java unit tests run with the build; front-end engine tests run with
`node plugin/src/test/js/engine.test.js`.

Local Jira for testing (JDK 21 for Jira 11):

```bash
cd plugin && mvn jira:run            # Jira 11.3 + JSM
cd plugin && mvn -Pjira10 jira:run   # Jira 10.3
cd plugin && mvn -Pjira9 jira:run    # Jira 9.12 + JSM 5.12
```

`tools/dev-deploy.sh <version>` builds and uploads to the local instance; `tools/shoot.mjs` takes
screenshots of portal pages for visual checks.

## How it works

- **One JAR for three Jira generations.** Jira 9 (javax servlet, WRM 6), Jira 10 (javax, WRM 7) and
  Jira 11 (jakarta, WRM 8) get their own small adapter modules, selected with `<restrict>`; the core
  is version-neutral.
- **Scope.** Resources load only in the `customerportal` context and on the portal login page; the
  settings are inlined with the page, so there is no extra request.
- **Compat layer.** `pt-compat.js` is the only file that knows JSM's markup; it marks elements with
  semantic roles (`data-pt="…"`) that the CSS and scripts use.
- **Text layer.** Only whole, exact texts (or declared patterns) are replaced; user content, form
  values and editors are never touched.

## Licence

Code © Sepahvand Bros. Vazirmatn font © its authors, SIL Open Font License 1.1 (`fonts/OFL.txt`).
