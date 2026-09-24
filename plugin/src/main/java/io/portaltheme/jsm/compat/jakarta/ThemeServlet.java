package io.portaltheme.jsm.compat.jakarta;

import io.portaltheme.jsm.web.Exchange;
import io.portaltheme.jsm.web.ThemeHttp;

import jakarta.servlet.http.HttpServlet;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.BufferedReader;
import java.io.IOException;

/**
 * Servlet adapter for the <code>jakarta.servlet</code> API. Enabled only on the Jira versions that
 * use it (see the {@code <restrict>} element in atlassian-plugin.xml); all logic is in
 * {@link ThemeHttp}. Keep this class free of behaviour so both adapters stay identical.
 */
public class ThemeServlet extends HttpServlet {
    private static final long serialVersionUID = 1L;

    @Override
    protected void service(HttpServletRequest req, HttpServletResponse resp) throws IOException {
        req.setCharacterEncoding("UTF-8");
        ThemeHttp.handle(new ServletExchange(req, resp));
    }

    private static final class ServletExchange implements Exchange {
        private final HttpServletRequest req;
        private final HttpServletResponse resp;

        ServletExchange(HttpServletRequest req, HttpServletResponse resp) {
            this.req = req;
            this.resp = resp;
        }

        @Override
        public String method() {
            return req.getMethod();
        }

        @Override
        public String pathInfo() {
            return req.getPathInfo();
        }

        @Override
        public String contextPath() {
            return req.getContextPath();
        }

        @Override
        public String header(String name) {
            return req.getHeader(name);
        }

        @Override
        public String queryString() {
            return req.getQueryString();
        }

        @Override
        public String body(int maxChars) throws IOException {
            StringBuilder sb = new StringBuilder();
            char[] buf = new char[8192];
            BufferedReader r = req.getReader();
            int n;
            while ((n = r.read(buf)) > 0) {
                sb.append(buf, 0, n);
                if (sb.length() > maxChars) {
                    throw new IllegalArgumentException("Request body is too large");
                }
            }
            return sb.toString();
        }

        @Override
        public void status(int code) {
            resp.setStatus(code);
        }

        @Override
        public void setHeader(String name, String value) {
            resp.setHeader(name, value);
        }

        @Override
        public void write(byte[] bytes) throws IOException {
            resp.getOutputStream().write(bytes);
        }

        @Override
        public void sendRedirect(String location) throws IOException {
            resp.sendRedirect(location);
        }

        @Override
        public Object rawRequest() {
            return req;
        }

        @Override
        public Object rawResponse() {
            return resp;
        }
    }
}
