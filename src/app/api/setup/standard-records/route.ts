import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validSession } from "@/lib/session";
import { auditPrefix, enableRecordAudit, isStandardObject, standardRecords } from "@/lib/standard-records";

export const dynamic = "force-dynamic";
const fail = (error: string, status: number) => NextResponse.json({ error }, { status });
const signedIn = (request: NextRequest) => validSession(request.cookies.get("anu_session")?.value);
const trackingKey = "setup.standardRecordAudit.v2";

export async function GET(request: NextRequest) {
  if (!await signedIn(request)) return fail("Unauthorized", 401);
  const params = request.nextUrl.searchParams;
  const entity = params.get("entity") ?? "";
  const id = params.get("id");
  const query = (params.get("q") ?? "").trim().slice(0, 100);
  const offset = Math.max(0, Math.min(50000, Math.trunc(Number(params.get("offset")) || 0)));
  if (!isStandardObject(entity)) return fail("Unknown standard object", 400);

  try {
    const [{ rows, hasMore }, tracking] = await Promise.all([
      standardRecords(prisma, entity, id, query, offset),
      prisma.businessSetting.findUnique({ where: { key: trackingKey } }),
    ]);
    if (id && !rows.length) return fail("Record not found", 404);
    const audit = id ? await prisma.businessSetting.findUnique({
      where: { key: auditPrefix + entity + "." + id },
    }) : null;
    const customValues = id ? await prisma.businessSetting.findUnique({
      where: { key: "custom.values." + entity + "." + id },
    }) : null;
    const auditValue = audit?.value;
    const details = auditValue && typeof auditValue === "object" && !Array.isArray(auditValue)
      ? { ...auditValue } : null;
    if (details) {
      const actorFields = ["createdBy", "lastModifiedBy", "owner"];
      const staffIds = actorFields.flatMap(key => {
        const value = details[key];
        return typeof value === "string" && value.startsWith("staff:") ? [value.slice(6)] : [];
      });
      if (staffIds.length) {
        const staff = await prisma.staff.findMany({
          where: { id: { in: staffIds } }, select: { id: true, name: true },
        });
        for (const key of actorFields) {
          const value = details[key];
          if (typeof value === "string" && value.startsWith("staff:")) {
            details[key] = staff.find(user => user.id === value.slice(6))?.name || value.slice(6);
          }
        }
      }
    }
    return NextResponse.json({ rows, hasMore, tracking: !!tracking, audit: details,
      customValues: customValues?.value ?? {} }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return fail("Unable to load records", 503);
  }
}

export async function POST(request: NextRequest) {
  if (!await signedIn(request)) return fail("Unauthorized", 401);
  if (request.headers.get("origin") !== request.nextUrl.origin) return fail("Invalid origin", 403);
  try {
    const input = await request.json();
    if (input.action !== "enableAudit") return fail("Unknown action", 400);
    await prisma.$transaction(async tx => {
      // Serialize concurrent enable requests across application instances.
      await tx.$queryRaw`SELECT 1 AS locked FROM (SELECT pg_advisory_xact_lock(8203191)) AS held`;
      if (await tx.businessSetting.findUnique({ where: { key: trackingKey } })) return;
      await tx.$executeRawUnsafe("SET LOCAL lock_timeout = '3s'");
      await enableRecordAudit(tx);
      await tx.businessSetting.create({ data: { key: trackingKey, value: true } });
    }, { timeout: 15000 });
    return NextResponse.json({ ok: true });
  } catch {
    return fail("Unable to enable audit tracking. Check database permissions and retry.", 503);
  }
}
