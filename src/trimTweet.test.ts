import { describe, it, expect } from "vitest";
import { trimTweet } from "./api.js";

const baseRaw = {
  id: "1",
  url: "https://x.com/u/status/1",
  text: "hello",
  createdAt: "Sat Jan 01 00:00:00 +0000 2026",
  lang: "en",
  author: { userName: "u", name: "U", id: "100" },
  likeCount: 1,
  retweetCount: 0,
  replyCount: 0,
  quoteCount: 0,
  viewCount: 10,
  bookmarkCount: 0,
};

describe("trimTweet media extraction", () => {
  it("omits hasMedia and media on text-only tweets", () => {
    const t = trimTweet({ ...baseRaw });
    expect(t.hasMedia).toBeUndefined();
    expect(t.media).toBeUndefined();
  });

  it("treats empty extendedEntities.media as no media", () => {
    const t = trimTweet({ ...baseRaw, extendedEntities: { media: [] } });
    expect(t.hasMedia).toBeUndefined();
    expect(t.media).toBeUndefined();
  });

  it("extracts a photo with media_url_https", () => {
    const t = trimTweet({
      ...baseRaw,
      extendedEntities: {
        media: [
          {
            type: "photo",
            media_url_https: "https://pbs.twimg.com/media/abc.jpg",
          },
        ],
      },
    });
    expect(t.hasMedia).toBe(true);
    expect(t.media).toEqual([
      { type: "photo", url: "https://pbs.twimg.com/media/abc.jpg" },
    ]);
  });

  it("passes through ext_alt_text on photos", () => {
    const t = trimTweet({
      ...baseRaw,
      extendedEntities: {
        media: [
          {
            type: "photo",
            media_url_https: "https://pbs.twimg.com/media/abc.jpg",
            ext_alt_text: "a nebula in space",
          },
        ],
      },
    });
    expect(t.media?.[0].altText).toBe("a nebula in space");
  });

  it("ignores empty ext_alt_text", () => {
    const t = trimTweet({
      ...baseRaw,
      extendedEntities: {
        media: [
          {
            type: "photo",
            media_url_https: "https://pbs.twimg.com/media/abc.jpg",
            ext_alt_text: "",
          },
        ],
      },
    });
    expect(t.media?.[0].altText).toBeUndefined();
  });

  it("picks the highest-bitrate mp4 variant for video", () => {
    const t = trimTweet({
      ...baseRaw,
      extendedEntities: {
        media: [
          {
            type: "video",
            media_url_https: "https://pbs.twimg.com/amplify_video_thumb/x/img/poster.jpg",
            video_info: {
              variants: [
                { content_type: "application/x-mpegURL", url: "https://video.twimg.com/x.m3u8" },
                { bitrate: 256000, content_type: "video/mp4", url: "https://video.twimg.com/lo.mp4" },
                { bitrate: 2176000, content_type: "video/mp4", url: "https://video.twimg.com/hi.mp4" },
                { bitrate: 832000, content_type: "video/mp4", url: "https://video.twimg.com/mid.mp4" },
              ],
            },
          },
        ],
      },
    });
    expect(t.media?.[0]).toEqual({
      type: "video",
      url: "https://pbs.twimg.com/amplify_video_thumb/x/img/poster.jpg",
      videoUrl: "https://video.twimg.com/hi.mp4",
    });
  });

  it("returns no videoUrl when no mp4 variants exist", () => {
    const t = trimTweet({
      ...baseRaw,
      extendedEntities: {
        media: [
          {
            type: "video",
            media_url_https: "https://pbs.twimg.com/poster.jpg",
            video_info: {
              variants: [
                { content_type: "application/x-mpegURL", url: "https://video.twimg.com/x.m3u8" },
              ],
            },
          },
        ],
      },
    });
    expect(t.media?.[0].videoUrl).toBeUndefined();
  });

  it("handles animated_gif the same as video", () => {
    const t = trimTweet({
      ...baseRaw,
      extendedEntities: {
        media: [
          {
            type: "animated_gif",
            media_url_https: "https://pbs.twimg.com/tweet_video_thumb/x.jpg",
            video_info: {
              variants: [
                { bitrate: 0, content_type: "video/mp4", url: "https://video.twimg.com/g.mp4" },
              ],
            },
          },
        ],
      },
    });
    expect(t.media?.[0]).toEqual({
      type: "animated_gif",
      url: "https://pbs.twimg.com/tweet_video_thumb/x.jpg",
      videoUrl: "https://video.twimg.com/g.mp4",
    });
  });

  it("extracts multiple photos in order", () => {
    const t = trimTweet({
      ...baseRaw,
      extendedEntities: {
        media: [
          { type: "photo", media_url_https: "https://pbs.twimg.com/media/1.jpg" },
          { type: "photo", media_url_https: "https://pbs.twimg.com/media/2.jpg" },
          { type: "photo", media_url_https: "https://pbs.twimg.com/media/3.jpg" },
        ],
      },
    });
    expect(t.media).toHaveLength(3);
    expect(t.media?.map((m) => m.url)).toEqual([
      "https://pbs.twimg.com/media/1.jpg",
      "https://pbs.twimg.com/media/2.jpg",
      "https://pbs.twimg.com/media/3.jpg",
    ]);
  });

  it("skips media items without type or media_url_https", () => {
    const t = trimTweet({
      ...baseRaw,
      extendedEntities: {
        media: [
          { type: "photo" },
          { media_url_https: "https://pbs.twimg.com/media/x.jpg" },
          { type: "photo", media_url_https: "https://pbs.twimg.com/media/ok.jpg" },
        ],
      },
    });
    expect(t.media).toHaveLength(1);
    expect(t.media?.[0].url).toBe("https://pbs.twimg.com/media/ok.jpg");
  });

  it("ignores entities.media (only reads extendedEntities.media)", () => {
    const t = trimTweet({
      ...baseRaw,
      entities: {
        media: [{ type: "photo", media_url_https: "https://pbs.twimg.com/media/from-entities.jpg" }],
      },
    });
    expect(t.hasMedia).toBeUndefined();
  });

  it("flags hasMedia on quoted tweet without exposing the media array", () => {
    const t = trimTweet({
      ...baseRaw,
      quoted_tweet: {
        id: "q1",
        text: "quoted",
        author: { userName: "qu" },
        createdAt: "Sat Jan 01 00:00:00 +0000 2026",
        extendedEntities: {
          media: [{ type: "photo", media_url_https: "https://pbs.twimg.com/media/q.jpg" }],
        },
      },
    });
    expect(t.quotedTweet?.hasMedia).toBe(true);
    expect((t.quotedTweet as any).media).toBeUndefined();
  });

  it("flags hasMedia on retweeted tweet", () => {
    const t = trimTweet({
      ...baseRaw,
      retweeted_tweet: {
        id: "r1",
        text: "rt",
        author: { userName: "ru" },
        createdAt: "Sat Jan 01 00:00:00 +0000 2026",
        extendedEntities: {
          media: [{ type: "video", media_url_https: "https://pbs.twimg.com/poster.jpg" }],
        },
      },
    });
    expect(t.retweetedTweet?.hasMedia).toBe(true);
  });
});
