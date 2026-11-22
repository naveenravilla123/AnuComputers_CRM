import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validSession } from "@/lib/session";
import { validationEntities } from "@/lib/metadata-runtime";
import { parseValidationRules } from "@/lib/validation-configuration";

export const dynamic = "force-dynamic";
const prefix = "setup.validation.";
const format = "anu-crm-validation";
const fail = (error: string, status: number) => NextResponse.json({ error }, { status });

export async function GET(request: NextRequest) {
  if (!await validSession(request.cookies.get("anu_session")?.value)) return fail("Unauthorized", 401);
  try {
    const rows = await prisma.businessSetting.findMany({
      where: { key: { in: validationEntities.map(entity => prefix + entity) } },
      orderBy: { key: "asc" },
    });
    return NextResponse.json({
      format,
      version: 1,
      objects: Object.fromEntries(rows.map(row => [row.key.slice(prefix.length), row.value])),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return fail("Unable to export validation rules", 503);
  }
}

export async function POST(request: NextRequest) {
  if (!await validSession(request.cookies.get("anu_session")?.value)) return fail("Unauthorized", 401);
  if (request.headers.get("origin") !== request.nextUrl.origin) return fail("Invalid origin", 403);

  try {
    const body = await request.text();
    if (body.length > 150_000) return fail("Validation bundle is too large", 413);
    const bundle = JSON.parse(body);
    if (bundle?.format !== format || bundle.version !== 1 ||
        !bundle.objects || typeof bundle.objects !== "object" || Array.isArray(bundle.objects)) {
      return fail("Invalid validation bundle", 400);
    }

    const entries = Object.entries(bundle.objects);
    await prisma.$transaction(async tx => {
      const fields = await tx.customField.findMany({ where: { entity: "Customer" } });
      const rules = entries.map(([entity, value]) => ({
        entity,
        value: parseValidationRules(entity, value, fields.map(field => field.key)),
      }));
      for (const entry of rules) {
        const key = prefix + entry.entity;
        await tx.businessSetting.upsert({
          where: { key }, create: { key, value: entry.value }, update: { value: entry.value },
        });
      }
      await tx.auditLog.create({
        data: {
          action: "SETUP_VALIDATION_IMPORTED",
          entity: "CRMSetup",
          entityId: format,
          after: { objects: rules.map(rule => rule.entity) },
        },
      });
    }, { isolationLevel: "Serializable" });
    return NextResponse.json({ updated: entries.length });
  } catch (error) {
    if (error instanceof SyntaxError || (error instanceof Error && /^Invalid rules?$/.test(error.message))) {
      return fail("Bundle contains invalid rules or unknown fields", 400);
    }
    return fail("Unable to import validation rules. No changes were saved.", 409);
  }
}
