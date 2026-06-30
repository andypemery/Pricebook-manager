import { SupportStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { retentionConfig } from "@/config/retention.config";

function monthsAgo(months: number) {
  const date = new Date();
  date.setMonth(date.getMonth() - months);
  return date;
}

function yearsAgo(years: number) {
  const date = new Date();
  date.setFullYear(date.getFullYear() - years);
  return date;
}

export async function runStandardRetentionCleanup() {
  const supportCutoff = monthsAgo(retentionConfig.supportTickets.closedTicketRetentionMonths);
  const featureCutoff = yearsAgo(retentionConfig.featureRequests.retentionYears);

  const supportResult = await prisma.supportTicket.deleteMany({
    where: {
      status: { in: [SupportStatus.CLOSED, SupportStatus.RESOLVED] },
      updatedAt: { lt: supportCutoff }
    }
  });

  const featureResult = await prisma.featureRequest.deleteMany({
    where: {
      updatedAt: { lt: featureCutoff }
    }
  });

  return {
    supportTicketsDeleted: supportResult.count,
    featureRequestsRemoved: featureResult.count
  };
}
