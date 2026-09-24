package com.atlassian.webresource.spi.condition;

import com.atlassian.plugin.PluginParseException;
import com.atlassian.webresource.api.QueryParams;
import com.atlassian.webresource.api.url.UrlBuilder;

import java.util.Map;

/**
 * Compile-time stub of the Web Resource Manager 7/8 (Jira 10+) interface. Not packaged into the
 * plugin: at runtime Jira provides the real interface. Signature verified against
 * atlassian-plugins-webresource-api 7.2.15 and 8.0.9.
 */
public interface UrlReadingCondition {
    void init(Map<String, String> params) throws PluginParseException;

    void addToUrl(UrlBuilder urlBuilder);

    boolean shouldDisplay(QueryParams params);
}
