import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validSession } from "@/lib/session";

import { customObjectStandardFields, customRecordAudit, parseObjectFields, validateObjectValues,
  validObjectKey as validKey, type ObjectField as Field } from "@/lib/custom-object-fields";

export const dynamic = "force-dynamic";

const definitionPrefix = "setup.customObject.";
const recordPrefix = "custom.record.";
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
      objects: definitions.map(row => ({ key: row.key.slice(definitionPrefix.length), definition: { ...(row.value as object), standardFields: customObjectStandardFields } })),
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
        const fields = parseObjectFields(input.fields ?? []);
        await tx.businessSetting.create({ data: { key: definitionKey, value: { name, lookup, fields, standardFields: [...customObjectStandardFields] } } });
        await tx.auditLog.create({ data: { action: "CUSTOM_OBJECT_CREATED", entity: object, entityId: object, actorId } });
        return { object };
      }

      if (input.action === "addField" && definition) {
        const config = definition.value as { name: string; lookup?: string | null; fields?: Field[] };
        const existing = config.fields ?? [];
        const fields = parseObjectFields([...existing, input.field], existing.length);
        const field = fields[fields.length - 1];
        if (field.required && await tx.businessSetting.count({
          where: { key: { startsWith: recordPrefix + object + "." } },
        })) throw Error("Add the field as optional because this object already has records");
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
      const values = validateObjectValues(config.fields ?? [], input.values ?? {});
      const lookupId = input.lookupId || null;
      if (lookupId !== null && (typeof lookupId !== "string" || !target || !await tx.businessSetting.findUnique({
        where: { key: recordPrefix + target + "." + lookupId },
      }))) throw Error("Lookup record not found");
      const prior = previous?.value as { createdBy?: string | null; createdAt?: string; owner?: string | null } | undefined;
      const timestamp = new Date().toISOString();
      const value = {
        name, lookupId, values,
        ...customRecordAudit(actorId, timestamp, prior),
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
      "Invalid record ID", "Record not found", "Lookup record not found", "Invalid field definition", "Invalid field values", "Field API name is reserved", "Unsupported field type", "An object can have up to 30 custom fields", "Picklist requires 1–100 options of up to 255 characters", "Add the field as optional because this object already has records"];
    return fail(error instanceof Error && (messages.includes(error.message) || /^(Invalid value:|Unknown field:)| is required$/.test(error.message)) ? error.message : "Unable to save custom object data", 409);
  }
}
