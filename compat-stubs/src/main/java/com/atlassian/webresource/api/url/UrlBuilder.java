package com.atlassian.webresource.api.url;

/** Compile-time stub (WRM 7/8). See {@code UrlReadingCondition} stub. */
public interface UrlBuilder {
    void addToHash(String name, Object value);

    void addToQueryString(String key, String value);
}
