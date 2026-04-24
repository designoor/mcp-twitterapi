import { describe, it, expect } from "vitest";
import { buildResponse, type TrimmedTweet } from "./api.js";

function tweet(id: string, createdAt: string): TrimmedTweet {
  return {
    id,
    url: `https://x.com/u/status/${id}`,
    text: `tweet ${id}`,
    createdAt,
    author: {},
    counts: {},
  };
}

const SINCE = "2026-03-24T00:00:00.000Z";
const UNTIL = "2026-04-24T00:00:00.000Z";

describe("buildResponse", () => {
  it("empty window: hasMore false, no nextCall, guidance hint", () => {
    const r = buildResponse({
      tweets: [],
      windowSinceIso: SINCE,
      windowUntilIso: UNTIL,
      limit: 200,
      stoppedReason: "empty",
      queryString: "from:test",
    });
    expect(r.count).toBe(0);
    expect(r.hasMore).toBe(false);
    expect(r.nextCall).toBeNull();
    expect(r.fetched).toBeNull();
    expect(r.hint).toMatch(/No tweets/i);
    expect(r.window).toEqual({ since: SINCE, until: UNTIL });
  });

  it("api_exhausted: window complete, no nextCall", () => {
    const tweets = [
      tweet("3", "2026-04-20T10:00:00Z"),
      tweet("2", "2026-04-15T10:00:00Z"),
      tweet("1", "2026-04-10T10:00:00Z"),
    ];
    const r = buildResponse({
      tweets,
      windowSinceIso: SINCE,
      windowUntilIso: UNTIL,
      limit: 200,
      stoppedReason: "api_exhausted",
      queryString: "q",
    });
    expect(r.count).toBe(3);
    expect(r.hasMore).toBe(false);
    expect(r.nextCall).toBeNull();
    expect(r.fetched).toEqual({
      newest: "2026-04-20T10:00:00Z",
      oldest: "2026-04-10T10:00:00Z",
    });
    expect(r.hint).toMatch(/complete/i);
  });

  it("limit_reached: hasMore true, nextCall.until = oldest - 1s, preserves original since", () => {
    const tweets = [
      tweet("3", "2026-04-20T10:00:00Z"),
      tweet("2", "2026-04-15T10:00:00Z"),
      tweet("1", "2026-04-10T10:00:05Z"),
    ];
    const r = buildResponse({
      tweets,
      windowSinceIso: SINCE,
      windowUntilIso: UNTIL,
      limit: 3,
      stoppedReason: "limit_reached",
      queryString: "q",
    });
    expect(r.hasMore).toBe(true);
    expect(r.nextCall).not.toBeNull();
    expect(r.nextCall?.since).toBe(SINCE);
    expect(r.nextCall?.until).toBe("2026-04-10T10:00:04.000Z");
    expect(r.hint).toMatch(/at limit/i);
    expect(r.hint).toMatch(/nextCall/);
  });

  it("max_pages: hasMore true, safety ceiling hint", () => {
    const tweets = [
      tweet("2", "2026-04-20T10:00:00Z"),
      tweet("1", "2026-04-10T10:00:00Z"),
    ];
    const r = buildResponse({
      tweets,
      windowSinceIso: SINCE,
      windowUntilIso: UNTIL,
      limit: 2000,
      stoppedReason: "max_pages",
      queryString: "q",
    });
    expect(r.hasMore).toBe(true);
    expect(r.nextCall).not.toBeNull();
    expect(r.nextCall?.until).toBe("2026-04-10T09:59:59.000Z");
    expect(r.hint).toMatch(/safety ceiling/i);
    expect(r.hint).toMatch(/ask the user/i);
  });

  it("computes true newest/oldest even when tweets arrive out of order", () => {
    const tweets = [
      tweet("b", "2026-04-10T10:00:00Z"),
      tweet("a", "2026-04-20T10:00:00Z"),
      tweet("c", "2026-04-15T10:00:00Z"),
    ];
    const r = buildResponse({
      tweets,
      windowSinceIso: null,
      windowUntilIso: UNTIL,
      limit: 200,
      stoppedReason: "api_exhausted",
      queryString: "q",
    });
    expect(r.fetched?.newest).toBe("2026-04-20T10:00:00Z");
    expect(r.fetched?.oldest).toBe("2026-04-10T10:00:00Z");
  });

  it("preserves null windowSinceIso through to nextCall.since", () => {
    const tweets = [tweet("1", "2026-04-20T10:00:00Z")];
    const r = buildResponse({
      tweets,
      windowSinceIso: null,
      windowUntilIso: UNTIL,
      limit: 1,
      stoppedReason: "limit_reached",
      queryString: "q",
    });
    expect(r.nextCall?.since).toBeNull();
    expect(r.nextCall?.until).toBe("2026-04-20T09:59:59.000Z");
  });

  it("returns the queryString verbatim for debugging", () => {
    const r = buildResponse({
      tweets: [],
      windowSinceIso: SINCE,
      windowUntilIso: UNTIL,
      limit: 10,
      stoppedReason: "empty",
      queryString: "from:foo -filter:retweets lang:en",
    });
    expect(r.queryString).toBe("from:foo -filter:retweets lang:en");
  });

  it("byte_budget: hasMore true, hint embeds timespan, count, and drop", () => {
    const tweets = [
      tweet("3", "2026-04-20T10:00:00Z"),
      tweet("2", "2026-04-15T10:00:00Z"),
      tweet("1", "2026-04-10T10:00:00Z"),
    ];
    const r = buildResponse({
      tweets,
      windowSinceIso: SINCE,
      windowUntilIso: UNTIL,
      limit: 200,
      stoppedReason: "byte_budget",
      queryString: "q",
      fetchedTotal: 20,
      byteSize: 450_000,
    });
    expect(r.hasMore).toBe(true);
    expect(r.nextCall).not.toBeNull();
    expect(r.nextCall?.until).toBe("2026-04-10T09:59:59.000Z");
    expect(r.hint).toMatch(/capped/i);
    expect(r.hint).toMatch(/KB/);
    expect(r.hint).toContain("2026-04-10T10:00:00Z");
    expect(r.hint).toContain("2026-04-20T10:00:00Z");
    expect(r.hint).toMatch(/17 additional/);
    expect(r.hint).toMatch(/average/i);
    expect(r.hint).toMatch(/ask the user/i);
  });

  it("byte_budget: fetchedTotal and droppedForSize are populated", () => {
    const tweets = [
      tweet("2", "2026-04-20T10:00:00Z"),
      tweet("1", "2026-04-15T10:00:00Z"),
    ];
    const r = buildResponse({
      tweets,
      windowSinceIso: null,
      windowUntilIso: UNTIL,
      limit: 200,
      stoppedReason: "byte_budget",
      queryString: "q",
      fetchedTotal: 15,
      byteSize: 480_000,
    });
    expect(r.fetchedTotal).toBe(15);
    expect(r.droppedForSize).toBe(13);
  });

  it("non-byte_budget stoppedReasons do not include fetchedTotal or droppedForSize", () => {
    const tweets = [tweet("1", "2026-04-20T10:00:00Z")];
    const limitReached = buildResponse({
      tweets,
      windowSinceIso: null,
      windowUntilIso: UNTIL,
      limit: 1,
      stoppedReason: "limit_reached",
      queryString: "q",
    });
    expect(limitReached.fetchedTotal).toBeUndefined();
    expect(limitReached.droppedForSize).toBeUndefined();

    const apiExhausted = buildResponse({
      tweets,
      windowSinceIso: null,
      windowUntilIso: UNTIL,
      limit: 10,
      stoppedReason: "api_exhausted",
      queryString: "q",
    });
    expect(apiExhausted.fetchedTotal).toBeUndefined();
    expect(apiExhausted.droppedForSize).toBeUndefined();
  });
});
