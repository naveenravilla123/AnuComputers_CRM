import type { Prisma } from "@prisma/client";
import { defaultLayout } from "./setup-metadata";

export async function effectiveLayout(
  db: Prisma.TransactionClient,
  entity: string,
  customKeys: string[],
  role?: string,
) {
  const assignment = role && await db.businessSetting.findUnique({
    where: { key: "setup.layoutAssignment." + role + "." + entity },
  });
  const assignedId = assignment && typeof assignment.value === "string" ? assignment.value : "default";
  const namedPrefix = "setup.namedLayout." + entity + ".";
  const legacyKey = "setup.layout." + entity;
  const settings = await db.businessSetting.findMany({
    where: { key: { in: [namedPrefix + assignedId, namedPrefix + "default", legacyKey] } },
  });

  for (const id of new Set([assignedId, "default"])) {
    const value = settings.find(row => row.key === namedPrefix + id)?.value;
    if (value && typeof value === "object" && !Array.isArray(value) && Array.isArray(value.sections)) {
      return value.sections;
    }
  }

  const base = defaultLayout(entity, customKeys).sections;
  const legacy = settings.find(row => row.key === legacyKey)?.value;
  return Array.isArray(legacy) ? [base[0], ...legacy] : base;
}
