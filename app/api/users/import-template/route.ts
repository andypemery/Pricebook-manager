import { createUserImportTemplate } from "@/lib/simple-xlsx";

export async function GET() {
  const file = createUserImportTemplate();
  return new Response(file, {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": 'attachment; filename="axiom-user-import-template.xlsx"'
    }
  });
}
