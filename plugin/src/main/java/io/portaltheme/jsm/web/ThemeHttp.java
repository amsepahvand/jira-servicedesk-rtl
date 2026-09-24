package io.portaltheme.jsm.web;

import io.portaltheme.jsm.core.Asset;
import io.portaltheme.jsm.core.ConfigValidator;
import io.portaltheme.jsm.core.Json;
import io.portaltheme.jsm.core.Platform;
import io.portaltheme.jsm.core.ThemeStore;

import java.io.IOException;
import java.net.URI;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;

/**
 * All server-side HTTP behaviour of the plugin, mounted at {@code /plugins/servlet/portal-theme}.
 *
 * <pre>
 * GET    /admin               admin configuration page (Jira admins, WebSudo)
 * GET    /api/state           stored configuration + image metadata      (admin)
 * PUT    /api/config          save configuration                          (admin)
 * PUT    /api/asset/{slot}    upload logo | logoDark | favicon            (admin)
 * DELETE /api/asset/{slot}    remove an image                             (admin)
 * POST   /api/import          replace configuration and images at once    (admin)
 * GET    /api/export          configuration + images as one JSON document (admin)
 * POST   /api/reset           back to the built-in default preset         (admin)
 * GET    /asset/{slot}        the image itself (public: the login page needs the logo)
 * </pre>
 *
 * <p>CSRF: every mutating call must carry {@code X-Portal-Theme: 1} and a JSON content type. A
 * cross-site form cannot set either without a CORS preflight, which Jira does not grant. A present
 * {@code Origin} header must match the request host.
 */
public final class ThemeHttp {

    static final String CSRF_HEADER = "X-Portal-Theme";
    private static final int MAX_BODY = 2_000_000;
    private static final String PAGE_PATH = "/plugins/servlet/portal-theme/admin";

    private ThemeHttp() {
    }

    public static void handle(Exchange ex) throws IOException {
        String method = ex.method().toUpperCase(Locale.ROOT);
        String path = ex.pathInfo() == null ? "" : ex.pathInfo();
        try {
            if (path.startsWith("/asset/") && ("GET".equals(method) || "HEAD".equals(method))) {
                serveAsset(ex, path.substring("/asset/".length()), "HEAD".equals(method));
                return;
            }
            if ("/admin".equals(path) || "".equals(path) || "/".equals(path)) {
                if (!"GET".equals(method)) {
                    json(ex, 405, error("Method not allowed"));
                    return;
                }
                adminPage(ex);
                return;
            }
            if (path.startsWith("/api/")) {
                api(ex, method, path.substring("/api".length()));
                return;
            }
            json(ex, 404, error("Not found"));
        } catch (IllegalArgumentException e) {
            json(ex, 400, error(e.getMessage()));
        }
    }

    // ------------------------------------------------------------------ admin page

    private static void adminPage(Exchange ex) throws IOException {
        if (Platform.currentUser() == null) {
            String dest = URLEncoder.encode(PAGE_PATH, "UTF-8");
            ex.sendRedirect(ex.contextPath() + "/login.jsp?permissionViolation=true&os_destination=" + dest);
            return;
        }
        if (!Platform.isJiraAdmin()) {
            html(ex, 403, "<!DOCTYPE html><html><head><title>Forbidden</title></head><body>"
                    + "<p>Only Jira administrators can configure the portal theme.</p></body></html>");
            return;
        }
        if (!Platform.webSudoAllows(ex.rawRequest())) {
            if (Platform.webSudoEnforce(ex.rawRequest(), ex.rawResponse())) {
                return;
            }
        } else {
            Platform.webSudoWillExecute(ex.rawRequest());
        }
        AdminPage.requireResources();
        html(ex, 200, AdminPage.render(ex.contextPath()));
    }

    // ------------------------------------------------------------------ JSON API

    private static void api(Exchange ex, String method, String route) throws IOException {
        if (Platform.currentUser() == null) {
            json(ex, 401, error("Log in as a Jira administrator"));
            return;
        }
        if (!Platform.isJiraAdmin()) {
            json(ex, 403, error("Jira administrator permission required"));
            return;
        }
        if (!Platform.webSudoAllows(ex.rawRequest())) {
            Map<String, Object> e = error("Your secure administrator session has expired. Reload the page to confirm your password.");
            e.put("websudo", true);
            json(ex, 401, e);
            return;
        }
        Platform.webSudoWillExecute(ex.rawRequest());
        ex.setHeader("Cache-Control", "no-store");

        boolean mutating = !"GET".equals(method);
        if (mutating && !csrfOk(ex)) {
            json(ex, 403, error("Missing or invalid request headers (CSRF protection)"));
            return;
        }

        ThemeStore store = Platform.store();
        if ("GET".equals(method) && "/state".equals(route)) {
            json(ex, 200, state(store));
        } else if ("GET".equals(method) && "/export".equals(route)) {
            json(ex, 200, export(store));
        } else if ("PUT".equals(method) && "/config".equals(route)) {
            ConfigValidator.Result r = store.save(ex.body(MAX_BODY), Platform.currentUserName());
            Map<String, Object> out = state(store);
            out.put("warnings", r.warnings);
            json(ex, 200, out);
        } else if (route.startsWith("/asset/") && ("PUT".equals(method) || "DELETE".equals(method))) {
            Asset.Kind kind = Asset.Kind.fromKey(route.substring("/asset/".length()));
            if (kind == null) {
                json(ex, 404, error("Unknown image slot"));
                return;
            }
            if ("PUT".equals(method)) {
                Map<String, Object> body = Json.parseObject(ex.body(MAX_BODY));
                store.putAsset(kind, String.valueOf(body.get("dataUrl")));
            } else {
                store.removeAsset(kind);
            }
            json(ex, 200, state(store));
        } else if ("POST".equals(method) && "/import".equals(route)) {
            json(ex, 200, importAll(store, ex.body(MAX_BODY)));
        } else if ("POST".equals(method) && "/reset".equals(route)) {
            store.reset();
            json(ex, 200, state(store));
        } else {
            json(ex, 404, error("Not found"));
        }
    }

    private static boolean csrfOk(Exchange ex) {
        if (!"1".equals(ex.header(CSRF_HEADER))) {
            return false;
        }
        String ct = ex.header("Content-Type");
        if (ct == null || !ct.toLowerCase(Locale.ROOT).startsWith("application/json")) {
            return false;
        }
        String origin = ex.header("Origin");
        if (origin != null && !origin.isEmpty() && !"null".equals(origin)) {
            String host = ex.header("Host");
            try {
                URI o = URI.create(origin);
                String originHost = o.getPort() > 0 ? o.getHost() + ":" + o.getPort() : o.getHost();
                String forwarded = ex.header("X-Forwarded-Host");
                return originHost != null && (originHost.equalsIgnoreCase(host)
                        || (forwarded != null && originHost.equalsIgnoreCase(forwarded.split(",")[0].trim()))
                        || (host != null && o.getHost().equalsIgnoreCase(host.split(":")[0])));
            } catch (IllegalArgumentException e) {
                return false;
            }
        }
        return true;
    }

    private static Map<String, Object> state(ThemeStore store) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("config", store.config());
        Map<String, Object> assets = new LinkedHashMap<>();
        for (Asset.Kind k : Asset.Kind.values()) {
            Asset a = store.asset(k);
            if (a != null) {
                Map<String, Object> info = new LinkedHashMap<>();
                info.put("hash", a.hash);
                info.put("type", a.mimeType);
                info.put("bytes", a.bytes.length);
                assets.put(k.key, info);
            }
        }
        m.put("assets", assets);
        m.put("jiraVersion", Platform.jiraVersion());
        m.put("schemaVersion", ConfigValidator.SCHEMA_VERSION);
        return m;
    }

    private static Map<String, Object> export(ThemeStore store) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("format", "portal-theme-export");
        m.put("schemaVersion", ConfigValidator.SCHEMA_VERSION);
        m.put("config", store.config());
        Map<String, Object> assets = new LinkedHashMap<>();
        for (Asset.Kind k : Asset.Kind.values()) {
            Asset a = store.asset(k);
            if (a != null) {
                assets.put(k.key, a.toDataUrl());
            }
        }
        m.put("assets", assets);
        return m;
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> importAll(ThemeStore store, String body) {
        Map<String, Object> doc = Json.parseObject(body);
        Object config = doc.get("config");
        if (!(config instanceof Map)) {
            throw new IllegalArgumentException("The file does not contain a theme configuration");
        }
        // Validate everything before writing anything.
        ConfigValidator.Result r = ConfigValidator.validate((Map<String, Object>) config);
        Map<Asset.Kind, String> images = new LinkedHashMap<>();
        Object assets = doc.get("assets");
        if (assets instanceof Map) {
            for (Map.Entry<String, Object> e : ((Map<String, Object>) assets).entrySet()) {
                Asset.Kind kind = Asset.Kind.fromKey(e.getKey());
                if (kind != null && e.getValue() instanceof String) {
                    Asset.fromDataUrl(kind, (String) e.getValue());
                    images.put(kind, (String) e.getValue());
                }
            }
        }
        store.save(Json.write(r.config), Platform.currentUserName());
        for (Asset.Kind k : Asset.Kind.values()) {
            if (images.containsKey(k)) {
                store.putAsset(k, images.get(k));
            } else {
                store.removeAsset(k);
            }
        }
        Map<String, Object> out = state(store);
        out.put("warnings", r.warnings);
        return out;
    }

    // ------------------------------------------------------------------ images

    private static void serveAsset(Exchange ex, String slot, boolean head) throws IOException {
        Asset.Kind kind = Asset.Kind.fromKey(slot);
        Asset a = kind == null ? null : Platform.store().asset(kind);
        if (a == null) {
            ex.status(404);
            ex.setHeader("Cache-Control", "no-store");
            return;
        }
        String etag = "\"" + a.hash + "\"";
        ex.setHeader("ETag", etag);
        ex.setHeader("X-Content-Type-Options", "nosniff");
        // Even a validated SVG is sandboxed if someone opens it directly.
        ex.setHeader("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; img-src data:; sandbox");
        ex.setHeader("Content-Disposition", "inline; filename=\"" + kind.key + "." + a.extension() + "\"");
        String q = ex.queryString();
        boolean versioned = q != null && q.contains("v=" + a.hash);
        ex.setHeader("Cache-Control", versioned ? "public, max-age=31536000, immutable" : "public, max-age=300");
        if (etag.equals(ex.header("If-None-Match"))) {
            ex.status(304);
            return;
        }
        ex.status(200);
        ex.setHeader("Content-Type", a.mimeType);
        ex.setHeader("Content-Length", String.valueOf(a.bytes.length));
        if (!head) {
            ex.write(a.bytes);
        }
    }

    // ------------------------------------------------------------------ helpers

    static Map<String, Object> error(String message) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("error", message);
        return m;
    }

    private static void json(Exchange ex, int status, Object body) throws IOException {
        ex.status(status);
        ex.setHeader("Content-Type", "application/json;charset=UTF-8");
        ex.setHeader("X-Content-Type-Options", "nosniff");
        ex.write(Json.write(body).getBytes(StandardCharsets.UTF_8));
    }

    private static void html(Exchange ex, int status, String body) throws IOException {
        ex.status(status);
        ex.setHeader("Content-Type", "text/html;charset=UTF-8");
        ex.setHeader("Cache-Control", "no-store");
        ex.write(body.getBytes(StandardCharsets.UTF_8));
    }
}
