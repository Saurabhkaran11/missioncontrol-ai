#!/usr/bin/env bash
# Local Snyk run. Requires SNYK_TOKEN in the environment (never commit it).
# Writes security-reports/snyk-summary.json, which the Integrations page shows
# as the latest scan status. Exit codes per Snyk docs: 0 clean, 1 issues, 2 failure, 3 no project.
set -u
mkdir -p security-reports
if [ -z "${SNYK_TOKEN:-}" ]; then echo "SNYK_TOKEN not set — skipping Snyk (status stays 'not configured')."; exit 0; fi
run() { local name=$1; shift; npx --yes snyk "$@" --severity-threshold=high --json-file-output="security-reports/$name.json" >/dev/null 2>&1; echo $?; }
deps=$(run deps test); code=$(run code code test); iac=$(run iac iac test)
summ() { case $1 in 0) echo "no high issues";; 1) echo "high issues found";; 2) echo "scan failed";; *) echo "not applicable";; esac; }
cat > security-reports/snyk-summary.json <<JSON
{ "ranAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)", "results": {
  "dependencies": { "exitCode": $deps, "summary": "$(summ $deps)" },
  "code": { "exitCode": $code, "summary": "$(summ $code)" },
  "iac": { "exitCode": $iac, "summary": "$(summ $iac)" } } }
JSON
cat security-reports/snyk-summary.json
