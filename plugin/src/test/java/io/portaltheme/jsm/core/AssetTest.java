package io.portaltheme.jsm.core;

import org.junit.jupiter.api.Test;

import java.nio.charset.StandardCharsets;
import java.util.Base64;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class AssetTest {

    private static final byte[] PNG = {(byte) 0x89, 'P', 'N', 'G', 13, 10, 26, 10, 0, 0, 0, 13};

    private static String dataUrl(String mime, byte[] bytes) {
        return "data:" + mime + ";base64," + Base64.getEncoder().encodeToString(bytes);
    }

    private static String svg(String body) {
        return dataUrl("image/svg+xml", body.getBytes(StandardCharsets.UTF_8));
    }

    @Test
    void acceptsMatchingRasterImage() {
        Asset a = Asset.fromDataUrl(Asset.Kind.LOGO, dataUrl("image/png", PNG));
        assertEquals("image/png", a.mimeType);
        assertEquals(16, a.hash.length());
        assertTrue(a.toDataUrl().startsWith("data:image/png;base64,"));
    }

    @Test
    void rejectsTypeMismatchAndUnknownTypes() {
        assertThrows(IllegalArgumentException.class, () -> Asset.fromDataUrl(Asset.Kind.LOGO, dataUrl("image/jpeg", PNG)));
        assertThrows(IllegalArgumentException.class, () -> Asset.fromDataUrl(Asset.Kind.LOGO, dataUrl("text/html", "<b>".getBytes())));
        assertThrows(IllegalArgumentException.class, () -> Asset.fromDataUrl(Asset.Kind.LOGO, "https://example.com/logo.png"));
    }

    @Test
    void enforcesSizeLimits() {
        byte[] big = new byte[Asset.Kind.FAVICON.maxBytes + 1];
        System.arraycopy(PNG, 0, big, 0, PNG.length);
        assertThrows(IllegalArgumentException.class, () -> Asset.fromDataUrl(Asset.Kind.FAVICON, dataUrl("image/png", big)));
    }

    @Test
    void acceptsPlainSvgAndRejectsActiveContent() {
        Asset.fromDataUrl(Asset.Kind.LOGO, svg("<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 10 10\">"
                + "<defs><linearGradient id=\"g\"/></defs><rect fill=\"url(#g)\" width=\"10\" height=\"10\"/></svg>"));
        String[] bad = {
            "<svg><script>alert(1)</script></svg>",
            "<svg onload=\"alert(1)\"></svg>",
            "<svg><a href=\"javascript:alert(1)\">x</a></svg>",
            "<svg><image href=\"https://evil.example/x.png\"/></svg>",
            "<svg><foreignObject><div/></foreignObject></svg>",
            "<svg><style>@import url(https://evil.example/a.css);</style></svg>"
        };
        for (String b : bad) {
            assertThrows(IllegalArgumentException.class, () -> Asset.fromDataUrl(Asset.Kind.LOGO, svg(b)), b);
        }
    }
}
