import { UserRole } from "@prisma/client";

export const permissionKeys = [
  "viewRecords",
  "createRecords",
  "editRecords",
  "archiveRecords",
  "uploadFiles",
  "exportReports",
  "manageCustomerUsers",
  "manageCustomerSettings",
  "manageDataRights",
  "viewAudit",
  "raiseSupportTickets",
  "submitFeatureRequests",
  "reportSecurityIssues",
  "manageAxiomControls"
] as const;

export type PermissionKey = (typeof permissionKeys)[number];

export const permissionLabels: Record<PermissionKey, string> = {
  viewRecords: "View records",
  createRecords: "Create records",
  editRecords: "Edit records",
  archiveRecords: "Archive records",
  uploadFiles: "Upload files",
  exportReports: "Export data",
  manageCustomerUsers: "Manage users",
  manageCustomerSettings: "Manage settings",
  manageDataRights: "Manage data rights",
  viewAudit: "View audit log",
  raiseSupportTickets: "Raise support tickets",
  submitFeatureRequests: "Submit feature requests",
  reportSecurityIssues: "Report security issues",
  manageAxiomControls: "Manage Axiom controls"
};

export const importPermissionColumnMap: Record<string, PermissionKey> = {
  "View records": "viewRecords",
  "Create records": "createRecords",
  "Edit records": "editRecords",
  "Archive records": "archiveRecords",
  "Upload files": "uploadFiles",
  "Export data": "exportReports",
  "Manage users": "manageCustomerUsers",
  "Manage settings": "manageCustomerSettings",
  "Manage data rights": "manageDataRights",
  "View audit log": "viewAudit",
  "Raise support tickets": "raiseSupportTickets",
  "Submit feature requests": "submitFeatureRequests",
  "Report security issues": "reportSecurityIssues"
};

export const rolePresets: Record<UserRole, PermissionKey[]> = {
  AXIOM_ADMIN: [...permissionKeys],
  CUSTOMER_ADMIN: [
    "viewRecords",
    "createRecords",
    "editRecords",
    "archiveRecords",
    "uploadFiles",
    "exportReports",
    "manageCustomerUsers",
    "manageCustomerSettings",
    "manageDataRights",
    "viewAudit",
    "raiseSupportTickets",
    "submitFeatureRequests",
    "reportSecurityIssues"
  ],
  SUPER_USER: ["viewRecords", "createRecords", "editRecords", "uploadFiles", "raiseSupportTickets", "submitFeatureRequests", "reportSecurityIssues"],
  VIEW_ONLY: ["viewRecords", "raiseSupportTickets", "reportSecurityIssues"]
};
