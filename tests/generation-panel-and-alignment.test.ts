import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("compact output-generation validation review", () => {
  it("keeps counts and bulk actions visible while detailed issues stay behind the review dialog", () => {
    const source = readFileSync(new URL("../components/data-mapper/output-generation-panel.tsx", import.meta.url), "utf8");
    expect(source).toContain("Blocking errors");
    expect(source).toContain("Ignored");
    expect(source).toContain("Unresolved");
    expect(source).toContain("Warnings");
    expect(source).toContain("Review validation issues");
    expect(source).toContain("reviewOpen ?");
    expect(source).toContain('role="dialog"');
    expect(source).toContain("Ignore selected");
    expect(source).toContain("Restore selected");
    expect(source).toContain("Ignore all blocking errors");
    expect(source).toContain("Restore all ignored errors");
    expect(source.indexOf("state.issues.map")).toBeGreaterThan(source.indexOf("reviewOpen ?"));
  });
});

describe("Output Profile field alignment", () => {
  it("renders Source heading through the same field grid and read-only input control", () => {
    const source = readFileSync(new URL("../components/data-mapper/output-column-inspector.tsx", import.meta.url), "utf8");
    const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
    expect(source).toContain('className="field sourceHeadingField"');
    expect(source).toContain("Source heading");
    expect(source).toContain("readOnly");
    expect(css).toMatch(/\.outputColumnFields\s*\{[^}]*grid-template-columns:[^}]*repeat|\.outputColumnFields\s*\{[^}]*minmax\(180px/s);
    expect(css).toContain(".sourceHeadingField > span { white-space: nowrap;");
    expect(css).toContain(".sourceHeadingField input[readonly]");
    expect(css).toContain(".outputColumnFields { grid-template-columns: 1fr;");
  });
});
