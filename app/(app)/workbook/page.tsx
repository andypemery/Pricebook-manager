import { WorkbookImporter } from "@/components/data-mapper/workbook-importer";
import { requireUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";

export default async function WorkbookPage() {
  const actor = await requireUser();
  const canPrepareOutputProfiles = hasPermission(actor, "uploadFiles") && hasPermission(actor, "editRecords");
  return <WorkbookImporter canPrepareOutputProfiles={canPrepareOutputProfiles} />;
}
