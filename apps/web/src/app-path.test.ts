import { describe, expect, it } from "vitest";
import { resolveAppPath } from "./app-path";

describe("resolveAppPath", () => {
  it("keeps root deployment paths at the origin root", () => {
    expect(resolveAppPath("/sw.js", "/")).toBe("/sw.js");
    expect(resolveAppPath("/vision/model.task", "/")).toBe(
      "/vision/model.task",
    );
  });

  it("prefixes project-site deployment paths", () => {
    expect(resolveAppPath("/sw.js", "/smart_smile/")).toBe(
      "/smart_smile/sw.js",
    );
    expect(resolveAppPath("/vision/model.task", "/smart_smile/")).toBe(
      "/smart_smile/vision/model.task",
    );
  });
});
