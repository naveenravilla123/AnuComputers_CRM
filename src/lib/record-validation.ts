import {validateStandardOverrides} from "./standard-field-overrides";
import type { Prisma } from "@prisma/client";
import { validateRules, validationEntities } from "./metadata-runtime";

type Entity = (typeof validationEntities)[number];

/** Run after persistence, within the caller's transaction, so rules see database defaults. */
export async function validateRecord(
  tx: Prisma.TransactionClient,
  entity: Entity,
  record: Record<string, unknown> & { id: string },
) {
  await validateStandardOverrides(tx,entity,record);
  const setting = await tx.businessSetting.findUnique({
    where: { key: "setup.validation." + entity },
  });
  if (!Array.isArray(setting?.value) || !setting.value.length) return record;

  const custom = await tx.businessSetting.findUnique({
    where: { key: "custom.values." + entity + "." + record.id },
  });
  const values = custom?.value;
  validateRules(setting.value, {
    ...(values && typeof values === "object" && !Array.isArray(values) ? values : {}),
    ...record,
  });
  return record;
}
