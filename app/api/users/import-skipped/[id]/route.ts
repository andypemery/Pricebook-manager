import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";

function csvEscape(value: string | number | null | undefined) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const batch = await prisma.userImportBatch.findFirst({
    where: { id, tenantId: user.tenantId },
    include: { rows: { where: { isValid: false }, orderBy: { rowNumber: "asc" } } }
  });
  if (!batch) return new Response("Not found", { status: 404 });
  const lines = [
    ["Row", "First name", "Surname", "Email", "Role", "Reason"].map(csvEscape).join(","),
    ...batch.rows.map((row) => [row.rowNumber, row.firstName, row.surname, row.email, row.roleLabel, row.error].map(csvEscape).join(","))
  ];
  return new Response(lines.join("\n"), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="skipped-users-${batch.id}.csv"`
    }
  });
}
