import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { buildQuery, fetchTweetsByIds, type FetchTweetsInput } from "./api.js";

const base: FetchTweetsInput = {
  username: "elonmusk",
  limit: 20,
  includeRetweets: true,
  includeQuotes: true,
  includeReplies: true,
  queryType: "Latest",
};

describe("buildQuery", () => {
  it("starts with from:username", () => {
    expect(buildQuery(base)).toBe("from:elonmusk");
  });

  it("AND-combines user query terms", () => {
    expect(buildQuery({ ...base, query: '"AI" OR ML' })).toBe('from:elonmusk "AI" OR ML');
  });

  it("appends -filter:retweets when includeRetweets is false", () => {
    expect(buildQuery({ ...base, includeRetweets: false })).toContain("-filter:retweets");
  });

  it("appends -filter:quote when includeQuotes is false", () => {
    expect(buildQuery({ ...base, includeQuotes: false })).toContain("-filter:quote");
  });

  it("appends -filter:replies when includeReplies is false", () => {
    expect(buildQuery({ ...base, includeReplies: false })).toContain("-filter:replies");
  });

  it("adds lang: operator", () => {
    expect(buildQuery({ ...base, lang: "en" })).toContain("lang:en");
  });

  it("adds min_faves: operator", () => {
    expect(buildQuery({ ...base, minFaves: 100 })).toContain("min_faves:100");
  });

  it("adds min_faves:0 (zero is a valid bound, not omitted)", () => {
    expect(buildQuery({ ...base, minFaves: 0 })).toContain("min_faves:0");
  });

  it("emits since_time and until_time operators from explicit unix args", () => {
    const q = buildQuery(base, 1700000000, 1700086400);
    expect(q).toContain("since_time:1700000000");
    expect(q).toContain("until_time:1700086400");
  });

  it("does not emit time operators when sinceUnix/untilUnix are null", () => {
    const q = buildQuery(base, null, null);
    expect(q).not.toContain("since_time:");
    expect(q).not.toContain("until_time:");
  });

  it("ignores input.since/input.until (time bounds are passed explicitly)", () => {
    const q = buildQuery(
      { ...base, since: "2023-11-14T22:13:20Z", until: "2023-11-15T22:13:20Z" },
      null,
      null,
    );
    expect(q).not.toContain("since_time:");
    expect(q).not.toContain("until_time:");
  });

  it("composes all filters together", () => {
    const q = buildQuery({
      ...base,
      query: "rocket",
      includeRetweets: false,
      includeReplies: false,
      lang: "en",
      minFaves: 50,
    });
    expect(q).toBe(
      "from:elonmusk rocket -filter:retweets -filter:replies lang:en min_faves:50",
    );
  });
});

const rawTweet = {
  id: "1846987139428634858",
  url: "https://x.com/u/status/1846987139428634858",
  text: "hello world",
  createdAt: "Sat Jan 01 00:00:00 +0000 2026",
  lang: "en",
  author: { userName: "testuser", name: "Test User", id: "42" },
  likeCount: 5,
  retweetCount: 1,
  replyCount: 0,
  quoteCount: 0,
  viewCount: 100,
  bookmarkCount: 0,
};

describe("fetchTweetsByIds", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("calls the correct URL with comma-separated IDs", async () => {
    const ids = ["111", "222", "333"];
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ tweets: [], status: "success" }),
    });

    await fetchTweetsByIds(ids, "test-key");

    const call = (globalThis.fetch as any).mock.calls[0];
    const url = new URL(call[0]);
    expect(url.pathname).toBe("/twitter/tweets");
    expect(url.searchParams.get("tweet_ids")).toBe("111,222,333");
    expect(call[1].headers["X-API-Key"]).toBe("test-key");
  });

  it("returns trimmed tweets", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ tweets: [rawTweet], status: "success" }),
    });

    const result = await fetchTweetsByIds(["1846987139428634858"], "key");

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("1846987139428634858");
    expect(result[0].text).toBe("hello world");
    expect(result[0].author.userName).toBe("testuser");
    expect(result[0].counts.like).toBe(5);
  });

  it("returns empty array when no tweets found", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ tweets: [], status: "success" }),
    });

    const result = await fetchTweetsByIds(["999"], "key");
    expect(result).toEqual([]);
  });

  it("throws on non-200 response", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      statusText: "Not Found",
      text: async () => "not found",
    });

    await expect(fetchTweetsByIds(["123"], "key")).rejects.toThrow(
      /twitterapi\.io returned 404 Not Found/,
    );
  });
});
