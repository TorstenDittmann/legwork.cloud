import { describe, expect, it } from "vitest";
import { discoverCheckCommand, shellQuote } from "./index";

describe("check mapping", () => {
  it("maps only declared package scripts", () => {
    expect(discoverCheckCommand(new Set(["package.json"]), { scripts: { test: "vitest" } }, "test")?.args).toEqual(["--offline", "run", "test"]);
    expect(discoverCheckCommand(new Set(["package.json"]), { scripts: { test: "vitest" } }, "build")).toBeNull();
  });
  it("quotes model-controlled arguments", () => expect(shellQuote("'; touch /tmp/x; '")).toContain("\\''"));
});
