import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RoleTemplateGrid } from "../components/role-template-grid";

describe("final Sprint 4 settings usability", () => {
  it("moves Role Templates under Users and keeps the legacy URL as a redirect", () => {
    const settings = readFileSync(new URL("../app/(app)/settings/page.tsx", import.meta.url), "utf8");
    const users = readFileSync(new URL("../app/(app)/admin/users/page.tsx", import.meta.url), "utf8");
    const roleTemplates = readFileSync(new URL("../app/(app)/admin/users/role-templates/page.tsx", import.meta.url), "utf8");
    const legacyRoute = readFileSync(new URL("../app/(app)/account/role-templates/page.tsx", import.meta.url), "utf8");
    const actions = readFileSync(new URL("../lib/actions/admin.actions.ts", import.meta.url), "utf8");

    expect(settings).not.toContain("Role Templates");
    expect(settings).not.toContain("/account/role-templates");
    expect(users).toContain('href="/admin/users/role-templates"');
    expect(users).toContain("Role Templates");
    expect(legacyRoute).toContain('redirect("/admin/users/role-templates")');
    expect(roleTemplates).toContain("requireUser()");
    expect(roleTemplates).toContain('hasPermission(user, "manageCustomerUsers")');
    expect(roleTemplates).toContain("tenantId: user.tenantId");
    expect(actions).toMatch(/updateRoleTemplateAction[\s\S]*hasPermission\(actor, "manageCustomerUsers"\)[\s\S]*tenantId_role: \{ tenantId: actor\.tenantId, role \}/);
    expect(actions).toContain('revalidatePath("/admin/users/role-templates")');
  });

  it("renders the three standard templates as one scrollable permission matrix", () => {
    const markup = renderToStaticMarkup(createElement(RoleTemplateGrid, {
      templates: [{ role: "VIEW_ONLY", permissions: { viewRecords: true, raiseSupportTickets: true } }]
    }));
    const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");

    expect(markup).toContain('class="roleTemplateMatrix"');
    expect(markup).toContain('class="roleTemplateMatrixScroll"');
    expect(markup).toContain("<table");
    expect(markup).toContain("View Only");
    expect(markup).toContain("Super User");
    expect(markup).toContain("Admin");
    expect(markup).toContain("Save role templates");
    expect(markup).toContain("View records for View Only");
    expect(markup).not.toContain("Manage Axiom controls");
    expect(css).toMatch(/\.roleTemplateMatrixScroll\s*\{[^}]*overflow-x:\s*auto/s);
  });

  it("exposes both Add column choices without replacing heading drag-to-add", () => {
    const builder = readFileSync(new URL("../components/data-mapper/output-profile-builder.tsx", import.meta.url), "utf8");
    expect(builder).toContain("Add column");
    expect(builder).toContain("From source field");
    expect(builder).toContain("Fixed value");
    expect(builder).toContain("addChosenSourceColumn");
    expect(builder).toContain("draggable={canInteract}");
    expect(builder).not.toContain("Add fixed column");
  });
});
