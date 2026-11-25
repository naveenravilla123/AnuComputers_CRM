import type { Prisma } from "@prisma/client";

export async function resolveRecordAudit(
  db: Prisma.TransactionClient,
  value: Prisma.JsonValue | undefined,
  readable: (field: string) => boolean = () => true,
) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const details = Object.fromEntries(Object.entries(value).filter(([field]) => readable(field)));
  const actorFields = ["createdBy", "lastModifiedBy", "owner"];
  const staffIds = actorFields.flatMap(field => {
    const actor = details[field];
    return typeof actor === "string" && actor.startsWith("staff:") ? [actor.slice(6)] : [];
  });
  if (!staffIds.length) return details;
  const users = await db.staff.findMany({
    where: { id: { in: staffIds } }, select: { id: true, name: true },
  });
  const names = new Map(users.map(user => [user.id, user.name]));
  for (const field of actorFields) {
    const actor = details[field];
    if (typeof actor === "string" && actor.startsWith("staff:")) {
      details[field] = names.get(actor.slice(6)) ?? actor.slice(6);
    }
  }
  return details;
}
