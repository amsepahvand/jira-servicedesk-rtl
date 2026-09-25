#!/bin/sh
# Local QA loop: bump the build number (Jira caches resources per plugin version), build, test,
# and upload to the local AMPS Jira through UPM. Usage: tools/dev-deploy.sh <version>
set -e
cd "$(dirname "$0")/.."
V="$1"
OLD=$(sed -n 's#^    <version>\(.*\)</version>#\1#p' pom.xml | head -1)
sed -i '' "s#<version>$OLD</version>#<version>$V</version>#" pom.xml compat-stubs/pom.xml plugin/pom.xml
sed -i '' "s/PT.version = '[^']*'/PT.version = '$V'/" plugin/src/main/resources/web/js/pt-namespace.js
export JAVA_HOME=/opt/homebrew/opt/openjdk@17
mvn -B -q -o install > /tmp/pt-build.log 2>&1 || { tail -30 /tmp/pt-build.log; exit 1; }
node plugin/src/test/js/engine.test.js | tail -1
J=http://localhost:2990/jira
# Uninstall first: UPM treats a pre-release build (1.1.0-b2) as older than 1.1.0 and skips it.
curl -s -u admin:admin -X DELETE -o /dev/null "$J/rest/plugins/1.0/io.portaltheme.jsm-portal-theme-key"
sleep 2
TOKEN=$(curl -s -u admin:admin -I "$J/rest/plugins/1.0/?os_authType=basic" | grep -i '^upm-token' | tr -d '\r' | awk '{print $2}')
curl -s -u admin:admin -H "X-Atlassian-Token: no-check" -F "plugin=@plugin/target/jsm-portal-theme-$V.jar" "$J/rest/plugins/1.0/?token=$TOKEN" > /dev/null
sleep 8
curl -s -u admin:admin "$J/rest/plugins/1.0/io.portaltheme.jsm-portal-theme-key" | python3 -c "import json,sys;d=json.load(sys.stdin);print('deployed',d.get('version'),'enabled',d.get('enabled'),'modules',sum(1 for m in d['modules'] if m['enabled']),'/',len(d['modules']))"
