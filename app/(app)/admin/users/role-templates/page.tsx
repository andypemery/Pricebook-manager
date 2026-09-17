export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { updateRoleTemplateAction } from "@/lib/actions/admin.actions";
import { RoleTemplateGrid } from "@/components/role-template-grid";

export default async function RoleTemplatesPage() {
  const user = await requireUser();
  if (!hasPermission(user, "manageCustomerUsers")) {
    return <section className="card"><h1>Role Templates</h1><p>You do not have permission to manage role templates.</p></section>;
  }

  const templates = await prisma.roleTemplate.findMany({ where: { tenantId: user.tenantId } });

  return (
    <>
      <section className="hero">
        <p className="breadcrumb">Settings › Users › Role Templates</p>
        <h1>Role Templates</h1>
        <p>The standard role identities are locked, but Customer Admins can adjust the allowed customer-level permissions behind each role.</p>
      </section>
      <RoleTemplateGrid
        templates={templates}
        updateAction={updateRoleTemplateAction as unknown as (formData: FormData) => void}
      />
    </>
  );
}
