export const dynamic = "force-dynamic";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";

export default async function AccountPage() {
  const user = await requireUser();
  const tiles = [
    { href: "/account/appearance", title: "Appearance", body: "Choose dark, light or system mode.", show: true },
    { href: "/admin/users", title: "Users & Permissions", body: "Invite users, view their status and manage their access.", show: hasPermission(user, "manageCustomerUsers") },
    { href: "/account/role-templates", title: "Role Templates", body: "Set the permissions behind View Only, Super User and Admin.", show: hasPermission(user, "manageCustomerUsers") },
    { href: "/account/email-settings", title: "Email Settings", body: "Configure outbound email sending, test emails and provider fallback.", show: hasPermission(user, "manageCustomerSettings") },
    { href: "/support", title: "Support", body: "Raise a support request without including sensitive data unless needed.", show: true },
    { href: "/feature-requests", title: "Feature Requests", body: "Suggest changes or improvements for this app.", show: hasPermission(user, "createRecords") || hasPermission(user, "manageCustomerSettings") },
    { href: "/security-issue", title: "Report Security Issue", body: "Report a privacy, access or security concern separately from support.", show: true },
    { href: "/admin/data-rights", title: "Data Rights", body: "Manage SAR, erasure and data rights workflows for this tenant.", show: hasPermission(user, "manageDataRights") },
    { href: "/admin/files", title: "File Register", body: "Review file metadata and storage references for this tenant.", show: hasPermission(user, "manageCustomerSettings") },
    { href: "/admin/audit", title: "Audit Log", body: "View audit activity for your own tenant.", show: hasPermission(user, "viewAudit") },
    { href: "/admin/backup", title: "Backup Status", body: "Axiom-only backup and restore status.", show: user.role === "AXIOM_ADMIN" }
  ];
  return <><section className="hero"><h1>Account</h1><p>Access the account, support and administration areas available to your user rights.</p></section><section className="grid">{tiles.filter((tile)=>tile.show).map((tile)=><Link className="card tile" key={tile.href} href={tile.href}><h2>{tile.title}</h2><p className="muted">{tile.body}</p></Link>)}</section></>;
}
