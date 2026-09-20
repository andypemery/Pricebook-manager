import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repositoryRoot = process.cwd();

async function readRepositoryFile(filePath: string) {
  return readFile(path.join(repositoryRoot, filePath), "utf8");
}

describe("deployment migration hardening", () => {
  it("uses the hardened Vercel build without automatic schema mutation", async () => {
    const vercel = JSON.parse(await readRepositoryFile("vercel.json")) as {
      buildCommand: string;
      regions: string[];
    };
    const packageJson = JSON.parse(await readRepositoryFile("package.json")) as {
      scripts: Record<string, string>;
    };

    expect(vercel.buildCommand).toBe("npm run vercel-build");
    expect(vercel.regions).toEqual(["lhr1"]);
    expect(vercel.buildCommand).not.toMatch(/prisma\s+db\s+push/i);
    expect(vercel.buildCommand).not.toMatch(/prisma\s+migrate\s+deploy/i);
    expect(packageJson.scripts["vercel-build"]).toBe(
      "npm run db:generate && npm run db:check-migrations && npm run db:setup && npm run build"
    );
    expect(packageJson.scripts["vercel-build"]).not.toMatch(/prisma\s+(?:db\s+push|migrate\s+deploy)/i);
    expect(packageJson.scripts["db:migrate:deploy"]).toBe("prisma migrate deploy");
    expect(packageJson.scripts["db:push"]).toBeUndefined();
    expect(packageJson.scripts.build).toBe("next build --webpack");
  });

  it("keeps production setup separate from schema management", async () => {
    const setup = await readRepositoryFile("prisma/setup-production.ts");

    expect(setup).not.toMatch(/prisma\s+db\s+push/i);
    expect(setup).not.toMatch(/prisma\s+migrate\s+deploy/i);
    expect(setup).not.toMatch(/\$(?:executeRaw|executeRawUnsafe)/);
    expect(setup).not.toMatch(/\b(?:CREATE|ALTER|DROP|TRUNCATE)\s+(?:TABLE|TYPE|INDEX)\b/i);
  });

  it("keeps the migration-state gate read-only", async () => {
    const guard = await readRepositoryFile("prisma/check-migration-state.ts");

    expect(guard).toContain("$queryRaw");
    expect(guard).not.toMatch(/\$(?:executeRaw|executeRawUnsafe)/);
    expect(guard).not.toMatch(/\b(?:CREATE|ALTER|DROP|TRUNCATE|INSERT|UPDATE|DELETE)\b/i);
    expect(guard).not.toMatch(/migrate\s+(?:deploy|resolve|reset)/i);
  });

  it("documents the guarded release and Sensitive-variable policies consistently", async () => {
    const deploymentGuide = await readRepositoryFile("README_DEPLOYMENT.md");
    const bootstrapGuide = await readRepositoryFile("PRODUCTION_MIGRATION_BOOTSTRAP.md");

    expect(deploymentGuide).toContain("npm run vercel-build");
    expect(deploymentGuide).toContain("npm run db:migrate:deploy");
    expect(deploymentGuide).toMatch(/never use `vercel env pull` or `vercel env run`/i);
    expect(deploymentGuide).toContain("direct, non-pooled connection");
    expect(bootstrapGuide).toContain("Hard STOP conditions");
    expect(bootstrapGuide).toContain("only then record that exact migration");
    expect(bootstrapGuide).toContain("npx prisma migrate resolve");
    expect(bootstrapGuide).toContain("npm run db:migrate:deploy");
  });
});
