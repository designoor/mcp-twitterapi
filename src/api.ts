import { parseTimeToUnix } from "./time.js";

const ENDPOINT = "https://api.twitterapi.io/twitter/tweet/advanced_search";
const MAX_PAGES = 10;

export interface FetchTweetsInput {
  username: string;
  since?: string;
  until?: string;
  maxResults: number;
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

export interface FetchTweetsResult {
  tweets: TrimmedTweet[];
  count: number;
  truncated: boolean;
  queryString: string;
}

export function buildQuery(input: FetchTweetsInput): string {
  const parts: string[] = [`from:${input.username}`];

  if (input.query && input.query.trim()) parts.push(input.query.trim());
  if (input.since) parts.push(`since_time:${parseTimeToUnix(input.since)}`);
  if (input.until) parts.push(`until_time:${parseTimeToUnix(input.until)}`);
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

export async function fetchTweets(
  input: FetchTweetsInput,
  apiKey: string,
): Promise<FetchTweetsResult> {
  const queryString = buildQuery(input);
  const collected: TrimmedTweet[] = [];
  let cursor = "";
  let hasNextPage = true;
  let pages = 0;

  while (hasNextPage && collected.length < input.maxResults && pages < MAX_PAGES) {
    const url = new URL(ENDPOINT);
    url.searchParams.set("query", queryString);
    url.searchParams.set("queryType", input.queryType);
    if (cursor) url.searchParams.set("cursor", cursor);

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
      next_cursor?: string;
    };

    for (const t of data.tweets ?? []) {
      collected.push(trimTweet(t));
      if (collected.length >= input.maxResults) break;
    }

    hasNextPage = Boolean(data.has_next_page);
    cursor = data.next_cursor ?? "";
    pages += 1;
    if (!cursor) break;
  }

  return {
    tweets: collected,
    count: collected.length,
    truncated: hasNextPage && collected.length >= input.maxResults,
    queryString,
  };
}
