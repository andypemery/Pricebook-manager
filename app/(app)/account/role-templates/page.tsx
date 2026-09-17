import { redirect } from "next/navigation";

export default function LegacyRoleTemplatesPage() {
  redirect("/admin/users/role-templates");
}
