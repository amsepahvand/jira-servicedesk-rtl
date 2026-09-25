#!/bin/sh
# Uploads an already built JAR to a local test Jira (uninstalling the previous build first).
# Usage: JIRA=http://localhost:2991/jira tools/upload.sh plugin/target/jsm-portal-theme-<v>.jar
set -e
J=${JIRA:-http://localhost:2990/jira}
curl -s -u admin:admin -X DELETE -o /dev/null "$J/rest/plugins/1.0/io.portaltheme.jsm-portal-theme-key"
sleep 2
TOKEN=$(curl -s -u admin:admin -I "$J/rest/plugins/1.0/?os_authType=basic" | grep -i '^upm-token' | tr -d '\r' | awk '{print $2}')
curl -s -u admin:admin -H "X-Atlassian-Token: no-check" -F "plugin=@$1" "$J/rest/plugins/1.0/?token=$TOKEN" > /dev/null
sleep 8
curl -s -u admin:admin "$J/rest/plugins/1.0/io.portaltheme.jsm-portal-theme-key" | python3 -c "import json,sys;d=json.load(sys.stdin);print('deployed',d.get('version'),'enabled',d.get('enabled'),'modules',sum(1 for m in d['modules'] if m['enabled']),'/',len(d['modules']))"
