package io.portaltheme.jsm.core;

import org.junit.jupiter.api.Test;

import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class JsonTest {

    @Test
    void roundTripsNestedValues() {
        String in = "{\"a\":1,\"b\":[true,false,null,\"x\"],\"c\":{\"d\":1.5,\"e\":\"فارسی \\u2764\"}}";
        Map<String, Object> m = Json.parseObject(in);
        assertEquals(1L, m.get("a"));
        assertEquals(Arrays.asList(true, false, null, "x"), m.get("b"));
        @SuppressWarnings("unchecked")
        Map<String, Object> c = (Map<String, Object>) m.get("c");
        assertEquals(1.5, c.get("d"));
        assertEquals("فارسی ❤", c.get("e"));
        assertEquals(m, Json.parseObject(Json.write(m)));
    }

    @Test
    void writerEscapesMarkupForSafeEmbedding() {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("x", "</script><img onerror=1>&\u2028");
        String out = Json.write(m);
        assertFalse(out.contains("<"));
        assertFalse(out.contains(">"));
        assertFalse(out.contains("&"));
        assertTrue(out.contains("\\u2028"));
        assertEquals("</script><img onerror=1>&\u2028", Json.parseObject(out).get("x"));
    }

    @Test
    void rejectsInvalidAndDeepInput() {
        assertThrows(Json.JsonException.class, () -> Json.parse("{\"a\":}"));
        assertThrows(Json.JsonException.class, () -> Json.parse("[1,2"));
        assertThrows(Json.JsonException.class, () -> Json.parse("{} x"));
        StringBuilder deep = new StringBuilder();
        for (int i = 0; i < 50; i++) {
            deep.append('[');
        }
        assertThrows(Json.JsonException.class, () -> Json.parse(deep.toString()));
    }

    @Test
    void parsesEmptyContainers() {
        assertEquals(new LinkedHashMap<>(), Json.parse("{}"));
        assertEquals(List.of(), Json.parse(" [ ] "));
    }
}
