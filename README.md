# mcp-twitterapi

A local [MCP](https://modelcontextprotocol.io) server that fetches tweets from a specific X (Twitter) user via [twitterapi.io](https://twitterapi.io).

Build with 

```
░█░█░█░█░█▀▀░█▀█░█▀▄░▀█▀░░░█▀█░█░░░█░█░█▀▀░▀█▀░█▀█░█▀▀
░█▀▄░█░█░▀▀█░█▀█░█▀▄░░█░░░░█▀▀░█░░░█░█░█░█░░█░░█░█░▀▀█
░▀░▀░▀▀▀░▀▀▀░▀░▀░▀░▀░▀▀▀░░░▀░░░▀▀▀░▀▀▀░▀▀▀░▀▀▀░▀░▀░▀▀▀
```
Build with [create-mcp@kusari-plugin](https://github.com/designoor/kusari-plugins) skill.

## Requirements

- Node.js 20+
- A twitterapi.io API key ([get one here](https://twitterapi.io/dashboard))

## Install

No clone required — the package is published on npm.

Add to your Claude Desktop config:

- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "twitter": {
      "command": "npx",
      "args": ["-y", "@0x50b/mcp-twitterapi"],
      "env": {
        "TWITTERAPI_IO_API_KEY": "your-key-here"
      }
    }
  }
}
```

For Claude Code, the same block goes into a project-level `.mcp.json` at the repo root, then set `"enableAllProjectMcpServers": true` in `.claude/settings.local.json`.

Restart Claude Desktop fully (⌘Q, not just close the window) to pick up the config.

## Tools

### `fetch_tweets`
Fetch tweets from a specific X (Twitter) user via twitterapi.io's advanced search. Combines `from:{username}` with optional time bounds, extra query terms, and content filters. Returns up to `limit` tweets in reverse-chronological order, trimmed to high-signal fields (text, counts, author, quoted/retweeted content).
- `username` (string, required) — X handle without `@`
- `since` (string, optional) — ISO 8601 or relative: `30s`, `45m`, `6h`, `2d`, `1w`
- `until` (string, optional) — ISO 8601 or relative; defaults to now
- `limit` (int 1–2000, default 200) — max tweets returned in this call
- `query` (string, optional) — extra terms AND-combined with `from:{username}`; supports quoted phrases and `OR`
- `include_retweets` (bool, default `true`) — when false, appends `-filter:retweets`
- `include_quotes` (bool, default `true`) — when false, appends `-filter:quote`
- `include_replies` (bool, default `true`) — when false, appends `-filter:replies`
- `query_type` (`Latest` | `Top`, default `Latest`) — sort order
- `lang` (ISO 639-1 2-letter code, optional) — e.g. `en`, `es`
- `min_faves` (int ≥ 0, optional) — minimum like count

Returns `{ tweets, count, window, fetched, hasMore, nextCall, hint, queryString }`:
- `hasMore: false` means the window is fully fetched — nothing was omitted.
- `hasMore: true` means more tweets exist earlier in the window. The response includes a `nextCall` object with exact `since`/`until` values for a follow-up call, and a `hint` describing what to do.

Responses are capped at ~450KB per call. The server declares `anthropic/maxResultSizeChars: 500000` in its tool metadata so Claude Code honors the 500K-character hard ceiling instead of the default 25K-token cap. The byte budget sits at 450KB to leave headroom for the response wrapper. If the window contains large or quote-heavy tweets that would exceed this, the tool returns fewer than `limit` tweets with `hasMore: true` and adds `fetchedTotal` / `droppedForSize` to the response. The `hint` spells out the exact timespan covered and how many tweets were dropped, so you can either continue with `nextCall` or lower `limit` on the next attempt.

#### Continuation pattern

When a window contains more than `limit` tweets, iterate:

```
fetch_tweets({ username: "elonmusk", since: "30d", limit: 200 })
  → hasMore: true, nextCall: { since: "...", until: "2026-04-15T10:23:00Z" }

fetch_tweets({ username: "elonmusk", since: "...", until: "2026-04-15T10:23:00Z", limit: 200 })
  → hasMore: true, nextCall: { ... }

... until hasMore: false.
```

Each call paginates internally by **walking the `until` bound backward** — per twitterapi.io's own guidance (their cursor is documented as unreliable). After each API page, the tool narrows `until` to one second before the oldest tweet it just received, queries again, and stops when the API reports no more tweets, when a page yields zero new IDs, or when the caller's `limit` / byte budget is reached. Duplicates are filtered by tweet ID as a safety net for boundary tweets. A pagination safety ceiling of 110 API calls per invocation prevents runaway cost on pathological windows; if it fires, `hasMore` stays `true` and the returned `nextCall` lets you resume from the oldest fetched tweet.

## Local development (contributors only)

```bash
git clone https://github.com/designoor/mcp-twitterapi.git
cd mcp-twitterapi
pnpm install

pnpm typecheck       # tsc --noEmit
pnpm test            # vitest run
pnpm build           # compiles to dist/
pnpm dev             # runs via tsx without a build step
TWITTERAPI_IO_API_KEY=... node dist/index.js   # manual stdio run
```

To test changes against Claude Desktop locally, point the config at your built `dist/index.js` via its absolute path instead of `npx`.
