package io.portaltheme.jsm.core;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Persistent theme state: one JSON configuration document and up to three images.
 *
 * <p><b>Data Center:</b> everything lives in Jira's global plugin settings (database-backed and
 * cluster-safe). The only in-memory state is a parse cache keyed by the stored string itself, so a
 * change saved on another node is picked up as soon as that node's settings cache is invalidated
 * by Jira — no plugin-level invalidation messages are needed.
 */
public final class ThemeStore {

    /** Minimal key/value view of SAL {@code PluginSettings}; lets the store be unit-tested. */
    public interface Settings {
        String get(String key);

        void put(String key, String value);

        void remove(String key);
    }

    static final String PREFIX = "io.portaltheme.jsm.";
    static final String CONFIG_KEY = PREFIX + "config.v1";
    static final String ASSET_PREFIX = PREFIX + "asset.";

    private final Settings settings;

    private volatile String cachedRaw;
    private volatile Map<String, Object> cachedConfig;
    private final Map<String, CachedAsset> assetCache = new java.util.concurrent.ConcurrentHashMap<>();

    public ThemeStore(Settings settings) {
        this.settings = settings;
    }

    // ------------------------------------------------------------------ configuration

    /**
     * The stored configuration, or {@code null} when the admin never saved one (the front end then
     * uses its built-in default preset). Returned maps must be treated as read-only.
     */
    public Map<String, Object> config() {
        String raw = settings.get(CONFIG_KEY);
        if (raw == null || raw.isEmpty()) {
            return null;
        }
        Map<String, Object> cached = cachedConfig;
        if (raw.equals(cachedRaw) && cached != null) {
            return cached;
        }
        Map<String, Object> parsed;
        try {
            parsed = Json.parseObject(raw);
        } catch (RuntimeException e) {
            // A corrupt value must never break the portal: behave as "not configured".
            return null;
        }
        cachedConfig = parsed;
        cachedRaw = raw;
        return parsed;
    }

    /** Whether the theme should be applied at all (admin master switch). Defaults to on. */
    public boolean isEnabled() {
        Map<String, Object> c = config();
        if (c == null) {
            return true;
        }
        Object e = c.get("enabled");
        return !(e instanceof Boolean) || (Boolean) e;
    }

    public ConfigValidator.Result save(String json) {
        ConfigValidator.Result r = ConfigValidator.validate(json);
        settings.put(CONFIG_KEY, Json.write(r.config));
        return r;
    }

    public void setEnabled(boolean enabled) {
        Map<String, Object> c = config();
        Map<String, Object> copy = c == null ? new LinkedHashMap<>() : new LinkedHashMap<>(c);
        copy.put("enabled", enabled);
        settings.put(CONFIG_KEY, Json.write(ConfigValidator.validate(copy).config));
    }

    /** Removes configuration and images: the portal falls back to the built-in default preset. */
    public void reset() {
        settings.remove(CONFIG_KEY);
        for (Asset.Kind k : Asset.Kind.values()) {
            settings.remove(ASSET_PREFIX + k.key);
        }
        assetCache.clear();
    }

    // ------------------------------------------------------------------ images

    public Asset asset(Asset.Kind kind) {
        String raw = settings.get(ASSET_PREFIX + kind.key);
        if (raw == null || raw.isEmpty()) {
            return null;
        }
        CachedAsset c = assetCache.get(kind.key);
        if (c != null && c.raw.equals(raw)) {
            return c.asset;
        }
        Asset a;
        try {
            a = Asset.fromDataUrl(kind, raw);
        } catch (IllegalArgumentException e) {
            return null;
        }
        assetCache.put(kind.key, new CachedAsset(raw, a));
        return a;
    }

    public Asset putAsset(Asset.Kind kind, String dataUrl) {
        Asset a = Asset.fromDataUrl(kind, dataUrl);
        settings.put(ASSET_PREFIX + kind.key, a.toDataUrl());
        return a;
    }

    public void removeAsset(Asset.Kind kind) {
        settings.remove(ASSET_PREFIX + kind.key);
        assetCache.remove(kind.key);
    }

    /** {@code {logo: "hash", favicon: "hash"}} for the images that exist. */
    public Map<String, Object> assetVersions() {
        Map<String, Object> m = new LinkedHashMap<>();
        for (Asset.Kind k : Asset.Kind.values()) {
            Asset a = asset(k);
            if (a != null) {
                m.put(k.key, a.hash);
            }
        }
        return m;
    }

    private static final class CachedAsset {
        final String raw;
        final Asset asset;

        CachedAsset(String raw, Asset asset) {
            this.raw = raw;
            this.asset = asset;
        }
    }
}
