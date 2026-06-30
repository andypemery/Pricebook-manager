export const retentionConfig = {
  supportTickets: {
    closedTicketRetentionMonths: 12,
    behaviour: "delete-after-closed-retention",
    note: "Normal closed support tickets are removed 12 months after closure. Security issues, breach logs, audit logs and legal/commercial evidence are excluded."
  },
  featureRequests: {
    retentionYears: 3,
    behaviour: "retain-product-history-then-archive-or-remove",
    note: "Feature requests are retained for 3 years as customer/product history."
  }
};
