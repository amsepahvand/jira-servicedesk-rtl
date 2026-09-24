package io.portaltheme.jsm.core;

import java.lang.reflect.Method;

/**
 * Servlet-API-neutral snapshot of the request being rendered.
 *
 * <p>Web-resource conditions run while Jira renders a page, but their API gives no access to the
 * request. Jira keeps it in {@code com.atlassian.jira.web.ExecutingHttpRequest}, whose return type
 * is {@code javax.servlet.http.HttpServletRequest} on Jira 9/10 and
 * {@code jakarta.servlet.http.HttpServletRequest} on Jira 11. Reading it reflectively lets one
 * class serve all versions. If anything fails, {@link #current()} returns {@code null} and callers
 * choose the safe behaviour.
 */
public final class RequestInfo {

    public final String path;
    public final String query;
    public final String cookieHeader;

    public RequestInfo(String path, String query, String cookieHeader) {
        this.path = path == null ? "" : path;
        this.query = query == null ? "" : query;
        this.cookieHeader = cookieHeader == null ? "" : cookieHeader;
    }

    public static RequestInfo current() {
        try {
            Class<?> holder = Class.forName("com.atlassian.jira.web.ExecutingHttpRequest");
            Object req = holder.getMethod("get").invoke(null);
            if (req == null) {
                return null;
            }
            return fromServletRequest(req);
        } catch (ReflectiveOperationException | RuntimeException | LinkageError e) {
            return null;
        }
    }

    /** Works with a javax or jakarta {@code HttpServletRequest}. */
    public static RequestInfo fromServletRequest(Object req) throws ReflectiveOperationException {
        Class<?> api = servletRequestInterface(req.getClass());
        String uri = (String) call(api, req, "getRequestURI");
        String query = (String) call(api, req, "getQueryString");
        Method header = api.getMethod("getHeader", String.class);
        String cookie = (String) header.invoke(req, "Cookie");
        // Pages rendered after an internal forward (e.g. the Jira 10+/11 login page shown for
        // /servicedesk/customer/user/login) report the forward target as request URI. The URL the
        // browser asked for is kept in the standard forward attributes.
        Method attr = findMethod(api, "getAttribute", String.class);
        if (attr != null) {
            for (String prefix : new String[] {"jakarta", "javax"}) {
                Object original = attr.invoke(req, prefix + ".servlet.forward.request_uri");
                if (original instanceof String && !((String) original).isEmpty()) {
                    Object originalQuery = attr.invoke(req, prefix + ".servlet.forward.query_string");
                    return new RequestInfo((String) original, originalQuery instanceof String ? (String) originalQuery : query, cookie);
                }
            }
        }
        return new RequestInfo(uri, query, cookie);
    }

    private static Method findMethod(Class<?> c, String name, Class<?>... types) {
        try {
            return c.getMethod(name, types);
        } catch (NoSuchMethodException e) {
            return null;
        }
    }

    private static Object call(Class<?> api, Object target, String name) throws ReflectiveOperationException {
        return api.getMethod(name).invoke(target);
    }

    /** Finds the public HttpServletRequest interface so reflection never touches internal classes. */
    private static Class<?> servletRequestInterface(Class<?> c) {
        for (Class<?> k = c; k != null; k = k.getSuperclass()) {
            for (Class<?> i : k.getInterfaces()) {
                Class<?> found = findHttpRequest(i);
                if (found != null) {
                    return found;
                }
            }
        }
        return c;
    }

    private static Class<?> findHttpRequest(Class<?> i) {
        String n = i.getName();
        if ("javax.servlet.http.HttpServletRequest".equals(n) || "jakarta.servlet.http.HttpServletRequest".equals(n)) {
            return i;
        }
        for (Class<?> p : i.getInterfaces()) {
            Class<?> f = findHttpRequest(p);
            if (f != null) {
                return f;
            }
        }
        return null;
    }

    /** Value of a query parameter (first occurrence, not URL-decoded beyond '+'), or null. */
    public String queryParam(String name) {
        for (String part : query.split("&")) {
            int eq = part.indexOf('=');
            String k = eq < 0 ? part : part.substring(0, eq);
            if (k.equals(name)) {
                return eq < 0 ? "" : part.substring(eq + 1).replace('+', ' ');
            }
        }
        return null;
    }

    public String cookie(String name) {
        for (String part : cookieHeader.split(";")) {
            String p = part.trim();
            int eq = p.indexOf('=');
            if (eq > 0 && p.substring(0, eq).equals(name)) {
                return p.substring(eq + 1);
            }
        }
        return null;
    }
}
