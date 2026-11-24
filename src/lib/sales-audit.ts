import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import type { RequestAccess } from "./request-access";

export function auditedSalesWrite<T>(
  access: Extract<RequestAccess, { allowed: true }>["access"],
  write: (tx: Prisma.TransactionClient) => Promise<T>,
  options?: { isolationLevel?: Prisma.TransactionIsolationLevel },
) {
  return prisma.$transaction(async tx => {
    const actor = access.kind === "staff"
      ? "staff:" + access.user.id
      : process.env.CRM_ADMIN_EMAIL?.trim().toLowerCase() || "Administrator";
    await tx.$queryRaw`SELECT set_config('anu.record_actor', ${actor}, true)`;
    return write(tx);
  }, options);
}
