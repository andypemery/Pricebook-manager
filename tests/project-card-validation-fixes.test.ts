import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

describe("clickable Project cards", () => {
  it("uses the whole Dashboard Project card as one accessible link while retaining the four-Project limit", () => {
    const dashboard = source("app/(app)/dashboard/page.tsx");

    expect(dashboard).toContain("listProjects(prisma, actor.tenantId, 4)");
    expect(dashboard).toContain('aria-label={`Open Project ${project.name}`}');
    expect(dashboard).toContain('className="projectCard projectCardLink"');
    expect(dashboard).toContain('href={`/projects/${project.id}`}');
    expect(dashboard).toContain('className="projectCardTitle" title={project.name}');
    expect(dashboard).toContain('className="projectCardWorkbook" title={workbookName}');
    expect(dashboard).not.toContain(">Open Project</Link>");
    expect(dashboard).toContain('className="projectProfileCard"');
  });

  it("uses the whole Projects-page card as one accessible link without nested links", () => {
    const projects = source("app/(app)/projects/page.tsx");

    expect(projects).toContain('className="card projectCard projectCardLink"');
    expect(projects).toContain('aria-label={`Open Project ${project.name}`}');
    expect(projects).toContain('href={`/projects/${project.id}`}');
    expect(projects).toContain('className="projectCardTitle" title={project.name}');
    expect(projects).toContain('className="muted projectCardWorkbook" title={workbookName}');
    expect(projects).not.toContain(">Open Project</Link>");
    expect(projects).not.toContain("<article");
  });

  it("allows the responsive grid and every card text path to shrink without hiding page overflow", () => {
    const css = source("app/globals.css");

    expect(css).toContain("grid-template-columns:repeat(auto-fit,minmax(min(100%,240px),1fr))");
    expect(css).toContain(".projectGrid { display:grid; grid-template-columns:repeat(auto-fit,minmax(min(100%,240px),1fr))");
    expect(css).toContain(".projectProfileGrid { display:grid; grid-template-columns:repeat(auto-fit,minmax(240px,1fr))");
    expect(css).toContain(".projectCard { display:grid; min-width:0");
    expect(css).toContain(".projectCard > *, .projectCardHeading { min-width:0; }");
    expect(css).toContain(".projectCardTitle, .projectCardWorkbook { display:block; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }");
    expect(css).toContain(".projectCardLink:hover, .projectCardLink:focus-visible");
    expect(css).not.toContain("overflow-x:hidden");
  });
});
