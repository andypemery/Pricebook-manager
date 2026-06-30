import type { ComponentType, SVGProps } from "react";
import type { User } from "@prisma/client";
import {
  BadgeHelp,
  Bell,
  Braces,
  ClipboardCheck,
  Columns3,
  DatabaseBackup,
  FileCog,
  FileQuestion,
  FileSpreadsheet,
  FileText,
  FolderKanban,
  Gauge,
  Image,
  LayoutDashboard,
  LifeBuoy,
  Mail,
  Palette,
  ScrollText,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  TableProperties,
  UserCog,
  UsersRound
} from "lucide-react";
import type { PermissionKey } from "@/config/permissions.config";
import { hasPermission } from "@/lib/permissions";

export type NavigationIcon = ComponentType<SVGProps<SVGSVGElement>>;

export type NavigationItem = {
  href: string;
  label: string;
  icon: NavigationIcon;
  scope: "all" | "permission" | "axiom";
  permission?: PermissionKey;
  permissionsAny?: PermissionKey[];
  description?: string;
  status?: string;
};

export type SettingsNavigationGroup = {
  label: "General Settings" | "Support & Security" | "GDPR Features";
  items: NavigationItem[];
};

export const navigationItems: NavigationItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, scope: "all" },
  { href: "/projects", label: "Projects", icon: FolderKanban, scope: "all" },
  { href: "/workbook", label: "Workbook", icon: FileSpreadsheet, scope: "all" },
  { href: "/mapping", label: "Mapping", icon: Columns3, scope: "all" },
  { href: "/validation", label: "Validation", icon: ClipboardCheck, scope: "all" },
  { href: "/comparison", label: "Comparison", icon: Braces, scope: "all" },
  { href: "/templates", label: "Templates", icon: FileCog, scope: "all" },
  { href: "/generate", label: "Generate", icon: Sparkles, scope: "all" },
  { href: "/sample-records", label: "Demo Records", icon: TableProperties, scope: "all" },
  { href: "/account", label: "Account", icon: UserCog, scope: "all" },
  { href: "/settings", label: "Settings", icon: Settings, scope: "all" }
];

export const settingsNavigationGroups: SettingsNavigationGroup[] = [
  {
    label: "General Settings",
    items: [
      { href: "/admin/users", label: "Users", icon: UsersRound, scope: "permission", permission: "manageCustomerUsers", description: "Invite users, review access and manage role-based permissions.", status: "Customer admin" },
      { href: "/admin/customer-settings", label: "Global Settings", icon: Settings, scope: "permission", permission: "manageCustomerSettings", description: "Manage customer-level app settings, password policy and customer messages.", status: "Customer admin" },
      { href: "/admin/branding", label: "Branding", icon: Image, scope: "permission", permission: "manageCustomerSettings", description: "Upload customer logos used in the app header and login screen.", status: "Default Axiom branding" },
      { href: "/account/email-settings", label: "Email Settings", icon: Mail, scope: "permission", permission: "manageCustomerSettings", description: "Review Axiom email notifications, customer provider connections and sending profiles.", status: "Customer admin" },
      { href: "/axiom-admin/diagnostics", label: "Diagnostics", icon: Gauge, scope: "axiom", description: "View safe deployment, provider and health-check information.", status: "Axiom Admin" },
      { href: "/admin/backup", label: "Backup Status", icon: DatabaseBackup, scope: "axiom", description: "Review database and file backup status without exposing recovery controls to customers.", status: "Axiom Admin" },
      { href: "/admin/audit", label: "Audit Log", icon: ScrollText, scope: "permission", permission: "viewAudit", description: "Search and review tenant-scoped audit activity.", status: "Restricted" }
    ]
  },
  {
    label: "Support & Security",
    items: [
      { href: "/support", label: "Support", icon: LifeBuoy, scope: "permission", permission: "raiseSupportTickets", description: "Raise support tickets, view updates, and track help requests.", status: "Available" },
      { href: "/feature-requests", label: "Feature Requests", icon: FileQuestion, scope: "permission", permissionsAny: ["createRecords", "manageCustomerSettings"], description: "Suggest improvements, request new features, and track requested changes.", status: "Available" },
      { href: "/security-issue", label: "Report Security Issue", icon: ShieldAlert, scope: "all", description: "Report a suspected security issue separately from normal support tickets.", status: "All users" }
    ]
  },
  {
    label: "GDPR Features",
    items: [
      { href: "/admin/files", label: "File Register", icon: FileText, scope: "permission", permission: "manageCustomerSettings", description: "Track uploaded file metadata, linked records, storage status, backup status and retention status.", status: "Metadata first" },
      { href: "/admin/data-rights", label: "Data Rights", icon: ShieldCheck, scope: "permission", permission: "manageDataRights", description: "Manage GDPR/data subject rights requests such as SARs, erasure, rectification and portability.", status: "GDPR" }
    ]
  }
];

export const accountNavigationItems: NavigationItem[] = [
  { href: "/account/appearance", label: "Appearance", icon: Palette, scope: "all" },
  { href: "/support", label: "Support", icon: BadgeHelp, scope: "all" },
  { href: "/security-issue", label: "Security Issue", icon: ShieldAlert, scope: "all" }
];

export function canShowNavigationItem(item: NavigationItem, user: Pick<User, "role" | "permissions">) {
  if (item.scope === "all") return true;
  if (item.scope === "axiom") return user.role === "AXIOM_ADMIN";
  if (item.permissionsAny) return item.permissionsAny.some((permission) => hasPermission(user, permission));
  return item.permission ? hasPermission(user, item.permission) : false;
}
