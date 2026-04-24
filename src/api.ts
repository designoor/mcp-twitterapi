import { parseTimeToUnix } from "./time.js";

const ENDPOINT = "https://api.twitterapi.io/twitter/tweet/advanced_search";
const MAX_PAGES = 110;
const BYTE_BUDGET = 450_000;

export interface FetchTweetsInput {
  username: string;
  since?: string;
  until?: string;
  limit: number;
  query?: string;
  includeRetweets: boolean;
  includeQuotes: boolean;
  includeReplies: boolean;
  queryType: "Latest" | "Top";
  lang?: string;
  minFaves?: number;
}

export interface TrimmedTweet {
  id: string;
  url: string;
  text: string;
  createdAt: string;
  lang?: string;
  author: { userName?: string; name?: string; id?: string };
  counts: {
    like?: number;
    retweet?: number;
    reply?: number;
    quote?: number;
    view?: number;
    bookmark?: number;
  };
  isReply?: boolean;
  inReplyToUsername?: string;
  conversationId?: string;
  quotedTweet?: QuotedOrRetweeted;
  retweetedTweet?: QuotedOrRetweeted;
}

interface QuotedOrRetweeted {
  id?: string;
  text?: string;
  author?: string;
  createdAt?: string;
}

export type StoppedReason =
  | "empty"
  | "api_exhausted"
  | "limit_reached"
  | "max_pages"
  | "byte_budget";

export interface FetchTweetsResult {
  tweets: TrimmedTweet[];
  count: number;
  window: { since: string | null; until: string };
  fetched: { newest: string; oldest: string } | null;
  hasMore: boolean;
  nextCall: { since: string | null; until: string } | null;
  hint: string;
  queryString: string;
  fetchedTotal?: number;
  droppedForSize?: number;
}

export function buildQuery(
  input: FetchTweetsInput,
  sinceUnix: number | null = null,
  untilUnix: number | null = null,
): string {
  const parts: string[] = [`from:${input.username}`];

  if (input.query && input.query.trim()) parts.push(input.query.trim());
  if (sinceUnix !== null) parts.push(`since_time:${sinceUnix}`);
  if (untilUnix !== null) parts.push(`until_time:${untilUnix}`);
  if (!input.includeRetweets) parts.push("-filter:retweets");
  if (!input.includeQuotes) parts.push("-filter:quote");
  if (!input.includeReplies) parts.push("-filter:replies");
  if (input.lang) parts.push(`lang:${input.lang}`);
  if (input.minFaves !== undefined) parts.push(`min_faves:${input.minFaves}`);

  return parts.join(" ");
}

function trimTweet(raw: any): TrimmedTweet {
  const trimmed: TrimmedTweet = {
    id: raw.id,
    url: raw.url,
    text: raw.text,
    createdAt: raw.createdAt,
    lang: raw.lang,
    author: {
      userName: raw.author?.userName,
      name: raw.author?.name,
      id: raw.author?.id,
    },
    counts: {
      like: raw.likeCount,
      retweet: raw.retweetCount,
      reply: raw.replyCount,
      quote: raw.quoteCount,
      view: raw.viewCount,
      bookmark: raw.bookmarkCount,
    },
    isReply: raw.isReply,
    inReplyToUsername: raw.inReplyToUsername,
    conversationId: raw.conversationId,
  };

  if (raw.quoted_tweet) {
    trimmed.quotedTweet = {
      id: raw.quoted_tweet.id,
      text: raw.quoted_tweet.text,
      author: raw.quoted_tweet.author?.userName,
      createdAt: raw.quoted_tweet.createdAt,
    };
  }
  if (raw.retweeted_tweet) {
    trimmed.retweetedTweet = {
      id: raw.retweeted_tweet.id,
      text: raw.retweeted_tweet.text,
      author: raw.retweeted_tweet.author?.userName,
      createdAt: raw.retweeted_tweet.createdAt,
    };
  }

  return trimmed;
}

function parseTweetTime(s: string): number {
  const ms = Date.parse(s);
  if (Number.isNaN(ms)) {
    throw new Error(`Unparseable tweet createdAt: "${s}"`);
  }
  return Math.floor(ms / 1000);
}

function findExtremes(tweets: TrimmedTweet[]): { newest: string; oldest: string } {
  let newestMs = -Infinity;
  let oldestMs = Infinity;
  let newestStr = tweets[0].createdAt;
  let oldestStr = tweets[0].createdAt;
  for (const t of tweets) {
    const ms = Date.parse(t.createdAt);
    if (Number.isNaN(ms)) continue;
    if (ms > newestMs) {
      newestMs = ms;
      newestStr = t.createdAt;
    }
    if (ms < oldestMs) {
      oldestMs = ms;
      oldestStr = t.createdAt;
    }
  }
  return { newest: newestStr, oldest: oldestStr };
}

export function buildResponse(args: {
  tweets: TrimmedTweet[];
  windowSinceIso: string | null;
  windowUntilIso: string;
  limit: number;
  stoppedReason: StoppedReason;
  queryString: string;
  fetchedTotal?: number;
  byteSize?: number;
}): FetchTweetsResult {
  const {
    tweets,
    windowSinceIso,
    windowUntilIso,
    stoppedReason,
    queryString,
    fetchedTotal,
    byteSize,
  } = args;
  const count = tweets.length;
  const window = { since: windowSinceIso, until: windowUntilIso };

  if (count === 0 || stoppedReason === "empty") {
    return {
      tweets: [],
      count: 0,
      window,
      fetched: null,
      hasMore: false,
      nextCall: null,
      hint: "No tweets found in this window. Try a broader date range, remove filters, or verify the username.",
      queryString,
    };
  }

  const fetched = findExtremes(tweets);
  const hasMore =
    stoppedReason === "limit_reached" ||
    stoppedReason === "max_pages" ||
    stoppedReason === "byte_budget";

  let nextCall: { since: string | null; until: string } | null = null;
  let hint: string;

  if (hasMore) {
    const oldestUnix = parseTweetTime(fetched.oldest);
    const nextUntilIso = new Date((oldestUnix - 1) * 1000).toISOString();
    nextCall = { since: windowSinceIso, until: nextUntilIso };

    if (stoppedReason === "limit_reached") {
      hint = `Returned ${count} tweets (at limit). More tweets exist earlier in the window. To continue, call fetch_tweets again with the nextCall parameters.`;
    } else if (stoppedReason === "max_pages") {
      hint = `Returned ${count} tweets covering ${fetched.oldest} → ${fetched.newest}. Pagination safety ceiling reached; more tweets may exist earlier in the window. **Stop and ask the user whether to continue before making another fetch_tweets call** — continuation costs additional API requests. If the user confirms, use the nextCall parameters or narrow the window.`;
    } else {
      const dropped = fetchedTotal !== undefined ? fetchedTotal - count : 0;
      const avgBytes = byteSize !== undefined ? Math.round(byteSize / count) : 0;
      hint = `Returned ${count} tweets covering ${fetched.oldest} → ${fetched.newest}. Response size was capped at ~${Math.round(BYTE_BUDGET / 1000)}KB (MCP client limit); ${dropped} additional fetched tweets were dropped to fit, and more tweets may exist earlier in the window. This user's tweets average ~${avgBytes} bytes, so subsequent calls will likely hit the same cap. **Stop and ask the user whether to continue before making another fetch_tweets call** — each continuation costs additional API requests. If the user confirms, continue with the nextCall parameters; otherwise consider summarizing what you have or lowering \`limit\`.`;
    }
  } else {
    hint = `Window complete. All ${count} tweets in the requested range have been returned.`;
  }

  const result: FetchTweetsResult = {
    tweets,
    count,
    window,
    fetched,
    hasMore,
    nextCall,
    hint,
    queryString,
  };

  if (stoppedReason === "byte_budget" && fetchedTotal !== undefined) {
    result.fetchedTotal = fetchedTotal;
    result.droppedForSize = fetchedTotal - count;
  }

  return result;
}

export async function fetchTweets(
  input: FetchTweetsInput,
  apiKey: string,
): Promise<FetchTweetsResult> {
  const nowSec = Math.floor(Date.now() / 1000);
  const sinceUnix = input.since ? parseTimeToUnix(input.since, nowSec) : null;
  const untilUnix = input.until ? parseTimeToUnix(input.until, nowSec) : nowSec;
  const windowSinceIso = sinceUnix !== null ? new Date(sinceUnix * 1000).toISOString() : null;
  const windowUntilIso = new Date(untilUnix * 1000).toISOString();

  const queryString = buildQuery(input, sinceUnix, untilUnix);
  let collected: TrimmedTweet[] = [];
  const seenIds = new Set<string>();
  let pages = 0;
  let hitByteBudget = false;
  let exitReason:
    | "limit"
    | "max_pages"
    | "no_new_tweets"
    | "api_exhausted"
    | "window_exhausted" = "api_exhausted";
  let currentUntil = untilUnix;

  while (true) {
    if (collected.length >= input.limit) {
      exitReason = "limit";
      break;
    }
    if (pages >= MAX_PAGES) {
      exitReason = "max_pages";
      break;
    }

    const url = new URL(ENDPOINT);
    url.searchParams.set("query", buildQuery(input, sinceUnix, currentUntil));
    url.searchParams.set("queryType", input.queryType);

    const response = await fetch(url, {
      method: "GET",
      headers: { "X-API-Key": apiKey, Accept: "application/json" },
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(
        `twitterapi.io returned ${response.status} ${response.statusText}${body ? `: ${body.slice(0, 500)}` : ""}`,
      );
    }

    const data = (await response.json()) as {
      tweets?: any[];
      has_next_page?: boolean;
    };

    pages += 1;

    let addedThisCall = 0;
    let oldestMsThisCall = Infinity;
    for (const t of data.tweets ?? []) {
      if (seenIds.has(t.id)) continue;
      seenIds.add(t.id);
      collected.push(trimTweet(t));
      addedThisCall += 1;
      const ms = Date.parse(t.createdAt);
      if (!Number.isNaN(ms) && ms < oldestMsThisCall) oldestMsThisCall = ms;
      if (collected.length >= input.limit) break;
    }

    if (addedThisCall === 0) {
      exitReason = "no_new_tweets";
      break;
    }
    if (!data.has_next_page) {
      exitReason = "api_exhausted";
      break;
    }

    // Walk the upper bound backward to just before the oldest tweet we just received.
    if (oldestMsThisCall === Infinity) {
      // Shouldn't happen — we added tweets, so at least one had a parseable createdAt.
      exitReason = "api_exhausted";
      break;
    }
    const newUntil = Math.floor(oldestMsThisCall / 1000) - 1;
    if (sinceUnix !== null && newUntil <= sinceUnix) {
      exitReason = "window_exhausted";
      break;
    }
    currentUntil = newUntil;

    if (Buffer.byteLength(JSON.stringify(collected), "utf8") > BYTE_BUDGET) {
      hitByteBudget = true;
      break;
    }
  }

  let fetchedTotal: number | undefined;
  let byteSize: number | undefined;
  if (hitByteBudget) {
    fetchedTotal = collected.length;
    const kept = largestPrefixUnderBudget(collected, BYTE_BUDGET);
    collected = collected.slice(0, kept);
    byteSize = Buffer.byteLength(JSON.stringify(collected), "utf8");
  }

  let stoppedReason: StoppedReason;
  if (collected.length === 0) {
    stoppedReason = "empty";
  } else if (hitByteBudget) {
    stoppedReason = "byte_budget";
  } else if (exitReason === "limit") {
    stoppedReason = "limit_reached";
  } else if (exitReason === "max_pages") {
    stoppedReason = "max_pages";
  } else {
    // no_new_tweets | api_exhausted | window_exhausted — all mean the window is fully covered
    stoppedReason = "api_exhausted";
  }

  return buildResponse({
    tweets: collected,
    windowSinceIso,
    windowUntilIso,
    limit: input.limit,
    stoppedReason,
    queryString,
    fetchedTotal,
    byteSize,
  });
}

function largestPrefixUnderBudget(tweets: TrimmedTweet[], budget: number): number {
  let lo = 0;
  let hi = tweets.length;
  while (lo < hi) {
    const mid = Math.floor((lo + hi + 1) / 2);
    const size = Buffer.byteLength(JSON.stringify(tweets.slice(0, mid)), "utf8");
    if (size <= budget) {
      lo = mid;
    } else {
      hi = mid - 1;
    }
  }
  return lo;
}
