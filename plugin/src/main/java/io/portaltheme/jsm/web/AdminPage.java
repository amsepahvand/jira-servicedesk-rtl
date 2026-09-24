package io.portaltheme.jsm.web;

import com.atlassian.jira.component.ComponentAccessor;
import com.atlassian.webresource.api.assembler.PageBuilderService;
import io.portaltheme.jsm.core.Platform;

/**
 * Server-rendered shell of the admin page. The page itself is a small script application
 * ({@code web/admin/admin.js}); Jira's admin decorator adds the standard admin chrome and sidebar.
 */
final class AdminPage {

    private AdminPage() {
    }

    static void requireResources() {
        try {
            PageBuilderService pbs = ComponentAccessor.getOSGiComponentInstanceOfType(PageBuilderService.class);
            if (pbs != null) {
                pbs.assembler().resources().requireWebResource(Platform.PLUGIN_KEY + ":admin");
            }
        } catch (RuntimeException | LinkageError e) {
            // The page shows a clear message if its script does not load.
        }
    }

    static String render(String contextPath) {
        String ctx = escape(contextPath == null ? "" : contextPath);
        return "<!DOCTYPE html>\n<html>\n<head>\n"
                + "<title>Portal Theme</title>\n"
                + "<meta name=\"decorator\" content=\"atl.admin\">\n"
                + "<meta name=\"admin.active.section\" content=\"admin_plugins_menu/portal-theme-admin-section\">\n"
                + "<meta name=\"admin.active.tab\" content=\"portal-theme-admin-link\">\n"
                + "</head>\n<body>\n"
                + "<div id=\"pt-admin\" class=\"pt-admin\" data-context-path=\"" + ctx + "\">"
                + "<p class=\"pt-admin-boot\" role=\"status\">Loading portal theme settings…</p></div>\n"
                + "<noscript><p>The Portal Theme settings page needs JavaScript.</p></noscript>\n"
                + "</body>\n</html>\n";
    }

    private static String escape(String s) {
        return s.replace("&", "&amp;").replace("\"", "&quot;").replace("<", "&lt;").replace(">", "&gt;");
    }
}
