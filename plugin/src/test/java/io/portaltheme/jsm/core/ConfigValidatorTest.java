package io.portaltheme.jsm.core;

import org.junit.jupiter.api.Test;

import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class ConfigValidatorTest {

    @SuppressWarnings("unchecked")
    private static Map<String, Object> map(Object o) {
        return (Map<String, Object>) o;
    }

    @Test
    void keepsValidColoursAndDropsInvalidOnes() {
        ConfigValidator.Result r = ConfigValidator.validate(
                "{\"global\":{\"colors\":{\"primary\":\"#ABC\",\"accent\":\"red\",\"text\":\"#112233\",\"dark\":{\"surface\":\"#zzz\"}}}}");
        Map<String, Object> colors = map(map(r.config.get("global")).get("colors"));
        assertEquals("#abc", colors.get("primary"));
        assertEquals("#112233", colors.get("text"));
        assertFalse(colors.containsKey("accent"));
        assertFalse(map(colors.get("dark")).containsKey("surface"));
        assertEquals(2, r.warnings.size());
    }

    @Test
    void blocksScriptUrls() {
        ConfigValidator.Result r = ConfigValidator.validate(
                "{\"global\":{\"backToJira\":{\"url\":\"javascript:alert(1)\"},\"footer\":{\"links\":[{\"label\":\"a\",\"url\":\"/ok\"},"
                        + "{\"label\":\"b\",\"url\":\"https://example.com/x\"},{\"label\":\"c\",\"url\":\"data:text/html,x\"}]}}}");
        Map<String, Object> g = map(r.config.get("global"));
        assertNull(map(g.get("backToJira")).get("url"));
        String links = Json.write(map(g.get("footer")).get("links"));
        assertTrue(links.contains("/ok"));
        assertTrue(links.contains("https://example.com/x"));
        assertFalse(links.contains("data:text/html"));
    }

    @Test
    void customCssMayNotContainMarkup() {
        ConfigValidator.Result r = ConfigValidator.validate("{\"global\":{\"customCss\":\"a{}</style><script>\"}}");
        assertFalse(map(r.config.get("global")).containsKey("customCss"));
        ConfigValidator.Result ok = ConfigValidator.validate("{\"global\":{\"customCss\":\"html.pt a{color:var(--pt-brand)}\"}}");
        assertTrue(map(ok.config.get("global")).containsKey("customCss"));
    }

    @Test
    void portalOverridesNeedNumericIds() {
        ConfigValidator.Result r = ConfigValidator.validate("{\"portals\":{\"3\":{\"identity\":{}},\"abc\":{},\"4\":\"x\"}}");
        Map<String, Object> portals = map(r.config.get("portals"));
        assertTrue(portals.containsKey("3"));
        assertFalse(portals.containsKey("abc"));
        assertFalse(portals.containsKey("4"));
    }

    @Test
    void normalisesSchemaAndEnabledFlag() {
        ConfigValidator.Result r = ConfigValidator.validate("{\"enabled\":\"yes\"}");
        assertEquals(ConfigValidator.SCHEMA_VERSION, r.config.get("schemaVersion"));
        assertEquals(Boolean.TRUE, r.config.get("enabled"));
        assertEquals(Boolean.FALSE, ConfigValidator.validate("{\"enabled\":false}").config.get("enabled"));
    }

    @Test
    void rejectsOversizedOrBrokenDocuments() {
        assertThrows(IllegalArgumentException.class, () -> ConfigValidator.validate("not json"));
        StringBuilder big = new StringBuilder("{\"x\":\"");
        for (int i = 0; i < ConfigValidator.MAX_DOCUMENT_CHARS; i++) {
            big.append('a');
        }
        big.append("\"}");
        assertThrows(IllegalArgumentException.class, () -> ConfigValidator.validate(big.toString()));
    }
}
