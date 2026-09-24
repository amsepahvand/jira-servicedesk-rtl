package io.portaltheme.jsm.core;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.Arrays;
import java.util.Base64;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Pattern;

/**
 * An uploaded image (logo, dark logo, favicon) stored as a base64 data URL in plugin settings.
 *
 * <p>Images are stored in the database, not the file system, so every Data Center node serves the
 * same bytes. They are small by design (see {@link Kind#maxBytes}).
 *
 * <p>Security: only raster formats whose magic bytes match the declared type are accepted. SVG is
 * accepted only if it contains no scripts, event handlers, external references or foreign
 * objects, and it is always served with a sandboxing Content-Security-Policy.
 */
public final class Asset {

    /** The asset slots the theme knows about. */
    public enum Kind {
        LOGO("logo", 512 * 1024),
        LOGO_DARK("logoDark", 512 * 1024),
        FAVICON("favicon", 128 * 1024);

        public final String key;
        public final int maxBytes;

        Kind(String key, int maxBytes) {
            this.key = key;
            this.maxBytes = maxBytes;
        }

        public static Kind fromKey(String key) {
            for (Kind k : values()) {
                if (k.key.equals(key)) {
                    return k;
                }
            }
            return null;
        }
    }

    private static final Map<String, String> MIME_EXT;

    static {
        Map<String, String> m = new LinkedHashMap<>();
        m.put("image/png", "png");
        m.put("image/jpeg", "jpg");
        m.put("image/webp", "webp");
        m.put("image/gif", "gif");
        m.put("image/svg+xml", "svg");
        m.put("image/x-icon", "ico");
        m.put("image/vnd.microsoft.icon", "ico");
        MIME_EXT = Collections.unmodifiableMap(m);
    }

    private static final Pattern DATA_URL = Pattern.compile("data:([a-z0-9.+/-]+);base64,([A-Za-z0-9+/=\\s]+)");
    private static final Pattern SVG_FORBIDDEN = Pattern.compile(
            "(?is)<\\s*script|<\\s*foreignobject|<\\s*iframe|<\\s*embed|<\\s*object|\\son[a-z]+\\s*=|javascript:|"
                    + "(?:xlink:)?href\\s*=\\s*[\"']\\s*(?!#|data:image/)|<!entity|<\\?xml-stylesheet|@import|url\\(\\s*['\"]?\\s*(?!#|data:image/)");

    public final String mimeType;
    public final byte[] bytes;
    public final String hash;

    private Asset(String mimeType, byte[] bytes) {
        this.mimeType = mimeType;
        this.bytes = bytes;
        this.hash = sha256(bytes).substring(0, 16);
    }

    /** Parses and validates a data URL for the given slot. Throws {@link IllegalArgumentException}. */
    public static Asset fromDataUrl(Kind kind, String dataUrl) {
        if (dataUrl == null) {
            throw new IllegalArgumentException("No image data");
        }
        java.util.regex.Matcher m = DATA_URL.matcher(dataUrl.trim());
        if (!m.matches()) {
            throw new IllegalArgumentException("Image must be a base64 data URL");
        }
        String mime = m.group(1).toLowerCase(Locale.ROOT);
        if (!MIME_EXT.containsKey(mime)) {
            throw new IllegalArgumentException("Unsupported image type " + mime + " (use PNG, JPEG, WebP, GIF, SVG or ICO)");
        }
        byte[] bytes;
        try {
            bytes = Base64.getMimeDecoder().decode(m.group(2));
        } catch (IllegalArgumentException e) {
            throw new IllegalArgumentException("Image data is not valid base64");
        }
        if (bytes.length == 0) {
            throw new IllegalArgumentException("Image is empty");
        }
        if (bytes.length > kind.maxBytes) {
            throw new IllegalArgumentException("Image is too large (max " + (kind.maxBytes / 1024) + " KB)");
        }
        checkSignature(mime, bytes);
        return new Asset(mime, bytes);
    }

    public String toDataUrl() {
        return "data:" + mimeType + ";base64," + Base64.getEncoder().encodeToString(bytes);
    }

    public String extension() {
        return MIME_EXT.get(mimeType);
    }

    public boolean isSvg() {
        return "image/svg+xml".equals(mimeType);
    }

    private static void checkSignature(String mime, byte[] b) {
        boolean ok;
        switch (mime) {
            case "image/png":
                ok = startsWith(b, 0x89, 'P', 'N', 'G');
                break;
            case "image/jpeg":
                ok = startsWith(b, 0xFF, 0xD8, 0xFF);
                break;
            case "image/gif":
                ok = startsWith(b, 'G', 'I', 'F', '8');
                break;
            case "image/webp":
                ok = startsWith(b, 'R', 'I', 'F', 'F') && b.length > 12 && b[8] == 'W' && b[9] == 'E' && b[10] == 'B' && b[11] == 'P';
                break;
            case "image/x-icon":
            case "image/vnd.microsoft.icon":
                ok = startsWith(b, 0x00, 0x00, 0x01, 0x00) || startsWith(b, 0x89, 'P', 'N', 'G');
                break;
            case "image/svg+xml":
                String text = new String(b, StandardCharsets.UTF_8);
                ok = text.toLowerCase(Locale.ROOT).contains("<svg");
                if (ok && SVG_FORBIDDEN.matcher(text).find()) {
                    throw new IllegalArgumentException(
                            "SVG contains scripts, event handlers or external references; export a plain SVG or use PNG");
                }
                break;
            default:
                ok = false;
        }
        if (!ok) {
            throw new IllegalArgumentException("File content does not match its type " + mime);
        }
    }

    private static boolean startsWith(byte[] b, int... sig) {
        if (b.length < sig.length) {
            return false;
        }
        for (int i = 0; i < sig.length; i++) {
            if ((b[i] & 0xFF) != (sig[i] & 0xFF)) {
                return false;
            }
        }
        return true;
    }

    static String sha256(byte[] data) {
        try {
            byte[] d = MessageDigest.getInstance("SHA-256").digest(data);
            StringBuilder sb = new StringBuilder();
            for (byte x : d) {
                sb.append(String.format("%02x", x & 0xFF));
            }
            return sb.toString();
        } catch (NoSuchAlgorithmException e) {
            return Integer.toHexString(Arrays.hashCode(data));
        }
    }
}
