package io.portaltheme.jsm.core;

import org.junit.jupiter.api.Test;

import static io.portaltheme.jsm.core.ThemeGate.Mode.BYPASS;
import static io.portaltheme.jsm.core.ThemeGate.Mode.LOGIN;
import static io.portaltheme.jsm.core.ThemeGate.Mode.PORTAL;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class ThemeGateTest {

    private static RequestInfo req(String path, String query, String cookie) {
        return new RequestInfo(path, query, cookie);
    }

    @Test
    void portalContextFollowsTheMasterSwitch() {
        RequestInfo r = req("/jira/servicedesk/customer/portals", "", "");
        assertTrue(ThemeGate.decide(PORTAL, r, () -> true));
        assertFalse(ThemeGate.decide(PORTAL, r, () -> false));
    }

    @Test
    void generalContextOnlyOnCustomerPortalUrls() {
        assertTrue(ThemeGate.decide(LOGIN, req("/servicedesk/customer/user/login", "destination=portals", ""), () -> true));
        assertFalse(ThemeGate.decide(LOGIN, req("/secure/Dashboard.jspa", "", ""), () -> true));
        assertFalse(ThemeGate.decide(LOGIN, req("/secure/admin/ViewApplicationProperties.jspa", "", ""), () -> true));
        assertFalse(ThemeGate.decide(LOGIN, req("/browse/SD-1", "", ""), () -> true));
        assertFalse(ThemeGate.decide(LOGIN, req("/jira/servicedesk/agent/SD/queues", "", ""), () -> true));
    }

    @Test
    void bypassNeverChangesServerDecisions() {
        // The bypass is client-side: the server keeps Jira's resource URLs stable.
        RequestInfo off = req("/servicedesk/customer/portals", "portalTheme=off", "portalTheme=off");
        assertTrue(ThemeGate.decide(PORTAL, off, () -> true));
        assertFalse(ThemeGate.decide(BYPASS, off, () -> true));
    }

    @Test
    void unknownRequestIsSafe() {
        assertTrue(ThemeGate.decide(PORTAL, null, () -> true));
        assertFalse(ThemeGate.decide(LOGIN, null, () -> true));
        assertFalse(ThemeGate.decide(BYPASS, null, () -> true));
    }
}
