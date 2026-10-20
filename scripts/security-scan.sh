#!/usr/bin/env bash
# Local Snyk run. Requires SNYK_TOKEN in the environment (never commit it).
# Writes security-reports/snyk-summary.json, which the Integrations page shows
# as the latest scan status. Snyk exit codes: 0 clean, 1 issues, 2 failure, 3 no project.
set -u
mkdir -p security-reports
if [ -z "${SNYK_TOKEN:-}" ]; then echo "SNYK_TOKEN not set — skipping Snyk (status stays 'not configured')."; exit 0; fi
run() { local name=$1; shift; npx --yes snyk "$@" --severity-threshold=high > "security-reports/$name.txt" 2>&1; echo $?; }
prod=$(run deps-prod test); dev=$(run deps-dev test --dev); code=$(run code code test)
summ() { case $1 in 0) echo "no high issues";; 1) echo "high issues found";; 2) echo "scan failed";; *) echo "not applicable";; esac; }
codesum=$(summ $code); grep -q "SNYK-CODE-0005" security-reports/code.txt 2>/dev/null && codesum="Snyk Code not enabled for this Snyk org"
cat > security-reports/snyk-summary.json <<JSON
{ "ranAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)", "results": {
  "production deps": { "exitCode": $prod, "summary": "$(summ $prod)" },
  "dev deps": { "exitCode": $dev, "summary": "$(summ $dev) (exceptions documented in .snyk)" },
  "code": { "exitCode": $code, "summary": "$codesum" } } }
JSON
cat security-reports/snyk-summary.json
