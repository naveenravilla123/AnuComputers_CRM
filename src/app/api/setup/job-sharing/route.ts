import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validSession } from "@/lib/session";

export const dynamic = "force-dynamic";
const prefix = "setup.jobShare.";
const fail = (error: string, status: number) => NextResponse.json({ error }, { status });
const signedIn = (request: NextRequest) => validSession(request.cookies.get("anu_session")?.value);

export async function GET(request: NextRequest) {
  if (!await signedIn(request)) return fail("Unauthorized", 401);
  const id = request.nextUrl.searchParams.get("id") ?? "";
  if (!id) return fail("Job card ID required", 400);
  try {
    const [job, technicians, sharing] = await Promise.all([
      prisma.jobCard.findUnique({ where: { id }, select: { id: true, technicianId: true } }),
      prisma.staff.findMany({
        where: { role: "TECHNICIAN", active: true },
        select: { id: true, name: true },
        orderBy: [{ name: "asc" }, { id: "asc" }],
      }),
      prisma.businessSetting.findUnique({ where: { key: prefix + id } }),
    ]);
    if (!job) return fail("Job card not found", 404);
    return NextResponse.json({
      ownerId: job.technicianId,
      technicians,
      staffIds: Array.isArray(sharing?.value)
        ? technicians.filter(person => (sharing.value as unknown[]).includes(person.id)).map(person => person.id)
        : [],
    }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return fail("Unable to load job sharing", 503);
  }
}

export async function POST(request: NextRequest) {
  if (!await signedIn(request)) return fail("Unauthorized", 401);
  if (request.headers.get("origin") !== request.nextUrl.origin) return fail("Invalid origin", 403);
  try {
    const { id, staffIds } = await request.json();
    if (typeof id !== "string" || !id || !Array.isArray(staffIds) ||
        staffIds.length > 100 || staffIds.some(staffId => typeof staffId !== "string")) {
      return fail("Invalid sharing configuration", 400);
    }
    await prisma.$transaction(async tx => {
      const job = await tx.jobCard.findUnique({ where: { id }, select: { technicianId: true } });
      if (!job) throw Error("Job card not found");
      const value = [...new Set<string>(staffIds)].filter(staffId => staffId !== job.technicianId);
      const active = await tx.staff.count({
        where: { id: { in: value }, role: "TECHNICIAN", active: true },
      });
      if (active !== value.length) throw Error("Only active technicians can receive access");
      const key = prefix + id;
      if (value.length) {
        await tx.businessSetting.upsert({ where: { key }, create: { key, value }, update: { value } });
      } else {
        await tx.businessSetting.deleteMany({ where: { key } });
      }
      await tx.auditLog.create({
        data: { action: "JOB_SHARING_UPDATED", entity: "JobCard", entityId: id, after: { staffIds: value } },
      });
    }, { isolationLevel: "Serializable" });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && ["Job card not found", "Only active technicians can receive access"].includes(error.message)) {
      return fail(error.message, 400);
    }
    return fail("Unable to save sharing", 409);
  }
}
