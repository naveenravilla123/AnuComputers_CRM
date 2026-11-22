import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validSession } from "@/lib/session";
import { normalizePermissions, staffRoles } from "@/lib/permissions";

export const dynamic = "force-dynamic";
const prefix = "setup.customProfile.";
const assignment = "setup.staffProfile.";
const fail = (error: string, status: number) => NextResponse.json({ error }, { status });
const signedIn = (request: NextRequest) => validSession(request.cookies.get("anu_session")?.value);
const validId = (id: unknown): id is string => typeof id === "string" && /^[a-z][a-z0-9-]{0,39}$/.test(id);

export async function GET(request: NextRequest) {
  if (!await signedIn(request)) return fail("Unauthorized", 401);
  try {
    const settings = await prisma.businessSetting.findMany({
      where: { OR: [{ key: { startsWith: prefix } }, { key: { startsWith: assignment } }] },
    });
    return NextResponse.json({
      profiles: settings.filter(row => row.key.startsWith(prefix)).map(row => ({
        id: row.key.slice(prefix.length), value: row.value,
      })),
      assignments: Object.fromEntries(settings.filter(row => row.key.startsWith(assignment))
        .map(row => [row.key.slice(assignment.length), row.value])),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return fail("Unable to load profiles", 503);
  }
}

export async function POST(request: NextRequest) {
  if (!await signedIn(request)) return fail("Unauthorized", 401);
  if (request.headers.get("origin") !== request.nextUrl.origin) return fail("Invalid origin", 403);
  try {
    const input = await request.json();
    await prisma.$transaction(async tx => {
      if (input.action === "save") {
        const { id, name, role } = input;
        if (!validId(id) || typeof name !== "string" || !name.trim() || name.length > 100 ||
            !staffRoles.some(value => value === role)) throw Error("Invalid profile");
        const key = prefix + id;
        const existing = await tx.businessSetting.findUnique({ where: { key } });
        const prior = existing?.value as { role?: string; fieldPermissions?: string[] } | undefined;
        if (prior && prior.role !== role) throw Error("A profile cannot change its base role");
        const source = "setup.profile." + role;
        const security = "setup.fieldSecurity.profile." + role;
        const rows = await tx.businessSetting.findMany({ where: { key: { in: [source, security] } } });
        const requested = input.permissions ?? rows.find(row => row.key === source)?.value ?? [];
        const permissions = normalizePermissions(requested);
        if (!Array.isArray(requested) || requested.some(item => !permissions.includes(item))) throw Error("Invalid permissions");
        const grants = rows.find(row => row.key === security)?.value;
        const fieldPermissions = prior?.fieldPermissions ?? (Array.isArray(grants) ? grants.filter(item => typeof item === "string") : []);
        const value = { name: name.trim(), role, permissions, fieldPermissions };
        await tx.businessSetting.upsert({ where: { key }, create: { key, value }, update: { value } });
        await tx.auditLog.create({ data: { action: "CUSTOM_PROFILE_SAVED", entity: "CRMSetup", entityId: id, after: value } });
        return;
      }
      if (input.action !== "assign" || typeof input.staffId !== "string") throw Error("Invalid assignment");
      const staff = await tx.staff.findUnique({ where: { id: input.staffId } });
      if (!staff?.active) throw Error("Active staff member required");
      const key = assignment + staff.id;
      if (input.profileId === null) {
        await tx.businessSetting.deleteMany({ where: { key } });
      } else {
        if (!validId(input.profileId)) throw Error("Invalid assignment");
        const row = await tx.businessSetting.findUnique({ where: { key: prefix + input.profileId } });
        const profile = row?.value as { role?: string } | undefined;
        if (profile?.role !== staff.role) throw Error("Profile must match the staff role");
        await tx.businessSetting.upsert({ where: { key }, create: { key, value: input.profileId }, update: { value: input.profileId } });
      }
      await tx.auditLog.create({ data: { action: "CUSTOM_PROFILE_ASSIGNED", entity: "Staff", entityId: staff.id,
        after: { profileId: input.profileId } } });
    }, { isolationLevel: "Serializable" });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const messages = ["Invalid profile", "Invalid permissions", "A profile cannot change its base role",
      "Invalid assignment", "Active staff member required", "Profile must match the staff role"];
    return fail(error instanceof Error && messages.includes(error.message) ? error.message : "Unable to save profile configuration", 409);
  }
}
