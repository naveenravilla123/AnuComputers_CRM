import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validSession } from "@/lib/session";

export const dynamic = "force-dynamic";

const definitionPrefix = "setup.customObject.";
const recordPrefix = "custom.record.";
const validKey = (value: unknown): value is string =>
  typeof value === "string" && /^[a-z][a-z0-9_]{0,39}$/.test(value);
type Field = { key: string; label: string; type: "text" | "number" | "checkbox" };
function parseFields(input: unknown): Field[] {
  if (!Array.isArray(input) || input.length > 30) throw Error("Invalid fields");
  const keys = new Set<string>();
  return input.map(field => {
    if (!field || !validKey(field.key) || keys.has(field.key) ||
        typeof field.label !== "string" || !field.label.trim() || field.label.length > 100 ||
        !["text", "number", "checkbox"].includes(field.type)) throw Error("Invalid fields");
    keys.add(field.key);
    return { key: field.key, label: field.label.trim(), type: field.type };
  });
}

const fail = (error: string, status: number) => NextResponse.json({ error }, { status });
const signedIn = (request: NextRequest) => validSession(request.cookies.get("anu_session")?.value);

export async function GET(request: NextRequest) {
  if (!await signedIn(request)) return fail("Unauthorized", 401);
  try {
    const object = request.nextUrl.searchParams.get("object");
    if (object !== null && !validKey(object)) return fail("Invalid object key", 400);
    const [definitions, records] = await Promise.all([
      prisma.businessSetting.findMany({ where: { key: { startsWith: definitionPrefix } }, orderBy: { key: "asc" } }),
      object ? prisma.businessSetting.findMany({
        where: { key: { startsWith: recordPrefix + object + "." } },
        orderBy: { key: "asc" }, take: 200,
      }) : [],
    ]);
    return NextResponse.json({
      objects: definitions.map(row => ({ key: row.key.slice(definitionPrefix.length), definition: row.value })),
      records: records.map(row => ({ id: row.key.slice(recordPrefix.length + (object?.length ?? 0) + 1), record: row.value })),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return fail("Unable to load custom objects", 503);
  }
}

export async function POST(request: NextRequest) {
  if (!await signedIn(request)) return fail("Unauthorized", 401);
  if (request.headers.get("origin") !== request.nextUrl.origin) return fail("Invalid origin", 403);
  try {
    const input = await request.json();
    if (!validKey(input?.object) || typeof input.name !== "string" ||
        !input.name.trim() || input.name.length > 100) return fail("A valid key and name are required", 400);

    const object = input.object;
    const name = input.name.trim();
    const definitionKey = definitionPrefix + object;
    const actorId = process.env.CRM_ADMIN_EMAIL?.trim().toLowerCase() || null;

    const result = await prisma.$transaction(async tx => {
      const definition = await tx.businessSetting.findUnique({ where: { key: definitionKey } });
      if (input.action === "define") {
        if (definition) throw Error("Object key already exists");
        const lookup = input.lookup || null;
        if (lookup !== null && (!validKey(lookup) || !await tx.businessSetting.findUnique({
          where: { key: definitionPrefix + lookup },
        }))) throw Error("Unknown lookup object");
        const fields = parseFields(input.fields ?? []);
        await tx.businessSetting.create({ data: { key: definitionKey, value: { name, lookup, fields } } });
        await tx.auditLog.create({ data: { action: "CUSTOM_OBJECT_CREATED", entity: object, entityId: object, actorId } });
        return { object };
      }

      if (input.action === "addField" && definition) {
        const config = definition.value as { name: string; lookup?: string | null; fields?: Field[] };
        const fields = parseFields([...(config.fields ?? []), input.field]);
        const field = fields[fields.length - 1];
        if (["name", "owner", "created_by", "last_modified_by", "created_at", "updated_at", "lookup_id"].includes(field.key)) {
          throw Error("Invalid fields");
        }
        await tx.businessSetting.update({
          where: { key: definitionKey },
          data: { value: { ...config, fields } },
        });
        await tx.auditLog.create({ data: { action: "CUSTOM_OBJECT_FIELD_ADDED", entity: object,
          entityId: object, actorId, after: { field: field.key } } });
        return { field: field.key };
      }

      if (input.action !== "save" || !definition) throw Error("Unknown custom object or action");
      if (input.id !== undefined && (typeof input.id !== "string" || !/^[a-f0-9-]{36}$/.test(input.id))) {
        throw Error("Invalid record ID");
      }
      const id = input.id ?? crypto.randomUUID();
      const key = recordPrefix + object + "." + id;
      const previous = input.id ? await tx.businessSetting.findUnique({ where: { key } }) : null;
      if (input.id && !previous) throw Error("Record not found");
      const config = definition.value as { lookup?: string; fields?: Field[] };
      const target = config.lookup;
      const values: Record<string, string | number | boolean> = Object.create(null);
      const submitted = input.values ?? {};
      if (!submitted || typeof submitted !== "object" || Array.isArray(submitted)) throw Error("Invalid field values");
      for (const field of config.fields ?? []) {
        const value = Object.prototype.hasOwnProperty.call(submitted, field.key) ? submitted[field.key] : undefined;
        if (value === undefined || value === "") continue;
        if ((field.type === "text" && (typeof value !== "string" || value.length > 5000)) ||
            (field.type === "number" && (typeof value !== "number" || !Number.isFinite(value))) ||
            (field.type === "checkbox" && typeof value !== "boolean")) throw Error("Invalid field values");
        values[field.key] = value;
      }
      const lookupId = input.lookupId || null;
      if (lookupId !== null && (typeof lookupId !== "string" || !target || !await tx.businessSetting.findUnique({
        where: { key: recordPrefix + target + "." + lookupId },
      }))) throw Error("Lookup record not found");
      const prior = previous?.value as { createdBy?: string | null; createdAt?: string; owner?: string | null } | undefined;
      const timestamp = new Date().toISOString();
      const value = {
        name, lookupId, values,
        createdBy: prior ? prior.createdBy ?? null : actorId,
        createdAt: prior?.createdAt ?? timestamp,
        owner: prior ? prior.owner ?? null : actorId,
        lastModifiedBy: actorId,
        updatedAt: timestamp,
      };
      await tx.businessSetting.upsert({ where: { key }, create: { key, value }, update: { value } });
      await tx.auditLog.create({ data: {
        action: previous ? "CUSTOM_RECORD_UPDATED" : "CUSTOM_RECORD_CREATED",
        entity: object, entityId: id, actorId,
        before: previous ? { record: previous.value } : undefined,
        after: value,
      } });
      return { id, record: value };
    }, { isolationLevel: "Serializable" });
    return NextResponse.json(result);
  } catch (error) {
    const messages = ["Object key already exists", "Unknown lookup object", "Unknown custom object or action",
      "Invalid record ID", "Record not found", "Lookup record not found", "Invalid fields", "Invalid field values"];
    return fail(error instanceof Error && messages.includes(error.message) ? error.message : "Unable to save custom object data", 409);
  }
}
