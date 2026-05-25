# Skills

Optional [Claude Code skills](https://docs.claude.com/en/docs/claude-code/skills) that pair with the `mcp-twitterapi` server. They are **not** distributed as a Claude Code plugin yet — copy whichever skill you want into your own skills directory.

## Available skills

- **[fetch-tweets](fetch-tweets/SKILL.md)** — wraps `mcp__twitter__fetch_tweets`, drains a `[since, until]` window across `hasMore` pagination, normalizes the result, and includes guidance for treating tweet content as untrusted input (prompt-injection defense).
- **[fetch-tweet-by-id](fetch-tweet-by-id/SKILL.md)** — wraps `mcp__twitter__fetch_tweet_by_id`, fetches one or more tweets by their numeric IDs (or URLs). No search, no pagination — just ID → trimmed tweet. Same untrusted-input guardrails as fetch-tweets.

## Install

Copy a skill directory into one of:

- `~/.claude/skills/<name>/` — available across all your projects
- `<project>/.claude/skills/<name>/` — scoped to one project

For example, to install `fetch-tweets` user-wide:

```sh
mkdir -p ~/.claude/skills
cp -r skills/fetch-tweets ~/.claude/skills/
```

Then restart Claude Code so it picks up the new skill.

The MCP server (`@0x50b/mcp-twitterapi`) must be configured separately — see the [root README](../README.md).
