import { describe, it, expect } from "vitest";
import { buildQuery, type FetchTweetsInput } from "./api.js";

const base: FetchTweetsInput = {
  username: "elonmusk",
  maxResults: 20,
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

  it("converts since to since_time UNIX", () => {
    const q = buildQuery({ ...base, since: "2023-11-14T22:13:20Z" });
    expect(q).toContain("since_time:1700000000");
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
