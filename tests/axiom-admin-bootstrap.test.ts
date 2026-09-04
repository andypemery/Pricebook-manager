import { UserRole, type PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { describe, expect, it, vi } from "vitest";
import { ensureSeededAxiomAdmin } from "../lib/axiom-admin-bootstrap";

type BootstrapClient = Pick<PrismaClient, "user">;

describe("seeded Axiom Admin bootstrap", () => {
  it("creates a new admin with the configured password and no forced password change", async () => {
    const create = vi.fn().mockResolvedValue({});
    const client = {
      user: {
        findUnique: vi.fn().mockResolvedValue(null),
        create,
        update: vi.fn()
      }
    } as unknown as BootstrapClient;

    const result = await ensureSeededAxiomAdmin(client, {
      email: "admin@example.com",
      seedPassword: "ConfiguredPass123",
      tenantId: "tenant-1"
    });

    const createData = create.mock.calls[0]?.[0].data;
    expect(result).toBe("created");
    expect(createData).toMatchObject({
      email: "admin@example.com",
      tenantId: "tenant-1",
      role: UserRole.AXIOM_ADMIN,
      forcePasswordChange: false
    });
    expect(await bcrypt.compare("ConfiguredPass123", createData.passwordHash)).toBe(true);
  });

  it("does not overwrite an existing password or change a deliberate password-change state", async () => {
    const existingPasswordHash = await bcrypt.hash("ExistingPass456", 4);
    const update = vi.fn().mockResolvedValue({});
    const client = {
      user: {
        findUnique: vi.fn().mockResolvedValue({
          tenantId: "tenant-1",
          passwordHash: existingPasswordHash,
          forcePasswordChange: true
        }),
        create: vi.fn(),
        update
      }
    } as unknown as BootstrapClient;

    const result = await ensureSeededAxiomAdmin(client, {
      email: "admin@example.com",
      seedPassword: "ConfiguredPass123",
      tenantId: "tenant-1"
    });

    const updateData = update.mock.calls[0]?.[0].data;
    expect(result).toBe("confirmed");
    expect(updateData).not.toHaveProperty("passwordHash");
    expect(updateData).not.toHaveProperty("forcePasswordChange");
  });

  it("is idempotent and only clears a bootstrap flag when the seed password still matches", async () => {
    const passwordHash = await bcrypt.hash("ConfiguredPass123", 4);
    let record = {
      tenantId: "tenant-1" as string | null,
      passwordHash,
      forcePasswordChange: true
    };
    const create = vi.fn();
    const update = vi.fn(async ({ data }) => {
      record = { ...record, ...data };
      return record;
    });
    const client = {
      user: {
        findUnique: vi.fn(async () => record),
        create,
        update
      }
    } as unknown as BootstrapClient;

    const options = {
      email: "admin@example.com",
      seedPassword: "ConfiguredPass123",
      tenantId: "tenant-1"
    };
    expect(await ensureSeededAxiomAdmin(client, options)).toBe("recovered");
    expect(await ensureSeededAxiomAdmin(client, options)).toBe("confirmed");

    expect(create).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledTimes(2);
    expect(record.passwordHash).toBe(passwordHash);
    expect(record.forcePasswordChange).toBe(false);
    expect(update.mock.calls[1]?.[0].data).not.toHaveProperty("forcePasswordChange");
  });
});
