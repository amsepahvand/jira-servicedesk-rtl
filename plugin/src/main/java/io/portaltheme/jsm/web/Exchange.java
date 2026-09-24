package io.portaltheme.jsm.web;

import java.io.IOException;

/**
 * The part of an HTTP request/response the theme needs, independent of {@code javax.servlet} vs
 * {@code jakarta.servlet}. Implemented by the two thin servlet adapters in {@code compat.javax} and
 * {@code compat.jakarta}; everything else is written once against this interface.
 */
public interface Exchange {
    String method();

    /** Path below the servlet mapping, e.g. {@code /admin} or {@code /api/config}. */
    String pathInfo();

    String contextPath();

    String header(String name);

    String queryString();

    /** Reads the body as UTF-8; fails if it is larger than {@code maxChars}. */
    String body(int maxChars) throws IOException;

    void status(int code);

    void setHeader(String name, String value);

    void write(byte[] bytes) throws IOException;

    void sendRedirect(String location) throws IOException;

    /** The underlying servlet request (for reflective WebSudo calls). */
    Object rawRequest();

    Object rawResponse();
}
