package io.portaltheme.jsm.core;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Pattern;

/**
 * Validates and normalises a theme configuration document before it is stored.
 *
 * <p>The document shape is owned by the front end (see {@code web/js/pt-defaults.js}); the server
 * does not duplicate the full schema, so new optional settings can be added without a Java change.
 * Instead it enforces what matters for safety and stability:
 * <ul>
 *   <li>overall size, depth, string length and collection size limits;</li>
 *   <li>colours ({@code colors.*}) must be {@code #rgb} or {@code #rrggbb};</li>
 *   <li>every {@code url}/{@code href} value must be relative or http(s) — never {@code javascript:};</li>
 *   <li>per-portal overrides are keyed by numeric portal id;</li>
 *   <li>{@code customCss} is size-limited and may not contain markup.</li>
 * </ul>
 * Invalid values are dropped (with a warning) rather than rejecting the whole document, so an
 * imported file from a newer plugin version still loads.
 */
public final class ConfigValidator {

    public static final int SCHEMA_VERSION = 1;
    public static final int MAX_DOCUMENT_CHARS = 400_000;
    public static final int MAX_STRING_CHARS = 20_000;
    public static final int MAX_CUSTOM_CSS_CHARS = 60_000;
    public static final int MAX_ENTRIES = 2_000;

    private static final Pattern COLOR = Pattern.compile("#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})");
    private static final Pattern PORTAL_ID = Pattern.compile("[0-9]{1,9}");
    private static final Pattern SAFE_URL = Pattern.compile(
            "(?:https?://[^\\s\"'<>]+|/[^\\s\"'<>]*|\\?[^\\s\"'<>]*|#[^\\s\"'<>]*|mailto:[^\\s\"'<>]+|tel:[+0-9 ()-]+)?");

    private ConfigValidator() {
    }

    /** Result of a validation run: the cleaned document and human-readable warnings. */
    public static final class Result {
        public final Map<String, Object> config;
        public final List<String> warnings;

        Result(Map<String, Object> config, List<String> warnings) {
            this.config = config;
            this.warnings = warnings;
        }
    }

    public static Result validate(String json) {
        if (json == null || json.isEmpty()) {
            throw new IllegalArgumentException("Empty configuration");
        }
        if (json.length() > MAX_DOCUMENT_CHARS) {
            throw new IllegalArgumentException("Configuration is too large (max " + MAX_DOCUMENT_CHARS + " characters)");
        }
        Map<String, Object> raw;
        try {
            raw = Json.parseObject(json);
        } catch (Json.JsonException e) {
            throw new IllegalArgumentException("Invalid JSON: " + e.getMessage());
        }
        return validate(raw);
    }

    @SuppressWarnings("unchecked")
    public static Result validate(Map<String, Object> raw) {
        List<String> warnings = new ArrayList<>();
        int[] budget = {MAX_ENTRIES};
        Map<String, Object> out = (Map<String, Object>) clean(raw, "", warnings, budget);

        out.put("schemaVersion", SCHEMA_VERSION);
        Object enabled = out.get("enabled");
        if (!(enabled instanceof Boolean)) {
            out.put("enabled", Boolean.TRUE);
        }

        Object portals = out.get("portals");
        if (portals != null) {
            if (!(portals instanceof Map)) {
                warnings.add("portals: must be an object keyed by portal id; ignored");
                out.remove("portals");
            } else {
                Map<String, Object> kept = new LinkedHashMap<>();
                for (Map.Entry<String, Object> e : ((Map<String, Object>) portals).entrySet()) {
                    if (PORTAL_ID.matcher(e.getKey()).matches() && e.getValue() instanceof Map) {
                        kept.put(e.getKey(), e.getValue());
                    } else {
                        warnings.add("portals." + e.getKey() + ": portal overrides must use a numeric portal id; ignored");
                    }
                }
                out.put("portals", kept);
            }
        }
        return new Result(out, warnings);
    }

    private static Object clean(Object value, String path, List<String> warnings, int[] budget) {
        if (--budget[0] < 0) {
            throw new IllegalArgumentException("Configuration has too many entries (max " + MAX_ENTRIES + ")");
        }
        if (value instanceof Map) {
            Map<String, Object> out = new LinkedHashMap<>();
            for (Map.Entry<?, ?> e : ((Map<?, ?>) value).entrySet()) {
                String key = String.valueOf(e.getKey());
                if (key.length() > 500) {
                    warnings.add(path + ": key too long; ignored");
                    continue;
                }
                String childPath = path.isEmpty() ? key : path + "." + key;
                Object child = cleanLeaf(key, childPath, e.getValue(), warnings, budget);
                if (child != DROP) {
                    out.put(key, child);
                }
            }
            return out;
        }
        if (value instanceof List) {
            List<Object> out = new ArrayList<>();
            int idx = 0;
            for (Object o : (List<?>) value) {
                Object child = cleanLeaf("", path + "[" + idx++ + "]", o, warnings, budget);
                if (child != DROP) {
                    out.add(child);
                }
            }
            return out;
        }
        return value;
    }

    private static final Object DROP = new Object();

    private static Object cleanLeaf(String key, String path, Object v, List<String> warnings, int[] budget) {
        if (v instanceof Map || v instanceof List) {
            return clean(v, path, warnings, budget);
        }
        if (v instanceof String) {
            String s = (String) v;
            String lowerKey = key.toLowerCase(Locale.ROOT);
            if ("customcss".equals(lowerKey)) {
                if (s.length() > MAX_CUSTOM_CSS_CHARS) {
                    warnings.add(path + ": custom CSS longer than " + MAX_CUSTOM_CSS_CHARS + " characters; ignored");
                    return DROP;
                }
                if (s.contains("</") || s.contains("<!--")) {
                    warnings.add(path + ": custom CSS may not contain markup; ignored");
                    return DROP;
                }
                return s;
            }
            if (s.length() > MAX_STRING_CHARS) {
                warnings.add(path + ": text too long; ignored");
                return DROP;
            }
            if (path.startsWith("colors.") || path.contains(".colors.")) {
                String t = s.trim();
                if (t.isEmpty()) {
                    return DROP;
                }
                if (!COLOR.matcher(t).matches()) {
                    warnings.add(path + ": '" + t + "' is not a hex colour (#rgb or #rrggbb); ignored");
                    return DROP;
                }
                return t.toLowerCase(Locale.ROOT);
            }
            if ("url".equals(lowerKey) || "href".equals(lowerKey)) {
                String t = s.trim();
                if (!SAFE_URL.matcher(t).matches()) {
                    warnings.add(path + ": only relative, http(s), mailto: or tel: links are allowed; ignored");
                    return DROP;
                }
                return t;
            }
            return s;
        }
        if (v == null || v instanceof Boolean || v instanceof Number) {
            return v;
        }
        return DROP;
    }
}
