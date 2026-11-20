# Logging and Telemetry Schema Contract

> **Executable Authorities:** `src-worker/src/utils/worker_logger.ts` and `src-crawler/src/utils/logging/logger.ts`  
> **Owning Sector:** Sector 1 (`crawler-network`)

Coordinator edge logs and Crawler Node file logs intentionally use different emission formats matched to their runtime environments. Never assume the node writes pure NDJSON to `latest.log`.

## 1. Coordinator Worker Structured JSON Logging (`src-worker/`)

`worker_logger.ts` emits JSON objects to the Cloudflare Workers log stream with these fields:

| Field | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `timestamp` | ISO-8601 `string` | Yes | UTC event timestamp. |
| `level` | `string` | Yes | Severity level (`info`, `warn`, `error`, `debug`). |
| `component` | `"worker"` | Yes | Fixed Worker component tag. |
| `version` | `string` | Yes | Running Worker build version. |
| `message` | `string` | Yes | Human-readable event summary. |
| `meta` | `object` | No | Optional structured context (route, request status, counts). |
| `error` | `string` | No | Error summary (never expose secrets or rejected catalog rows in public HTTP responses). |
| `stack` | `string` | No | Diagnostic stack trace (internal Worker logs only; never returned in HTTP bodies). |

Public catalog and delta error logs record the failing route without leaking underlying exceptions or rejected rows to callers.

## 2. Crawler Node Structured Text Logging (`src-crawler/`)

`src-crawler/src/utils/logging/logger.ts` writes UTF-8 text lines to disk and ANSI-formatted output to the console:

```text
[ISO_TIMESTAMP] [TAG] message {optional_json_meta}
```

### Supported Log Tags (7 Tags)
- `[DEBUG]`: Verbose diagnostic traces (enabled when `DEBUG` is set or `LOG_LEVEL=debug`).
- `[INFO]`: General lifecycle notices.
- `[ACTIVITY]`: Operational daemon broadcasts (startup, shutdown, job claim, outbox settlement, lease expiry).
- `[FINDING]`: Package discovery broadcasts (observed metadata, discovered leads, batch submissions, delistings).
- `[WARN]`: Recoverable anomalies and backoff notices.
- `[ERROR]`: Terminal or transport failures (never logs raw `NODE_TOKEN` or HTTP error JSON bodies from coordinator failures).
- `[RATE_LIMIT]`: Origin or coordinator `429` throttling events.

### Log Directory Precedence and Lifecycle
1. **Lazy resource initialization**: Constructing a logger computes paths without creating directories, file handles, timers, or exit hooks until the first log write. `--version` produces zero log state.
2. **Directory resolution order**:
   1. Explicit `LoggerOptions.logsDir`
   2. `CRAWLER_LOGS_DIR` environment variable (Docker sets `/app/data/logs`)
   3. Runtime default:
      - **Source run**: `src-crawler/logs` (resolved relative to module directory, independent of CWD)
      - **Compiled binary (`Bun.isStandaloneExecutable`)**:
        - Windows: `%LOCALAPPDATA%\vrcp-crawler\logs` (fallback `~/AppData/Local/vrcp-crawler/logs`)
        - macOS: `~/Library/Logs/vrcp-crawler/logs`
        - Linux: `$XDG_STATE_HOME/vrcp-crawler/logs` (fallback `~/.local/state/vrcp-crawler/logs`)
3. **File rotation and optional session files**:
   - `latest.log` (`enableLatestLog = true` default): rotates at midnight or clean shutdown into `archive/<date>[-index].log.gz` (gzip level 9).
   - Optional session logs (`enableSessionLogs = false` default): `session_<sessionId>_<date>.log`, `session_<sessionId>_<date>_ratelimits.log`, `session_<sessionId>_<date>_errors.log`. Session-only mode does not clear or rotate an existing `latest.log`.
