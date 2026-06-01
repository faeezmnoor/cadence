import { describe, it, expect } from "vitest";
import { pollAllFeeds } from "@/server/connectors/rss";

describe("rss connector — module shape", () => {
  it("exports pollAllFeeds", () => {
    expect(typeof pollAllFeeds).toBe("function");
  });
});
