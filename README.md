# mcp-twitter

A local [MCP](https://modelcontextprotocol.io) server that fetches tweets from a specific X (Twitter) user via [twitterapi.io](https://twitterapi.io).

Exposes a single tool, `fetch_tweets`, that wraps twitterapi.io's advanced search endpoint.

## Requirements

- Node.js 20+
- A twitterapi.io API key ([get one here](https://twitterapi.io/dashboard))

## Install

```bash
pnpm install
pnpm build
```

## Configure

Add to your Claude Desktop config:

- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "twitter": {
      "command": "<ABSOLUTE_PATH_TO_NODE>",
      "args": ["<ABSOLUTE_PATH_TO_REPO>/dist/index.js"],
      "env": {
        "TWITTERAPI_IO_API_KEY": "your-key-here"
      }
    }
  }
}
```

Replace `<ABSOLUTE_PATH_TO_REPO>` with the path where you cloned this repo and `<ABSOLUTE_PATH_TO_NODE>` with the real absolute path to your `node` binary.

### Finding the absolute path to `node`

| Your setup | Command | Notes |
|---|---|---|
| macOS / Linux (Homebrew or nvm) | `which node` | Returns the real binary, e.g. `/opt/homebrew/bin/node` or `~/.nvm/versions/node/v22.11.0/bin/node` |
| Windows | `where node` | Pick the `.exe` path |

If the output starts with `~`, expand it to the full path (e.g. `/Users/yourname/...` on macOS, `/home/yourname/...` on Linux). Claude Desktop does not expand `~`.

Restart Claude Desktop.

## Tool: `fetch_tweets`

| Parameter | Type | Default | Description |
|---|---|---|---|
| `username` | string (required) | — | X handle without `@` |
| `since` | string | — | ISO 8601 or relative: `30s`, `45m`, `6h`, `2d`, `1w` |
| `until` | string | now | ISO 8601 or relative |
| `max_results` | int 1–100 | 20 | cap on total tweets across pages |
| `query` | string | — | extra terms AND-combined with `from:{username}` |
| `include_retweets` | bool | `true` | when false → `-filter:retweets` |
| `include_quotes` | bool | `true` | when false → `-filter:quote` |
| `include_replies` | bool | `true` | when false → `-filter:replies` |
| `query_type` | `Latest` \| `Top` | `Latest` | sort order |
| `lang` | 2-letter code | — | e.g. `en`, `es` |
| `min_faves` | int ≥ 0 | — | minimum like count |

### Returns

```json
{
  "tweets": [
    {
      "id": "...",
      "url": "https://x.com/...",
      "text": "...",
      "createdAt": "...",
      "author": { "userName": "...", "name": "...", "id": "..." },
      "counts": { "like": 0, "retweet": 0, "reply": 0, "quote": 0, "view": 0, "bookmark": 0 },
      "quotedTweet": { "id": "...", "text": "...", "author": "...", "createdAt": "..." },
      "retweetedTweet": { "id": "...", "text": "...", "author": "...", "createdAt": "..." }
    }
  ],
  "count": 20,
  "truncated": false,
  "queryString": "from:elonmusk since_time:1713916800 -filter:retweets"
}
```

`truncated: true` means more pages exist beyond `max_results`.

## Local development

```bash
pnpm typecheck       # tsc --noEmit
pnpm test            # vitest run
pnpm build           # compiles to dist/
pnpm dev             # runs via tsx without a build step
TWITTERAPI_IO_API_KEY=... node dist/index.js   # manual stdio run
```
