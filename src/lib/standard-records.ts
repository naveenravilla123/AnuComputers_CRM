import { Prisma } from "@prisma/client";
import { objectManagerCatalog } from "./object-manager-catalog";
import type { prisma } from "./prisma";

type Database = Prisma.TransactionClient | typeof prisma;
export const auditPrefix = "record.audit.";
export function isStandardObject(entity: string) {
  return Object.prototype.hasOwnProperty.call(objectManagerCatalog, entity);
}

export async function standardRecords(db: Database, entity: string, id: string | null, query: string, offset: number) {
  if (!isStandardObject(entity)) throw Error("Unknown standard object");
  const table = Prisma.raw('"' + entity + '"');
  // Select only cataloged scalar columns. Relationship entries are metadata, so
  // their absence from the database row is expected.
  const records = await db.$queryRaw<{ record: Record<string, unknown> }[]>`
    SELECT to_jsonb(entry) AS record
    FROM ${table} AS entry
    WHERE ${id ? Prisma.sql`entry.id = ${id}` : Prisma.sql`
      strpos(lower(coalesce(to_jsonb(entry)->>'name', to_jsonb(entry)->>'number', entry.id)), ${query.toLowerCase()}) > 0
      OR ${query} = ''
    `}
    ORDER BY entry.id
    LIMIT ${id ? 1 : 51}
    OFFSET ${id ? 0 : offset}
  `;
  const rows = records.slice(0, 50).map(({ record }) => Object.fromEntries(
    objectManagerCatalog[entity].filter(field => Object.prototype.hasOwnProperty.call(record, field.key))
      .map(field => [field.key, record[field.key]]),
  ));
  return { rows, hasMore: records.length > 50 };
}

export async function enableRecordAudit(db: Prisma.TransactionClient) {
  // All audited tables share a string primary key. Store audit metadata
  // separately so legacy deployments and Prisma clients keep working.
  await db.$executeRawUnsafe(`
    CREATE OR REPLACE FUNCTION public.anu_track_standard_record()
    RETURNS trigger LANGUAGE plpgsql AS $audit$
    DECLARE
      metadata_key text;
      stamp text := to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
      actor text := nullif(current_setting('anu.record_actor', true), '');
    BEGIN
      IF TG_OP = 'DELETE' THEN
        DELETE FROM public."BusinessSetting"
        WHERE "key" = 'record.audit.' || TG_TABLE_NAME || '.' || OLD.id;
        RETURN OLD;
      END IF;
      IF TG_OP = 'UPDATE' AND to_jsonb(NEW) = to_jsonb(OLD) THEN RETURN NEW; END IF;
      metadata_key := 'record.audit.' || TG_TABLE_NAME || '.' || NEW.id;
      INSERT INTO public."BusinessSetting" ("id", "key", "value") VALUES (
        metadata_key, metadata_key, jsonb_build_object(
          'createdAt', coalesce(to_jsonb(NEW)->>'createdAt', CASE WHEN TG_OP = 'INSERT' THEN stamp END),
          'createdBy', CASE WHEN TG_OP = 'INSERT' THEN actor END,
          'owner', CASE WHEN TG_OP = 'INSERT' THEN actor END,
          'lastModifiedBy', actor, 'updatedAt', stamp
        )
      )
      ON CONFLICT ("key") DO UPDATE SET "value" = public."BusinessSetting"."value" ||
        jsonb_build_object('lastModifiedBy', actor, 'updatedAt', stamp);
      RETURN NEW;
    END
    $audit$
  `);
  for (const entity of Object.keys(objectManagerCatalog)) {
    // Object names come exclusively from the source-controlled catalog.
    await db.$executeRawUnsafe(`DROP TRIGGER IF EXISTS anu_record_audit ON public."${entity}"`);
    await db.$executeRawUnsafe(`CREATE TRIGGER anu_record_audit
      AFTER INSERT OR UPDATE OR DELETE ON public."${entity}"
      FOR EACH ROW EXECUTE FUNCTION public.anu_track_standard_record()`);
  }
}
