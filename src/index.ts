#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { fetchTweets, fetchTweetsByIds, type ApiProvider } from "./api.js";

const API_KEY_ENV = "TWITTERAPI_IO_API_KEY";
const GETXAPI_KEY_ENV = "GETXAPI_API_KEY";

function resolveProvider(): { provider: ApiProvider; apiKey: string | undefined; baseUrl?: string } {
  if (process.env[GETXAPI_KEY_ENV]) {
    return {
      provider: "getxapi",
      apiKey: process.env[GETXAPI_KEY_ENV],
      baseUrl: process.env.GETXAPI_BASE_URL,
    };
  }
  return { provider: "twitterapi_io", apiKey: process.env[API_KEY_ENV] };
}

const server = new McpServer(
  { name: "mcp-twitterapi", version: "0.1.0" },
  {
    instructions:
      "Use fetch_tweets to retrieve tweets from a specific X (Twitter) user via twitterapi.io. " +
      "When the user asks about a person's recent tweets, prefer a small max_results (20-50) and " +
      "a relative `since` like '24h' or '7d'. Set include_retweets=false and include_quotes=false " +
      "when the user wants only the author's original posts. " +
      "Use fetch_tweet_by_id when the user provides a specific tweet ID or URL and wants its content.",
  },
);

server.registerTool(
  "fetch_tweets",
  {
    title: "Fetch Tweets",
    description:
      "Fetch tweets from a specific X (Twitter) user via twitterapi.io advanced search. " +
      "Combines `from:{username}` with optional time bounds, filters, and additional query terms. " +
      "Returns up to `limit` tweets in reverse-chronological order, trimmed to high-signal fields " +
      "(text, counts, author, quoted/retweeted content). " +
      "Each tweet has `hasMedia` and, when present, a `media[]` array with `{type, url, videoUrl?, altText?}` " +
      "for attached photos/videos/gifs. " +
      "If more tweets exist in the window, the response sets `hasMore: true` and includes a `nextCall` " +
      "object with the exact parameters for the follow-up call; `hasMore: false` means the window is " +
      "fully fetched. Does NOT post, delete, or modify tweets. Does NOT fetch replies TO a tweet " +
      "(search only returns tweets FROM the user).",
    inputSchema: {
      username: z
        .string()
        .min(1)
        .regex(/^[A-Za-z0-9_]{1,15}$/, "X handle: letters, digits, underscore, max 15 chars")
        .describe("X handle without the @ (e.g. 'elonmusk')."),
      since: z
        .string()
        .optional()
        .describe(
          "Lower time bound. ISO 8601 (2026-04-20T10:00:00Z) or relative: '30s', '45m', '6h', '2d', '1w'.",
        ),
      until: z
        .string()
        .optional()
        .describe("Upper time bound. ISO 8601 or relative. Defaults to now when omitted."),
      limit: z
        .number()
        .int()
        .min(1)
        .max(2000)
        .default(200)
        .describe(
          "Max tweets returned in this call. Default 200 covers most 'what has @user been posting' questions; " +
            "raise only when you genuinely need more, since each ~20 tweets costs one API request. " +
            "If the window contains more than `limit`, the response returns `hasMore: true` plus a `nextCall` object to continue.",
        ),
      query: z
        .string()
        .optional()
        .describe(
          "Extra search terms AND-combined with from:{username}. Supports quoted phrases and OR (e.g. '\"AI\" OR ML').",
        ),
      include_retweets: z
        .boolean()
        .default(true)
        .describe("Include retweets. When false, appends -filter:retweets."),
      include_quotes: z
        .boolean()
        .default(true)
        .describe("Include quote tweets. When false, appends -filter:quote."),
      include_replies: z
        .boolean()
        .default(true)
        .describe("Include replies. When false, appends -filter:replies."),
      query_type: z
        .enum(["Latest", "Top"])
        .default("Latest")
        .describe("'Latest' = reverse-chronological. 'Top' = ranked by engagement."),
      lang: z
        .string()
        .regex(/^[a-z]{2}$/, "ISO 639-1 two-letter code")
        .optional()
        .describe("Filter by tweet language (ISO 639-1, e.g. 'en', 'es')."),
      min_faves: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe("Minimum like count. Maps to min_faves: operator."),
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    _meta: {
      "anthropic/maxResultSizeChars": 500000,
    },
  },
  async (args) => {
    const { provider, apiKey, baseUrl } = resolveProvider();
    if (!apiKey) {
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: `Missing ${API_KEY_ENV} or ${GETXAPI_KEY_ENV}. Set one in the MCP server's env block (Claude Desktop config or your shell).`,
          },
        ],
      };
    }

    try {
      const result = await fetchTweets(
        {
          username: args.username,
          since: args.since,
          until: args.until,
          limit: args.limit,
          query: args.query,
          includeRetweets: args.include_retweets,
          includeQuotes: args.include_quotes,
          includeReplies: args.include_replies,
          queryType: args.query_type,
          lang: args.lang,
          minFaves: args.min_faves,
        },
        apiKey,
        { provider, baseUrl },
      );

      return {
        content: [{ type: "text", text: JSON.stringify(result) }],
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        isError: true,
        content: [{ type: "text", text: message }],
      };
    }
  },
);

server.registerTool(
  "fetch_tweet_by_id",
  {
    title: "Fetch Tweet by ID",
    description:
      "Fetch one or more tweets by their numeric IDs via twitterapi.io. " +
      "Returns the same trimmed tweet shape as fetch_tweets (text, counts, author, media). " +
      "Does NOT search or filter — use fetch_tweets for user timeline search.",
    inputSchema: {
      tweet_ids: z
        .array(
          z
            .string()
            .regex(/^\d+$/, "Tweet ID must be numeric"),
        )
        .min(1)
        .max(100)
        .describe(
          "Array of numeric tweet ID strings (e.g. ['1846987139428634858']). Max 100 per call.",
        ),
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    _meta: {
      "anthropic/maxResultSizeChars": 500000,
    },
  },
  async (args) => {
    const apiKey = process.env[API_KEY_ENV];
    if (!apiKey) {
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: `Missing ${API_KEY_ENV}. Set it in the MCP server's env block (Claude Desktop config or your shell).`,
          },
        ],
      };
    }

    try {
      const tweets = await fetchTweetsByIds(args.tweet_ids, apiKey);
      if (tweets.length === 0) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: "No tweets found for the given IDs. Verify the tweet IDs are correct and the tweets have not been deleted.",
            },
          ],
        };
      }
      return {
        content: [{ type: "text", text: JSON.stringify(tweets) }],
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        isError: true,
        content: [{ type: "text", text: message }],
      };
    }
  },
);

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("mcp-twitter running on stdio");
}

process.on("SIGTERM", () => process.exit(0));
process.on("SIGINT", () => process.exit(0));

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
