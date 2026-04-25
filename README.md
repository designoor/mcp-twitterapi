# mcp-twitterapi

A local [MCP](https://modelcontextprotocol.io) server that fetches tweets from a specific X (Twitter) user via [twitterapi.io](https://twitterapi.io).

Build with 

```
░█░█░█░█░█▀▀░█▀█░█▀▄░▀█▀░░░█▀█░█░░░█░█░█▀▀░▀█▀░█▀█░█▀▀
░█▀▄░█░█░▀▀█░█▀█░█▀▄░░█░░░░█▀▀░█░░░█░█░█░█░░█░░█░█░▀▀█
░▀░▀░▀▀▀░▀▀▀░▀░▀░▀░▀░▀▀▀░░░▀░░░▀▀▀░▀▀▀░▀▀▀░▀▀▀░▀░▀░▀▀▀
```
Build with [create-mcp@kusari-plugin](https://github.com/kusarixyz/kusari-plugins) skill.

## Requirements

- Node.js 22+
- A twitterapi.io API key ([get one here](https://twitterapi.io/dashboard))

## Install

The package is on [npm](https://www.npmjs.com/package/@0x50b/mcp-twitterapi) but you don't have to install it. Using npx is perfectly fine.

Add to your Claude Desktop config:

| Platform | Config path |
|---|---|
| macOS | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| Windows | `%APPDATA%\Claude\claude_desktop_config.json` |
| Claude Code | project-local `.mcp.json` (also set `enableAllProjectMcpServers: true` in `.claude/settings.local.json`) |

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

Restart Claude Desktop fully (⌘Q on macOS, not just close the window).

## Tools

### `fetch_tweets`

Fetch tweets from a specific X (Twitter) user via twitterapi.io's advanced search. Combines `from:{username}` with optional time bounds, extra query terms, and content filters. Returns up to `limit` tweets in reverse-chronological order, trimmed to high-signal fields (text, counts, author, quoted/retweeted content).

#### Parameters

| Param | Type | Default | Description |
|---|---|---|---|
| `username` | string | **required** | X handle without `@` |
| `since` | string | — | ISO 8601 or relative (`30s`, `45m`, `6h`, `2d`, `1w`) |
| `until` | string | now | ISO 8601 or relative |
| `limit` | int 1–2000 | `200` | max tweets returned in this call |
| `query` | string | — | extra terms AND-combined with `from:{username}`; supports quoted phrases and `OR` |
| `include_retweets` | bool | `true` | when false, appends `-filter:retweets` |
| `include_quotes` | bool | `true` | when false, appends `-filter:quote` |
| `include_replies` | bool | `true` | when false, appends `-filter:replies` |
| `query_type` | `Latest` \| `Top` | `Latest` | sort order |
| `lang` | ISO 639-1 | — | e.g. `en`, `es` |
| `min_faves` | int ≥ 0 | — | minimum like count |

#### Response

| Field | Type | Meaning |
|---|---|---|
| `tweets` | array | Trimmed tweet objects in reverse-chronological order |
| `count` | int | Number of tweets returned |
| `window` | `{ since, until }` | Resolved absolute bounds of the requested window |
| `fetched` | `{ newest, oldest }` \| `null` | Oldest/newest returned tweet timestamps; `null` when `count === 0` |
| `hasMore` | bool | `false` = window fully fetched. `true` = more exist earlier |
| `nextCall` | `{ since, until }` \| `null` | Exact params for the follow-up call when `hasMore: true` |
| `hint` | string | Human-readable guidance (what was returned, what to do next) |
| `queryString` | string | Echo of the query sent to twitterapi.io — for debugging |

#### Response size cap

Responses are capped at ~450KB per call. The server declares `anthropic/maxResultSizeChars: 500000` in its tool metadata so Claude Code honors the 500K-character hard ceiling instead of the default 25K-token cap. When the byte budget trims a call mid-fetch, two extra fields appear:

| Field | Type | Meaning |
|---|---|---|
| `fetchedTotal` | int | Tweets fetched before trimming |
| `droppedForSize` | int | `fetchedTotal − count` (tweets discarded to fit under the cap) |

The `hint` then spells out the covered timespan and drop count — so you can continue with `nextCall` or lower `limit`.

#### Continuation pattern

When a window contains more than `limit` tweets, iterate:

```
fetch_tweets({ username: "elonmusk", since: "30d", limit: 200 })
  → hasMore: true, nextCall: { since: "...", until: "2026-04-15T10:23:00Z" }

fetch_tweets({ username: "elonmusk", since: "...", until: "2026-04-15T10:23:00Z", limit: 200 })
  → hasMore: true, nextCall: { ... }

... until hasMore: false.
```

<details>
<summary>How pagination works internally</summary>

Each call paginates by **walking the `until` bound backward** — per twitterapi.io's own guidance (their cursor is documented as unreliable). After each API page, the tool narrows `until` to one second before the oldest tweet it just received, queries again, and stops when the API reports no more tweets, when a page yields zero new IDs, or when the caller's `limit` / byte budget is reached. Duplicates are filtered by tweet ID as a safety net for boundary tweets. A pagination safety ceiling of 110 API calls per invocation prevents runaway cost on pathological windows; if it fires, `hasMore` stays `true` and the returned `nextCall` lets you resume from the oldest fetched tweet.

</details>

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
