import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  endHorizontalPanGesture,
  horizontalPanIgnoredSelector,
  isHorizontalPanIgnoredTarget,
  moveHorizontalPanGesture,
  type HorizontalPanGesture
} from "../components/data-mapper/use-horizontal-pan";

function pendingGesture(): HorizontalPanGesture {
  return { pointerId: 7, startX: 100, startY: 20, startScrollLeft: 60, status: "pending" };
}

describe("reusable horizontal drag-to-pan", () => {
  it("starts only after predominantly horizontal threshold movement and updates scroll position", () => {
    const pending = moveHorizontalPanGesture(pendingGesture(), 7, 104, 22);
    expect(pending).toMatchObject({ gesture: { status: "pending" }, scrollLeft: null, started: false });

    const started = moveHorizontalPanGesture(pendingGesture(), 7, 112, 22);
    expect(started).toMatchObject({ gesture: { status: "panning" }, scrollLeft: 48, started: true });
    expect(moveHorizontalPanGesture(started.gesture, 7, 130, 22)).toMatchObject({ scrollLeft: 30, started: false });
  });

  it("leaves vertical page gestures alone and ignores unrelated pointers", () => {
    expect(moveHorizontalPanGesture(pendingGesture(), 7, 102, 30)).toEqual({ gesture: null, scrollLeft: null, started: false });
    expect(moveHorizontalPanGesture(pendingGesture(), 99, 130, 20)).toMatchObject({ gesture: { status: "pending" }, scrollLeft: null });
  });

  it("ignores controls and draggable headings but permits ordinary table content", () => {
    const ignored = { closest: (selector: string) => selector === horizontalPanIgnoredSelector ? {} : null } as unknown as EventTarget;
    const ordinary = { closest: () => null } as unknown as EventTarget;
    expect(horizontalPanIgnoredSelector).toContain("button");
    expect(horizontalPanIgnoredSelector).toContain("input");
    expect(horizontalPanIgnoredSelector).toContain("[draggable='true']");
    expect(isHorizontalPanIgnoredTarget(ignored)).toBe(true);
    expect(isHorizontalPanIgnoredTarget(ordinary)).toBe(false);
  });

  it("clears active state on matching release or cancellation without affecting another pointer", () => {
    const active = { ...pendingGesture(), status: "panning" as const };
    expect(endHorizontalPanGesture(active, 8)).toBe(active);
    expect(endHorizontalPanGesture(active, 7)).toBeNull();

    const hook = readFileSync(new URL("../components/data-mapper/use-horizontal-pan.ts", import.meta.url), "utf8");
    expect(hook).toContain("onPointerUp");
    expect(hook).toContain("onPointerCancel");
    expect(hook).toContain("onLostPointerCapture");
  });

  it("binds the helper to Worksheet Preview, Source Sheet and Output Sheet while retaining scrollbars", () => {
    const importer = readFileSync(new URL("../components/data-mapper/workbook-importer.tsx", import.meta.url), "utf8");
    const builder = readFileSync(new URL("../components/data-mapper/output-profile-builder.tsx", import.meta.url), "utf8");
    const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
    expect(importer).toContain("worksheetPreviewPan.handlers");
    expect(builder).toContain("sourceSheetPan.handlers");
    expect(builder).toContain("outputSheetPan.handlers");
    expect(css).toMatch(/\.previewTableWrap\s*\{[^}]*overflow:\s*auto;/s);
    expect(css).toMatch(/\.outputSheetScroll\s*\{[^}]*overflow-x:\s*auto;/s);
    expect(css).toMatch(/\.horizontalPanSurface\.isPanning\s*\{[^}]*user-select:\s*none;/s);
  });
});
