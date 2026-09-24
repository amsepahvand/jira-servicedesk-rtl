package io.portaltheme.jsm.core;

import java.util.function.BooleanSupplier;

/**
 * Decides, while Jira renders a page, whether the theme's web resources are included at all.
 *
 * <p>This is what keeps the theme strictly scoped: when the gate says no, not a single byte of the
 * theme is sent, so the page is plain Jira. Used by the per-version web-resource conditions in the
 * {@code compat.wrm6}/{@code compat.wrm7} packages.
 *
 * <ul>
 *   <li>{@link Mode#PORTAL} – resources in the {@code customerportal} context (all portal pages
 *       that JSM renders itself).</li>
 *   <li>{@link Mode#LOGIN} – resources in {@code atl.general}, which must only activate on customer
 *       portal URLs. Needed because on Jira 10+ the portal login/sign-up pages are rendered by the
 *       generic Jira login page, which does not load {@code customerportal}.</li>
 *   <li>{@link Mode#BYPASS} – the tiny script that remembers {@code ?portalTheme=off} for the
 *       browser session and shows the "theme is off" pill.</li>
 * </ul>
 */
public final class ThemeGate {

    public static final String PARAM = "portalTheme";
    public static final String COOKIE = "portalTheme";
    static final String PORTAL_PATH = "/servicedesk/customer/";

    public enum Mode {
        PORTAL, LOGIN, BYPASS;

        public static Mode parse(String s) {
            if (s == null) {
                return PORTAL;
            }
            switch (s.trim().toLowerCase(java.util.Locale.ROOT)) {
                case "login":
                    return LOGIN;
                case "bypass":
                    return BYPASS;
                default:
                    return PORTAL;
            }
        }
    }

    private ThemeGate() {
    }

    /** Production entry point: reads the current request and the stored switch. */
    public static boolean shouldInclude(Mode mode) {
        try {
            return decide(mode, RequestInfo.current(), () -> Platform.store().isEnabled());
        } catch (RuntimeException e) {
            return false; // never break page rendering because of the theme
        }
    }

    /** Pure decision logic (unit-tested). {@code request} may be null if it could not be read. */
    public static boolean decide(Mode mode, RequestInfo request, BooleanSupplier enabled) {
        if (request == null) {
            // Unknown request: only the portal context is safe to theme (it is portal-only by
            // definition). The front end still honours ?portalTheme=off on its own.
            return mode == Mode.PORTAL && enabled.getAsBoolean();
        }
        boolean portalPath = request.path.contains(PORTAL_PATH);
        boolean bypassed = isBypassed(request);
        switch (mode) {
            case BYPASS:
                return portalPath && bypassed;
            case LOGIN:
                if (!portalPath) {
                    return false; // the common case on every non-portal Jira page: cheap exit
                }
                return !bypassed && enabled.getAsBoolean();
            case PORTAL:
            default:
                return !bypassed && enabled.getAsBoolean();
        }
    }

    /** {@code ?portalTheme=off}, or the session cookie set by it, unless {@code ?portalTheme=on}. */
    static boolean isBypassed(RequestInfo request) {
        String p = request.queryParam(PARAM);
        if ("off".equals(p)) {
            return true;
        }
        if ("on".equals(p)) {
            return false;
        }
        return "off".equals(request.cookie(COOKIE));
    }
}
