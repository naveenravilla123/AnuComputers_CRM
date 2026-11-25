import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import type { RequestAccess } from "./request-access";

type AuditAccess = Extract<RequestAccess, { allowed: true }>["access"];

export async function setRecordAuditActor(tx: Prisma.TransactionClient, access: AuditAccess) {
  const actor = access.kind === "staff"
    ? "staff:" + access.user.id
    : process.env.CRM_ADMIN_EMAIL?.trim().toLowerCase() || "Administrator";
  await tx.$queryRaw`SELECT set_config('anu.record_actor', ${actor}, true)`;
}

export function auditedSalesWrite<T>(
  access: AuditAccess,
  write: (tx: Prisma.TransactionClient) => Promise<T>,
  options?: { isolationLevel?: Prisma.TransactionIsolationLevel },
) {
  return prisma.$transaction(async tx => {
    await setRecordAuditActor(tx, access);
    return write(tx);
  }, options);
}
