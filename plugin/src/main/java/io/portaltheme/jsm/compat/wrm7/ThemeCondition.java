package io.portaltheme.jsm.compat.wrm7;

import com.atlassian.plugin.PluginParseException;
import com.atlassian.webresource.api.QueryParams;
import com.atlassian.webresource.api.url.UrlBuilder;
import com.atlassian.webresource.spi.condition.UrlReadingCondition;
import io.portaltheme.jsm.core.ThemeGate;

import java.util.Map;

/**
 * Web-resource condition for Jira 10 and 11 (Web Resource Manager 7/8).
 *
 * <p>The decision is taken while the page is rendered ({@link #addToUrl}) and encoded into the
 * resource URL, as the URL-reading condition contract requires; {@link #shouldDisplay} only reads
 * it back. All logic lives in {@link ThemeGate}. Parameter {@code mode}: portal | login | bypass.
 */
public class ThemeCondition implements UrlReadingCondition {

    private ThemeGate.Mode mode = ThemeGate.Mode.PORTAL;
    private String flag = "pt";

    @Override
    public void init(Map<String, String> params) throws PluginParseException {
        mode = ThemeGate.Mode.parse(params.get("mode"));
        flag = "pt-" + mode.name().toLowerCase(java.util.Locale.ROOT);
    }

    @Override
    public void addToUrl(UrlBuilder urlBuilder) {
        if (ThemeGate.shouldInclude(mode)) {
            urlBuilder.addToQueryString(flag, "1");
        }
    }

    @Override
    public boolean shouldDisplay(QueryParams params) {
        return "1".equals(params.get(flag));
    }
}
