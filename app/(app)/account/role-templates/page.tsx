export const dynamic = "force-dynamic";
import { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { permissionKeys, permissionLabels, rolePresets } from "@/config/permissions.config";
import { updateRoleTemplateAction } from "@/lib/actions/admin.actions";
import { SubmitButton } from "@/components/submit-button";

const editableRoles: Array<{ role: UserRole; label: string; description: string }> = [
  { role: "VIEW_ONLY", label: "View Only", description: "Can view permitted information only." },
  { role: "SUPER_USER", label: "Super User", description: "Can manage operational records within permitted areas." },
  { role: "CUSTOMER_ADMIN", label: "Admin", description: "Can manage customer users and tenant settings within Axiom limits." }
];

function permissionMap(value: unknown, role: UserRole) {
  const defaults: Record<string, boolean> = {};
  for (const key of permissionKeys) defaults[key] = rolePresets[role].includes(key);
  if (value && typeof value === "object" && !Array.isArray(value)) return { ...defaults, ...(value as Record<string, boolean>) };
  return defaults;
}

export default async function RoleTemplatesPage() {
  const user = await requireUser();
  if (!hasPermission(user, "manageCustomerUsers")) return <section className="card"><h1>Role Templates</h1><p>You do not have permission to manage role templates.</p></section>;
  const templates = await prisma.roleTemplate.findMany({ where: { tenantId: user.tenantId } });
  return <><section className="hero"><h1>Role Templates</h1><p>The standard role names are locked, but Customer Admins can adjust the allowed customer-level permissions behind each role.</p></section>{editableRoles.map((item)=>{ const template = templates.find((t)=>t.role===item.role); const permissions = permissionMap(template?.permissions, item.role); return <section className="card" key={item.role}><h2>{item.label}</h2><p className="muted">{item.description}</p><form action={updateRoleTemplateAction as unknown as (formData: FormData) => void}><input type="hidden" name="role" value={item.role}/><div className="checkboxGrid">{permissionKeys.filter((key)=>key!=="manageAxiomControls").map((key)=><label className="checkboxLine" key={key}><input type="checkbox" name={key} defaultChecked={Boolean(permissions[key])}/><span>{permissionLabels[key]}</span></label>)}</div><SubmitButton>Save {item.label} template</SubmitButton></form></section>; })}</>;
}
