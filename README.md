# proxy-moxy

A session-scoped HTTP proxy with a live request inspector.

1. Open `site.com/<session-uid>` — the session is created on first visit and kept in memory.
2. Point your client at `proxy.site.com/<session-uid>?url=<target-url>`.
3. Every request that goes through the proxy shows up on the page in real time.

By default the proxy is transparent: it forwards requests and responses untouched
and only records them. Pause a session and it turns into a debugger: every
request stops before the upstream call and again before delivery, you can edit
the body at either stop. `Step into` moves it to the next stop, `Continue` lets it
run to the end.

## Layout

```
apps/backend      Hono on Node. API + proxy listeners, in-memory store.
                  tests/unit mirrors src; tests/e2e drives a real backend over HTTP.
apps/frontend     Vite + React inspector UI.
packages/shared   Types (Session, RequestRecord, SessionEvent) and uid helpers used by both.
```

Node ≥ 22.18 runs the TypeScript sources directly, so the backend and the shared
package have no build step. pnpm workspaces link the packages. The backend uses
Hono (`hono`, `@hono/node-server`) for routing, the proxy helper, SSE and static files.

## Quick start

```sh
pnpm install
pnpm dev            # backend on :4000 (API) and :4001 (proxy), Vite UI on :5173
```

Open <http://localhost:5173/> — you are redirected to a fresh session. Then:

```sh
curl "http://127.0.0.1:4001/<session-uid>?url=https%3A%2F%2Fhttpbin.org%2Fget"
```

The UI has a small builder that encodes the target URL for you.

### Production-style run

```sh
pnpm build          # builds apps/frontend/dist
pnpm start          # API serves the built UI on :4000, proxy on :4001
```

Put `site.com` in front of the API port and `proxy.site.com` in front of the
proxy port, and set `PUBLIC_PROXY_URL=https://proxy.site.com` so the UI shows
the public address.

## Backend

### Proxy listener (`PROXY_PORT`, default 4001)

`ANY /<session-uid>?url=<target-url>`

- `url` must be an absolute http(s) URL, percent-encoded.
- Any other query parameters are appended to the target URL.
- Forwarded with `hono/proxy` on top of `fetch`: hop-by-hop headers are dropped, everything else goes through as-is.
- Bodies are streamed through; the first `BODY_CAPTURE_LIMIT` bytes of each are kept for the history.
- `fetch` transparently decompresses upstream bodies, so clients receive plain bytes without `content-encoding`.
- Unknown session uids are created on the fly.

### Breakpoints

While a session is paused each request walks through two stops:

1. `request` — arrived at the proxy, not forwarded yet. Edit the request body, then step.
2. `response` — the upstream answered, nothing delivered yet. Edit the response body, then step.

At each stop the controls follow the VS Code debugger: **Step into** moves the
request to its next stop, **Continue** runs it to the end without stopping again.
Continue applies to that one request; others keep stopping while the session is paused.

Parked bodies are buffered whole so they can be replaced; edited bodies are sent
uncompressed with a recomputed `content-length`. A request that is already in
flight when you pause stops at the `response` stop. `Resume` releases every
parked request and unpauses. A client that disconnects while parked is recorded
as an error and its stop is released.

### API listener (`API_PORT`, default 4000)

| Method   | Path                              | Purpose                                             |
| -------- | --------------------------------- | --------------------------------------------------- |
| `GET`    | `/api/sessions/:uid`              | get-or-create the session; returns its proxy URL    |
| `GET`    | `/api/sessions/:uid/requests`     | recorded requests, oldest first                     |
| `DELETE` | `/api/sessions/:uid/requests`     | clear the history                                   |
| `POST`   | `/api/sessions/:uid/pause`        | stop requests at breakpoints                        |
| `POST`   | `/api/sessions/:uid/resume`       | release every parked request and unpause            |
| `POST`   | `/api/sessions/:uid/requests/:id/step` | step into: move a parked request to its next stop (409 if not parked) |
| `POST`   | `/api/sessions/:uid/requests/:id/continue` | continue: run a parked request to the end, skipping its remaining stops (409 if not parked) |
| `PATCH`  | `/api/sessions/:uid/requests/:id` | `{ request: { body } }` or `{ response: { body } }`, matching the stage it is parked at |
| `GET`    | `/api/sessions/:uid/events`       | Server-Sent Events: `request` (upsert by id), `session`, `cleared` |
| `GET`    | `/api/health`                     | liveness                                            |

When `apps/frontend/dist` exists the API listener also serves it with an SPA
fallback, so `/:uid` works on the same origin.

### Environment

| Variable              | Default                     | Notes                                      |
| --------------------- | --------------------------- | ------------------------------------------ |
| `HOST`                | `127.0.0.1`                 | bind address for both listeners            |
| `API_PORT`            | `4000`                      |                                            |
| `PROXY_PORT`          | `4001`                      |                                            |
| `PUBLIC_PROXY_URL`    | `http://<host>:<proxy-port>`| shown in the UI                            |
| `STATIC_DIR`          | `apps/frontend/dist`        | empty string disables static serving       |
| `BODY_CAPTURE_LIMIT`  | `262144`                    | bytes kept per body                        |
| `HISTORY_LIMIT`       | `500`                       | records kept per session                   |
| `UPSTREAM_TIMEOUT_MS` | `30000`                     |                                            |
| `LOG_LEVEL`           | `info`                      | `debug`, `info`, `warn`, `error`, `silent` |

Self-signed upstreams: start the backend with `NODE_TLS_REJECT_UNAUTHORIZED=0`.

## Scripts

| Script           | What it does                                        |
| ---------------- | --------------------------------------------------- |
| `pnpm dev`       | backend with `--watch` + Vite dev server, in parallel |
| `pnpm build`     | frontend production build                           |
| `pnpm start`     | backend from sources, serving the built frontend    |
| `pnpm typecheck` | `tsc --noEmit` in every package                     |
| `pnpm test`      | backend `tests/unit` + `tests/e2e` on the native `node --test` runner |
| `pnpm check`     | typecheck + test                                    |
