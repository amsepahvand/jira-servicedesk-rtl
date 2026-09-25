package io.portaltheme.jsm.core;

import org.junit.jupiter.api.Test;

import java.util.HashMap;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertTrue;

class ThemeStoreTest {

    /** Shared map = the database; two stores = two Data Center nodes. */
    private final Map<String, String> db = new HashMap<>();

    private ThemeStore node() {
        return new ThemeStore(new ThemeStore.Settings() {
            public String get(String key) { return db.get(key); }
            public void put(String key, String value) { db.put(key, value); }
            public void remove(String key) { db.remove(key); }
        });
    }

    @Test
    void defaultsToEnabledWithoutConfig() {
        ThemeStore s = node();
        assertNull(s.config());
        assertTrue(s.isEnabled());
    }

    @Test
    void changesOnOneNodeAreSeenByAnother() {
        ThemeStore a = node();
        ThemeStore b = node();
        a.save("{\"enabled\":true,\"global\":{\"identity\":{\"companyName\":\"A\"}}}", "Admin");
        Map<String, Object> first = b.config();
        assertSame(first, b.config(), "parsed config is cached while unchanged");
        assertEquals("Admin", ((Map<?, ?>) b.config().get("meta")).get("updatedBy"));
        a.setEnabled(false);
        assertFalse(b.isEnabled());
    }

    @Test
    void corruptValueFallsBackToDefaults() {
        db.put(ThemeStore.CONFIG_KEY, "{broken");
        ThemeStore s = node();
        assertNull(s.config());
        assertTrue(s.isEnabled());
    }

    @Test
    void largeImagesAreChunkedAndReassembled() {
        ThemeStore s = node();
        byte[] png = new byte[200_000];
        byte[] sig = {(byte) 0x89, 'P', 'N', 'G', 13, 10, 26, 10};
        System.arraycopy(sig, 0, png, 0, sig.length);
        new java.util.Random(1).nextBytes(png);
        System.arraycopy(sig, 0, png, 0, sig.length);
        String url = "data:image/png;base64," + java.util.Base64.getEncoder().encodeToString(png);
        Asset a = s.putAsset(Asset.Kind.BACKGROUND, url);
        assertTrue(db.get(ThemeStore.ASSET_PREFIX + "background").startsWith(ThemeStore.CHUNK_MARKER));
        for (String v : db.values()) {
            assertTrue(v.length() <= ThemeStore.CHUNK);
        }
        assertEquals(a.hash, node().asset(Asset.Kind.BACKGROUND).hash, "another node reads the same image");
        s.removeAsset(Asset.Kind.BACKGROUND);
        assertTrue(db.isEmpty());
    }

    @Test
    void resetRemovesEverything() {
        ThemeStore s = node();
        s.save("{\"enabled\":false}");
        s.putAsset(Asset.Kind.LOGO, "data:image/png;base64,iVBORw0KGgoAAAAN");
        assertEquals(1, s.assetVersions().size());
        s.reset();
        assertTrue(db.isEmpty());
        assertTrue(s.isEnabled());
    }
}
