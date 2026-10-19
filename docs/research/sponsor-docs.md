# Sponsor and tooling docs: verified research

Researched 2026-10-19 against official docs, official GitHub repos, and the npm registry.

How to read this file:

- **VERIFIED** means the fact was read from an official source cited next to it.
- **UNVERIFIED** means no official source confirmed it. Do not build on it without checking first.

---

## 1. RocketRide

### What it is

- VERIFIED: The site describes RocketRide as an "AI meta-harness built on a C++ runtime". The tagline on the page is "Open source | Meta-Harness | Built for production". Source: https://rocketride.org
- VERIFIED: It is an open-source (MIT) AI pipeline engine. Pipelines are portable `.pipe` JSON files that run on a multithreaded C++ engine. Source: https://github.com/rocketride-org/rocketride-server

### Official links

- Docs: https://docs.rocketride.org/
- LLM index of all doc pages: https://docs.rocketride.org/llms.txt
- GitHub: https://github.com/rocketride-org/rocketride-server
  - The default branch is `develop`.
- TypeScript SDK pages:
  - https://docs.rocketride.org/clients/typescript
  - https://docs.rocketride.org/clients/typescript/reference.md
  - https://docs.rocketride.org/clients/typescript/pipelines.md
  - https://docs.rocketride.org/clients/typescript/configuration.md
  - https://docs.rocketride.org/clients/typescript/connection.md
- n8n integration guide: https://github.com/rocketride-org/rocketride-server/blob/develop/docs/public/product/connect/n8n.md
- n8n node reference: https://docs.rocketride.org/nodes/tool_n8n
- Webhook pipeline example: https://docs.rocketride.org/examples/webhook-pipeline.md

### Packages

- VERIFIED: npm `rocketride`, version 1.4.0 on npm at time of writing. Install with `npm install rocketride`.
- VERIFIED: PyPI `rocketride`. Install with `pip install rocketride`.
- VERIFIED: There is an n8n community package, `n8n-nodes-rocketride`, with a **RocketRide** action node and a **RocketRide Trigger** node. It needs n8n 1.94.0 or later.
  - The docs say "Once the package is published to npm". `npm view n8n-nodes-rocketride` returned an error.
  - UNVERIFIED: whether the package is actually published on npm yet.

### Auth and transport (TypeScript SDK)

- VERIFIED: The SDK uses a WebSocket protocol called DAP. It is not REST.
  - Default WebSocket path: `/task/service`.
- VERIFIED: Constructor: `new RocketRideClient({ auth, uri, persist?, requestTimeout?, onEvent?, onConnected?, onDisconnected?, onConnectError?, env?, ... })`.
- VERIFIED: Environment variables:
  - `ROCKETRIDE_URI`
  - `ROCKETRIDE_APIKEY`
  - `ROCKETRIDE_TOKEN`, which is accepted by the CLI only.
  - The README also mentions `ROCKETRIDE_AUTH` for Cloud.
  - The TypeScript config page lists `ROCKETRIDE_APIKEY`. Prefer that one for the TypeScript SDK.
- VERIFIED: In Node, the SDK reads `process.env`. It does **not** load `.env` files itself.
- VERIFIED: URIs:
  - Cloud: `https://api.rocketride.ai` or `wss://api.rocketride.ai`.
  - Local or Docker: `ws://localhost:5565`.
  - An `http://` or `ws://` URI silently downgrades to an unencrypted connection.
- VERIFIED: Docker image: `ghcr.io/rocketride-org/rocketride-engine:latest`, on port 5565.

### Run, status and cancel (TypeScript SDK, quoted from the reference)

```ts
import { RocketRideClient } from 'rocketride';

const client = new RocketRideClient({ auth: process.env.ROCKETRIDE_APIKEY!, uri: 'https://api.rocketride.ai' });
await client.connect();                                   // attach + login

// use(options?: { token?, filepath?, pipeline?, source?, threads?, useExisting?, args?, ttl?,
//   pipelineTraceLevel?: 'none'|'metadata'|'summary'|'full', name?, env? })
//   : Promise<Record<string, any> & { token: string }>   // also `reused: true` when useExisting reattached
const { token } = await client.use({ pipeline: pipeObject, token: `tk_${crypto.randomUUID()}`, ttl: 3600 });

// send(token, data: string|Uint8Array, objinfo?, mimetype?, onSSE?) : Promise<PIPELINE_RESULT | undefined>
const out = await client.send(token, JSON.stringify({ q: 'hi' }), { name: 'input.json' }, 'application/json');

// getTaskStatus(token, { timeout?: number|false }) : Promise<TASK_STATUS>
//   TASK_STATUS includes completedCount, totalCount, completed, state, exitCode, ...
const status = await client.getTaskStatus(token);

await client.terminate(token);   // terminate(token): Promise<void>. This is the cancel/stop call.
await client.disconnect();
```

Notes on the calls above:

- VERIFIED: There is no separate "cancel" method. `terminate(token)` stops the pipeline and frees its server resources.
- VERIFIED: Pass the pipeline object to `use({ pipeline })` as-is. Do not wrap it in `{ pipeline: ... }`.
- VERIFIED: Custom task tokens must keep the `tk_` prefix and must be unguessable.
  - Without a custom token, a second `use()` of the same pipe fails with "Pipeline is already running."
- VERIFIED: For push events instead of polling, use `addMonitor({ token }, ['apaevt_status_upload','apaevt_status_processing'])`. Events arrive in the `onEvent` callback.
- VERIFIED: `validate({ pipeline, source? })` checks a pipeline on the server without running it.
- VERIFIED: `RocketRideClient.withConnection(config, async (client) => ...)` handles one-off scoped use.

### Health and test calls

- VERIFIED: `ping(token?)`: Promise<void>. It throws on failure.
- VERIFIED: `getConnectionInfo()` returns `{ connected, transport, uri }`.
- VERIFIED: `getServices()` lists the available node types.

### Webhook (HTTP) access to a running pipeline

- VERIFIED: A pipeline that starts with a `webhook`, `chat` or `dropper` source is callable over HTTP.
- VERIFIED: Example URL from the docs: `http://localhost:5567/webhook/<project_id>/<source_id>`.
  - The legacy `/webhook` URL still works.
- VERIFIED: Header: `Authorization: Bearer <public pk_ key>`.
- VERIFIED: The pipeline's `response` node decides what comes back, for example `{ "answer": "..." }`.

### Native nodes

- VERIFIED: The n8n node has provider id `tool_n8n` and sits in the **Data** category.
- VERIFIED: `tool_n8n` config fields:

  | Field | Default |
  | --- | --- |
  | `baseUrl` | `http://localhost:5678` |
  | `workflow` | the webhook path |
  | `mode` | `sync` (other value: `async`) |
  | `payloadMode` | `simple` (other value: `structured`) |
  | `syncTimeout` | 30 |
  | `asyncTimeout` | 120 |
  | `apiKey` | sent as `X-N8N-API-KEY` |
  | `verifyTls` | — |
  | `readOnly` | `true` |
  | `webhookAuth` | `none` |
  | `webhookHeaderName` | — |
  | `webhookHeaderValue` | — |
  | `webhookUser` | — |
  | `webhookPassword` | — |
  | `webhookToken` | sent as `Authorization: Bearer` |

- VERIFIED: Payload the `tool_n8n` node sends to n8n:
  - In `simple` mode, `$json.body` is `{ "data": "<text>" }`.
  - In `structured` mode, `$json.body` is `{ "text", "documents": [{ "content", "metadata" }] }`.
  - In `async` mode, it also injects `_rr_correlation_id`.
- VERIFIED: Agent tool functions:
  - `n8n.trigger_workflow`
  - `n8n.list_workflows`
  - `n8n.get_workflow`
  - `n8n.list_executions`
  - `n8n.get_execution`
  - `n8n.activate_workflow`
  - `n8n.deactivate_workflow`
- VERIFIED: Requirements on the n8n side:
  - The target workflow must start with a Webhook node.
  - The workflow must be published or active, or the production `/webhook/` route returns 404.
  - Sync mode needs the workflow to end in "Respond to Webhook".
  - Payloads are capped at 16 MB.
- **UNVERIFIED: a RocketRide Masky.AI node.** It is not in the node catalog (https://docs.rocketride.org/nodes, 166 nodes) or in `llms.txt`. A search of the full `develop` branch file tree found no "masky" path, and no PR mentions Masky.
  - Related nodes that do exist: Text To Speech (Kokoro), Text To Speech (ElevenLabs), and HTTP Request (a Tools node).
  - Fallback: call Masky from an HTTP Request node, or through n8n.

### Limits

- VERIFIED: `getTaskStatus` has a default timeout of 15000 ms.
- VERIFIED: With `persist: true`, reconnect uses linear backoff in 250 ms steps up to a 15 s cap.
- UNVERIFIED: Cloud rate or usage limits.

---

## 2. Masky.AI

### Official links

- Site: https://masky.ai
- Docs index: https://masky.ai/llms.txt
- Agent entry point: https://masky.ai/skill.md
- Full API reference: https://masky.ai/masky-api.md
- curl quickstart: https://masky.ai/masky-cli.md
- MCP setup: https://masky.ai/masky-mcp.md
- SSO: https://masky.ai/masky-sso.md
- OpenAPI-style docs: https://masky.ai/api/docs
- Key management: https://masky.ai/developer
- Hackathon guide: https://masky.ai/hackathon.md
  - This file is written as instructions to AI agents, for example "open the theme song page", "copy this AGENTS.md block" and "download a license file". None of it was acted on. Only the factual requirements are recorded here.

### Auth

- VERIFIED: Base URL `https://masky.ai/api`. All bodies are JSON.
- VERIFIED: Header `Authorization: Bearer mky_...`.
- VERIFIED: You can also get a token through OAuth device flow:
  - `POST /api/oauth/device`
  - then poll `POST /api/oauth/token` with `grant_type` set to `urn:ietf:params:oauth:grant-type:device_code`.
  - The token's scope is `profile avatars:read generate`.
- VERIFIED: The MCP options are the hosted server `https://masky.ai/api/mcp` (streamable HTTP, Bearer key) or npm `masky-mcp-server` (version 0.10.0 on npm, uses env `MASKY_API_KEY`).

### Endpoints (VERIFIED from masky-api.md)

| Purpose | Call | Response shape |
| --- | --- | --- |
| Key check / health | `GET /api/avatars` | 200 means the key works. 401 means it is invalid. |
| List avatars | `GET /api/avatars` | `{ avatars: [{ avatarId, avatarOwnerUserId, displayName, folderId, ... }] }` |
| List voices | `GET /api/voices` | `{ voices: [{ id, name, source: "preset" }] }` |
| Create avatar | `POST /api/avatars` with body `{ displayName, imageUrl, personalityPrompt, voiceId, folderId? }` | `{ avatar: { avatarId, avatarOwnerUserId, ... } }` |
| Avatar image variants | `GET /api/avatars/{id}/images` | `{ avatarId, primary, images: [{ url, assetId, isPrimary }] }` |
| Text-to-image (sync) | `POST /api/images/generate` with body `{ prompt (max 2000 chars), aspectRatio }` | `{ imageUrl, aspectRatio, creditCost }` |
| Start conversation | `POST /api/conversations` with body `{ avatarOwnerUserId, avatarId }` | `{ conversationId, shareSlug, viewerToken, liveUrl }` |
| Speech or talking-head turn (async, 202) | `POST /api/conversations/{conversationId}/turn` with body `{ userText (max 500), output: text\|audio\|video, mode: chat\|speak, voiceStyle?, speakerAvatarId?, userOutput?, avatarText? }` | `{ turn: { id, status: "pending", audioUrl: null, videoUrl: null, ... }, async: true }` |
| Poll turns | `GET /api/conversations/by-slug/{shareSlug}` | `{ conversationId, conversation, turns: [{ id, role, status, audioUrl, videoUrl, errorMessage }] }` |
| One-shot speak | `POST /api/avatars/{avatarId}/speak` | Accepts `avatarImageUrl` and `voiceStyle`. **The full request and response shape is UNVERIFIED.** The docs advise using conversation + `speak` turn instead. |
| Scene video (async, 202) | `POST /api/videos/generate` with body `{ prompt, image?, avatarId?, speechText?, duration?, quality? }` | `{ generationId, slug, url, status: "queued", seconds, creditCost, poll }`. Poll `GET /api/videos/{generationId}` until `status` is `ready` or `error`. |
| Pricing (no auth) | `GET /api/videos/pricing` | Live pricing rates. This is a cheap unauthenticated reachability check. |

Behaviour notes:

- VERIFIED: For "make the avatar say X", the documented pattern is:
  1. Create a conversation.
  2. Post a `mode: "speak"` turn with `output: "video"`.
  3. Embed the `liveUrl`.
- VERIFIED: The `liveUrl` carries a private `?token=`. Treat it as a secret.
- VERIFIED: Avatar speech is auto-chunked into turns of at most 3 sentences. The returned `turn.id` covers only the first chunk.
- VERIFIED: Turn media URLs are re-signed on each read and expire after 1 hour.
- VERIFIED: Expected timing:
  - Text turns: about 3 s.
  - Audio turns: about 5–10 s.
  - Video turns: about 30–60 s. Poll about every 2 s.
- VERIFIED: Errors:
  - `400`: invalid input, for example `userText exceeds 500 chars`.
  - `401`: bad key.
  - `402`: not enough credits. The body includes `{ requiredCredits, availableCredits }`.
  - `404`: the avatar is not yours.
  - `502`: upstream failure.
- VERIFIED: Voice delivery uses `voiceStyle: { emotion, style, prosody[] }` or inline tags such as `<|prosody:pause|>`.
- VERIFIED: There is no separate standalone text-to-speech endpoint. Speech is produced through turns with `output: "audio"`.

### Limits

- VERIFIED: `userText` max 500 chars.
- VERIFIED: Image prompt max 2000 chars.
- VERIFIED: Added avatar images must be 12 MB or less.
- VERIFIED: The free tier allows 1 avatar (from hackathon.md).
- VERIFIED: New accounts get about $10 in credits (from hackathon.md).
- UNVERIFIED: a general API rate limit.

### Hackathon facts (from hackathon.md)

- VERIFIED: Event: AI Workforce 2026, held 2026-10-19.
- VERIFIED: Submission deadline: 5:30 PM on 2026-10-19.
- VERIFIED: Required:
  - A public GitHub repo.
  - Use of Masky avatars.
  - A deck URL posted in https://twitch.tv/aijudge chat.
  - Submission on the hackathon page.
- VERIFIED: Coupon `AIWORKFORCE2026` gives 1 month of the Creator tier.

### Native nodes

- No Masky node was found in RocketRide or n8n. UNVERIFIED that one exists.

---

## 3. n8n

### Official links

- Webhook node: https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.webhook/
- API authentication: https://docs.n8n.io/api/authentication/
- Monitoring: https://docs.n8n.io/hosting/logging-monitoring/monitoring/
- Google Sheets sheet operations: https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.googlesheets/sheet-operations/
- Export and import: https://docs.n8n.io/workflows/export-import/
- Source: https://github.com/n8n-io/n8n

### Webhook node

- VERIFIED: Type id `n8n-nodes-base.webhook`.
  - Versions: `[1, 1.1, 2, 2.1, 2.2]`. The default is 2.2.
  - Source: `packages/nodes-base/nodes/Webhook/Webhook.node.ts`.
- VERIFIED: URL path segments, with defaults from `packages/@n8n/config/src/configs/endpoints.config.ts`:
  - Production: `<base>/webhook/<path>`, from `N8N_ENDPOINT_WEBHOOK`, default `webhook`.
  - Test: `<base>/webhook-test/<path>`, from `N8N_ENDPOINT_WEBHOOK_TEST`, default `webhook-test`.
  - Waiting: `webhook-waiting`.
- VERIFIED: The production URL only works once the workflow is published or active.
- VERIFIED: The test URL only works while "Listen for Test Event" is running.
- VERIFIED: Parameters:
  - `httpMethod`: one of DELETE, GET, HEAD, PATCH, POST, PUT. The default is `GET`.
  - `path`
  - `authentication`: one of `none`, `basicAuth`, `headerAuth`, `jwtAuth`.
  - `responseMode`: one of `onReceived`, `lastNode`, `responseNode`, `streaming`.
- VERIFIED: Max payload is 16 MB, set by `N8N_PAYLOAD_SIZE_MAX`.
- VERIFIED: Header Auth credential:
  - Credential type `httpHeaderAuth`, with fields `name` (the header name) and `value`.
  - Select it with `authentication: "headerAuth"`.
  - n8n rejects requests that do not carry that header and value.

### Respond to Webhook node

- VERIFIED: Type id `n8n-nodes-base.respondToWebhook`.
  - Versions 1 to 1.5. The default is 1.5.
- VERIFIED: `respondWith` takes one of:
  - `allIncomingItems`
  - `binary`
  - `firstIncomingItem`
  - `json`
  - `jwt`
  - `noData`
  - `redirect`
  - `text`
- VERIFIED: Other parameters:
  - `responseBody`, used with `json` or `text`.
  - `options.responseCode`.
- VERIFIED: It needs the Webhook node's `responseMode` set to `responseNode`.

### Google Sheets node

- VERIFIED: Type id `n8n-nodes-base.googleSheets`.
  - `defaultVersion` is 4.7. Versions 4.1–4.7 use the V2 implementation.
- VERIFIED: The "Append or Update Row" operation has value `appendOrUpdate`, with `resource: "sheet"`.
  - Other operation values: `append`, `clear`, `create`, `remove`, `delete`, `read`, `update`.
- VERIFIED: Parameters for `appendOrUpdate`:
  - `documentId`: a resource locator, `{ mode: 'list'|'url'|'id', value }`.
  - `sheetName`: a resource locator, `{ mode: 'list'|'url'|'id'|'name', value }`.
  - `columnToMatchOn` and `valueToMatchOn`, in older versions.
  - `columns` (resource mapper), in newer versions.
  - Source: `packages/nodes-base/nodes/Google/Sheet/v2/actions/sheet/`.
- UNVERIFIED: the exact v4.7 `columns` resource-mapper JSON shape, for example `{ mappingMode: "defineBelow", value: {...}, matchingColumns: [...] }`. Build the node once in the editor and export it to get the exact shape.

### Public REST API

- VERIFIED: Header `X-N8N-API-KEY: <key>`.
- VERIFIED: Base path `<instance>/api/v1`.
  - Example: `GET /api/v1/workflows?active=true`.
- VERIFIED: Execution routes, from `openapi.decorator-routes.generated.yml`:
  - `GET /executions/{executionId}`
  - `POST /executions/{executionId}/stop`
  - The HTTP method for `stop` is inferred. The route exists, but the method is UNVERIFIED.
- VERIFIED: Workflow routes:
  - `/workflows/{id}/activate`
  - `/workflows/{id}/deactivate`
  - `/workflows/{id}/publish`
- VERIFIED: The API is not available during the free trial. Key scopes are Enterprise-only.

### Health

- VERIFIED: `GET /healthz` returns 200 when the instance is reachable. It does not check the database.
  - The path can be changed with `N8N_ENDPOINT_HEALTH`. The default is `/healthz`.
- VERIFIED: `GET /healthz/readiness` returns 200 when the database is connected and migrated.
- VERIFIED: `/metrics` needs `N8N_METRICS=true` and is self-hosted only.

### Workflow JSON

- VERIFIED: The docs warn that exports include credential names and IDs. Scrub them before committing.
- The official docs page does not specify the JSON schema.
- The skeleton below matches the official RocketRide example at https://github.com/rocketride-org/rocketride-server/blob/develop/examples/n8n-call-rocketride.workflow.json, with node type ids and parameter values checked against n8n source.

Minimal skeleton: Webhook (Header Auth) → Google Sheets append-or-update → Respond to Webhook.

```json
{
  "name": "MissionControl intake",
  "nodes": [
    {
      "parameters": {
        "httpMethod": "POST",
        "path": "missioncontrol-intake",
        "authentication": "headerAuth",
        "responseMode": "responseNode",
        "options": {}
      },
      "id": "00000000-0000-4000-8000-000000000001",
      "name": "Webhook",
      "type": "n8n-nodes-base.webhook",
      "typeVersion": 2,
      "position": [0, 0],
      "webhookId": "00000000-0000-4000-8000-000000000001",
      "credentials": { "httpHeaderAuth": { "id": "REPLACE", "name": "MissionControl header" } }
    },
    {
      "parameters": {
        "resource": "sheet",
        "operation": "appendOrUpdate",
        "documentId": { "__rl": true, "mode": "id", "value": "REPLACE_SHEET_ID" },
        "sheetName": { "__rl": true, "mode": "name", "value": "Sheet1" },
        "options": {}
      },
      "id": "00000000-0000-4000-8000-000000000002",
      "name": "Google Sheets",
      "type": "n8n-nodes-base.googleSheets",
      "typeVersion": 4.7,
      "position": [220, 0]
    },
    {
      "parameters": { "respondWith": "json", "responseBody": "={{ { ok: true } }}", "options": {} },
      "id": "00000000-0000-4000-8000-000000000003",
      "name": "Respond to Webhook",
      "type": "n8n-nodes-base.respondToWebhook",
      "typeVersion": 1.1,
      "position": [440, 0]
    }
  ],
  "connections": {
    "Webhook": { "main": [[{ "node": "Google Sheets", "type": "main", "index": 0 }]] },
    "Google Sheets": { "main": [[{ "node": "Respond to Webhook", "type": "main", "index": 0 }]] }
  },
  "settings": { "executionOrder": "v1" },
  "pinData": {}
}
```

Notes on the skeleton:

- UNVERIFIED: the `__rl: true` resource-locator marker and the column-mapping fields for Sheets. Configure the Sheets mapping in the editor, then re-export.
- `connections` is keyed by node **name**, not id.

---

## 4. Snyk

### Official links

- `snyk test`: https://docs.snyk.io/developer-tools/snyk-cli/commands/test
- `snyk code test`: https://docs.snyk.io/developer-tools/snyk-cli/commands/code-test
- `snyk container test`: https://docs.snyk.io/developer-tools/snyk-cli/commands/container-test
- `snyk iac test`: https://docs.snyk.io/developer-tools/snyk-cli/commands/iac-test
- `.snyk` file: https://docs.snyk.io/manage-risk/policies/the-.snyk-file
- GitHub Actions:
  - https://github.com/snyk/actions
  - https://github.com/snyk/actions/blob/master/node/README.md

### CLI (all VERIFIED)

| Command | Syntax | `--severity-threshold` values |
| --- | --- | --- |
| Open-source dependency scan | `snyk test [<OPTIONS>]` | `low\|medium\|high\|critical` |
| Code (SAST) scan | `snyk code test [<OPTIONS>] [<PATH>]` | `low\|medium\|high` (no `critical`) |
| Container image scan | `snyk container test [<OPTIONS>] [<IMAGE>]`, for example `snyk container test app:latest --file=Dockerfile` | `low\|medium\|high\|critical` |
| Infrastructure-as-code scan | `snyk iac test [<OPTIONS>] [<PATH>]` | `low\|medium\|high\|critical` |

Options and exit codes:

- `--sarif-file-output=<path>` and `--json-file-output=<path>` work on all of these commands.
  - Use a different path per scan, or each scan overwrites the previous file.
- `--all-projects` auto-detects every project in the directory.
- Exit codes:
  - `0`: no issues found.
  - `1`: vulnerabilities found.
  - `2`: failure. Re-run with `-d` for debug logs.
  - `3`: no supported projects detected.
- UNVERIFIED: whether Snyk Code must be enabled in the org settings first. The command page does not say.

### GitHub Action (VERIFIED from node/README.md and action.yml)

- Inputs:
  - `command`, default `test`.
  - `args`.
  - `json`, default `false`.
- It runs the Docker image `snyk/snyk:node`.

```yaml
jobs:
  security:
    runs-on: ubuntu-latest
    permissions:
      security-events: write
      actions: read
      contents: read
    steps:
      - uses: actions/checkout@master
      - name: Run Snyk to check for vulnerabilities
        uses: snyk/actions/node@master
        continue-on-error: true # so SARIF upload still runs
        env:
          SNYK_TOKEN: ${{ secrets.SNYK_TOKEN }}
        with:
          args: --severity-threshold=high --sarif-file-output=snyk.sarif
      - name: Upload result to GitHub Code Scanning
        uses: github/codeql-action/upload-sarif@v3
        with:
          sarif_file: snyk.sarif
```

Note: the README combines `--severity-threshold=high` and `--sarif-file-output` in separate examples. Combining them in one `args` string, as above, is standard CLI usage.

### `.snyk` policy (VERIFIED)

```yaml
version: v1.25.0
ignore:
  SNYK-JS-BSON-561052:
    - mongodb > mongodb-core > bson:
        reason: None given
        expires: '2020-06-19T20:36:54.553Z'
```

- `expires` is optional. Without it, the ignore is permanent.
- `ignore:` does **not** apply to Snyk Code (SAST) findings.
  - To leave paths out of a Code scan, use `exclude:` with the `code` group.
  - To ignore an individual Code finding, use the Snyk web UI.

---

## 5. Tenki

- VERIFIED: There is a public SDK and API.
  - Docs:
    - https://tenki.cloud/docs/sandbox/quickstart
    - https://tenki.cloud/docs/sandbox/sdk.md
    - https://tenki.cloud/llms.txt
  - Product: disposable Linux microVM sandboxes.
- VERIFIED: Packages:
  - npm `@tenkicloud/sandbox`, version 1.4.1 on npm.
  - PyPI `tenki`.
  - Go `github.com/LuxorLabs/tenki-sdk-go/sandbox`.
  - CLI `tenki`.
- VERIFIED: Auth:
  - Workspace API key `tk_...`, sent as `Authorization: Bearer <key>`.
  - Environment variable `TENKI_API_KEY`.
  - Base URL `https://api.tenki.cloud`, which can be overridden with `TENKI_API_ENDPOINT`.
  - The transport appears to be Connect RPC over HTTP. This is inferred from the `WithConnectClientOptions` option and is UNVERIFIED.
- VERIFIED: TypeScript example:

  ```ts
  import { stdoutText, TenkiSandbox } from "@tenkicloud/sandbox";
  const sandbox = new TenkiSandbox();
  await using session = await sandbox.createAndWait({ name: "demo" });
  const r = await session.exec("bash", { args: ["-lc", "uname -a"] });
  // r.exitCode, stdoutText(r)
  ```

- VERIFIED: A hosted MCP server exists: https://tenki.cloud/docs/sandbox/mcp.md
- UNVERIFIED: a documented raw REST or JSON endpoint list. Use the SDK. Also unverified: Tenki's role as a hackathon sponsor.

---

## 6. Claude Code subagents

Source: https://code.claude.com/docs/en/sub-agents

### File locations

- VERIFIED: Subagent files live in these places, highest priority first:
  1. Managed settings
  2. The `--agents` CLI flag
  3. `.claude/agents/` (the project)
  4. `~/.claude/agents/` (the user)
  5. A plugin's `agents/` directory
- VERIFIED: Directories are scanned recursively. A subagent's identity comes only from its `name` field.

### Frontmatter fields

- VERIFIED: Required fields:
  - `name`: at most 256 characters, and no `:`.
  - `description`
- VERIFIED: Optional fields:
  - `tools`: a comma-separated string or a YAML list. If omitted, the subagent inherits all tools.
  - `disallowedTools`
  - `model`: `sonnet`, `opus`, `haiku`, `fable`, a full model id, or `inherit`.
  - `permissionMode`: `default`, `acceptEdits`, `auto`, `dontAsk`, `bypassPermissions`, `plan`, or `manual`.
  - `maxTurns`
  - `autoCompactWindow`
  - `skills`
  - `mcpServers`
  - `hooks`
  - `memory`: `user`, `project`, or `local`.
  - `background`
  - `omitClaudeMd`
  - `effort`
  - `isolation`: `worktree`.
  - `color`
  - `initialPrompt`
  - `experimental`
- VERIFIED: Multi-word field names use camelCase. Unknown fields are ignored without an error.
- VERIFIED: Model resolution order:
  1. The per-call `model` parameter.
  2. The frontmatter `model`.
  3. `CLAUDE_CODE_SUBAGENT_MODEL`.
  4. The main conversation's model.

### Invoking subagents

- VERIFIED: Mention a subagent with `@agent-<name>`. Plugin subagents use `@agent-<plugin>:<name>`. The picker form is `@"code-reviewer (agent)"`.
- VERIFIED: `claude --agent <name>` runs the whole session as that subagent.
- VERIFIED: `claude --agents '<json>'` defines subagents for one session.
  - Each entry takes `description`, `prompt`, `tools` and `model`.
  - In non-interactive mode it also accepts a file path.

Example file, `.claude/agents/code-reviewer.md`:

```markdown
---
name: code-reviewer
description: Reviews code for quality and best practices
tools: Read, Glob, Grep
model: sonnet
---
You are a code reviewer. ...
```
