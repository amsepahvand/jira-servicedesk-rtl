package io.portaltheme.jsm.web;

import com.atlassian.jira.user.ApplicationUser;
import com.atlassian.json.marshal.Jsonable;
import com.atlassian.webresource.api.data.WebResourceDataProvider;
import io.portaltheme.jsm.core.Json;
import io.portaltheme.jsm.core.Platform;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Inlines the theme configuration into the portal page, so the front end needs no extra request
 * before it can paint (no flash of the default Jira look, no REST round trip).
 *
 * <p>Front end: {@code WRM.data.claim("io.portaltheme.jsm-portal-theme:theme-core.config")}.
 *
 * <p>Version note: the interface extends Guava's {@code Supplier} on Jira 9 and
 * {@code java.util.function.Supplier} on Jira 10+. Both erase to {@code Object get()}, which this
 * class provides, so one class works on every version.
 */
public class ThemeDataProvider implements WebResourceDataProvider {

    @Override
    public Jsonable get() {
        Map<String, Object> data = new LinkedHashMap<>();
        try {
            data.put("config", Platform.store().config());
            data.put("assets", Platform.store().assetVersions());
            ApplicationUser user = Platform.currentUser();
            Map<String, Object> viewer = new LinkedHashMap<>();
            viewer.put("authenticated", user != null);
            viewer.put("jiraAccess", Platform.hasJiraAccess(user));
            viewer.put("admin", user != null && Platform.isJiraAdmin());
            data.put("viewer", viewer);
            data.put("jiraVersion", Platform.jiraVersion());
        } catch (RuntimeException e) {
            data.put("error", "config-unavailable");
        }
        final String json = Json.write(data);
        return writer -> writer.write(json);
    }
}
