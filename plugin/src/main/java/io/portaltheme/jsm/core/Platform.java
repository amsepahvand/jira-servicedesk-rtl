package io.portaltheme.jsm.core;

import com.atlassian.jira.application.ApplicationRoleManager;
import com.atlassian.jira.component.ComponentAccessor;
import com.atlassian.jira.permission.GlobalPermissionKey;
import com.atlassian.jira.user.ApplicationUser;
import com.atlassian.sal.api.pluginsettings.PluginSettings;
import com.atlassian.sal.api.pluginsettings.PluginSettingsFactory;

import java.lang.reflect.Method;

/**
 * The single place where the plugin talks to Jira services.
 *
 * <p>Services are looked up lazily through {@link ComponentAccessor} instead of constructor
 * injection. This keeps the plugin free of Spring Scanner / OSGi-namespace wiring, which differs
 * between Spring 5 (Jira 9/10) and Spring 6 (Jira 11). Every method used here was verified to have
 * the same signature in jira-api 9.12.10 and 11.3.8.
 *
 * <p>Methods whose signatures mention servlet types (WebSudo) are called reflectively so the same
 * bytecode works with {@code javax.servlet} and {@code jakarta.servlet}.
 */
public final class Platform {

    public static final String PLUGIN_KEY = "io.portaltheme.jsm-portal-theme";

    private static volatile ThemeStore store;

    private Platform() {
    }

    public static ThemeStore store() {
        ThemeStore s = store;
        if (s == null) {
            synchronized (Platform.class) {
                s = store;
                if (s == null) {
                    s = new ThemeStore(new SalSettings());
                    store = s;
                }
            }
        }
        return s;
    }

    /** Current user, or {@code null} when anonymous. */
    public static ApplicationUser currentUser() {
        try {
            return ComponentAccessor.getJiraAuthenticationContext().getLoggedInUser();
        } catch (RuntimeException e) {
            return null;
        }
    }

    /** Display name of the current user, or null. */
    public static String currentUserName() {
        ApplicationUser u = currentUser();
        try {
            return u == null ? null : u.getDisplayName();
        } catch (RuntimeException e) {
            return null;
        }
    }

    public static boolean isJiraAdmin() {
        ApplicationUser user = currentUser();
        if (user == null) {
            return false;
        }
        try {
            return ComponentAccessor.getGlobalPermissionManager().hasPermission(GlobalPermissionKey.ADMINISTER, user);
        } catch (RuntimeException e) {
            return false;
        }
    }

    /**
     * True for users who can use Jira itself (have an application role), as opposed to portal-only
     * customers. Drives the optional "Back to Jira" button.
     */
    public static boolean hasJiraAccess(ApplicationUser user) {
        if (user == null) {
            return false;
        }
        try {
            ApplicationRoleManager roles = ComponentAccessor.getComponent(ApplicationRoleManager.class);
            return roles != null && roles.hasAnyRole(user);
        } catch (RuntimeException e) {
            return false;
        }
    }

    public static String jiraVersion() {
        try {
            return ComponentAccessor.getComponent(com.atlassian.jira.util.BuildUtilsInfo.class).getVersion();
        } catch (RuntimeException e) {
            return "";
        }
    }

    // ------------------------------------------------------------------ WebSudo (reflective)

    /**
     * Returns true if the request may perform an administrative action. When secure administrator
     * sessions (WebSudo) are enabled and the session is not elevated, returns false.
     */
    public static boolean webSudoAllows(Object request) {
        Object mgr = webSudoManager();
        if (mgr == null) {
            return true; // WebSudo not available: fall back to the permission check alone
        }
        try {
            Method m = findSingleArg(webSudoApi(), "canExecuteRequest");
            return m == null || Boolean.TRUE.equals(m.invoke(mgr, request));
        } catch (ReflectiveOperationException | RuntimeException e) {
            return true;
        }
    }

    /** Marks the request as a WebSudo-protected one (extends the elevated session). */
    public static void webSudoWillExecute(Object request) {
        Object mgr = webSudoManager();
        if (mgr == null) {
            return;
        }
        try {
            Method m = findSingleArg(webSudoApi(), "willExecuteWebSudoRequest");
            if (m != null) {
                m.invoke(mgr, request);
            }
        } catch (ReflectiveOperationException | RuntimeException e) {
            // WebSudoSessionException or incompatible API: permission check still applies
        }
    }

    /** Redirects to the WebSudo login page. Returns false if that is not possible. */
    public static boolean webSudoEnforce(Object request, Object response) {
        Object mgr = webSudoManager();
        if (mgr == null) {
            return false;
        }
        try {
            for (Method m : webSudoApi().getMethods()) {
                if ("enforceWebSudoProtection".equals(m.getName()) && m.getParameterCount() == 2) {
                    m.invoke(mgr, request, response);
                    return true;
                }
            }
        } catch (ReflectiveOperationException | RuntimeException e) {
            return false;
        }
        return false;
    }

    private static Object webSudoManager() {
        try {
            Class<?> c = webSudoApi();
            return c == null ? null : ComponentAccessor.getOSGiComponentInstanceOfType(c);
        } catch (RuntimeException | LinkageError e) {
            return null;
        }
    }

    /** The SAL interface (methods are looked up on it, not on the possibly non-public implementation). */
    private static Class<?> webSudoApi() {
        try {
            return Class.forName("com.atlassian.sal.api.websudo.WebSudoManager");
        } catch (ClassNotFoundException | LinkageError e) {
            return null;
        }
    }

    private static Method findSingleArg(Class<?> c, String name) {
        if (c == null) {
            return null;
        }
        for (Method m : c.getMethods()) {
            if (name.equals(m.getName()) && m.getParameterCount() == 1) {
                return m;
            }
        }
        return null;
    }

    // ------------------------------------------------------------------ settings

    private static final class SalSettings implements ThemeStore.Settings {
        private PluginSettings settings() {
            PluginSettingsFactory f = ComponentAccessor.getOSGiComponentInstanceOfType(PluginSettingsFactory.class);
            if (f == null) {
                throw new IllegalStateException("PluginSettingsFactory is not available");
            }
            return f.createGlobalSettings();
        }

        @Override
        public String get(String key) {
            Object v = settings().get(key);
            return v instanceof String ? (String) v : null;
        }

        @Override
        public void put(String key, String value) {
            settings().put(key, value);
        }

        @Override
        public void remove(String key) {
            settings().remove(key);
        }
    }
}
