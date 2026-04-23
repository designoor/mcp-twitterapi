import { describe, it, expect } from "vitest";
import { parseTimeToUnix } from "./time.js";

describe("parseTimeToUnix", () => {
  const NOW = 1_700_000_000;

  it("parses ISO 8601 with Z", () => {
    expect(parseTimeToUnix("2023-11-14T22:13:20Z", NOW)).toBe(NOW);
  });

  it("parses relative seconds", () => {
    expect(parseTimeToUnix("30s", NOW)).toBe(NOW - 30);
  });

  it("parses relative minutes", () => {
    expect(parseTimeToUnix("45m", NOW)).toBe(NOW - 45 * 60);
  });

  it("parses relative hours", () => {
    expect(parseTimeToUnix("6h", NOW)).toBe(NOW - 6 * 3600);
  });

  it("parses relative days", () => {
    expect(parseTimeToUnix("2d", NOW)).toBe(NOW - 2 * 86400);
  });

  it("parses relative weeks", () => {
    expect(parseTimeToUnix("1w", NOW)).toBe(NOW - 604800);
  });

  it("is case insensitive for relative units", () => {
    expect(parseTimeToUnix("6H", NOW)).toBe(NOW - 6 * 3600);
  });

  it("tolerates whitespace inside relative format", () => {
    expect(parseTimeToUnix(" 2 d ", NOW)).toBe(NOW - 2 * 86400);
  });

  it("throws on garbage input", () => {
    expect(() => parseTimeToUnix("not-a-date", NOW)).toThrow(/Invalid time/);
  });

  it("throws on unsupported unit", () => {
    expect(() => parseTimeToUnix("5y", NOW)).toThrow(/Invalid time/);
  });
});
