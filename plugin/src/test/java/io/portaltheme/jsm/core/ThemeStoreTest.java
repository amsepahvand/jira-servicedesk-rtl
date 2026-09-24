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
