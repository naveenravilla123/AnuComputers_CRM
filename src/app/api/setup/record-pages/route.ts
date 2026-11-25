import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validSession } from "@/lib/session";
import { defaultRecordTabs, recordPageObjects, recordRelationships, type RecordTab } from "@/lib/record-pages";
import { setupRoles } from "@/lib/setup-metadata";

const prefix = "setup.recordPage.";
const signedIn = (request: NextRequest) => validSession(request.cookies.get("anu_session")?.value);

export async function GET(request: NextRequest) {
  if (!await signedIn(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const settings = await prisma.businessSetting.findMany({
    where: { OR: [{ key: { startsWith: prefix } }, { key: { startsWith: "setup.customProfile." } }] },
  });
  return NextResponse.json({
    profiles: settings.filter(row => row.key.startsWith("setup.customProfile.")).flatMap(row => {
      const data = row.value;
      return data && typeof data === "object" && !Array.isArray(data) && typeof data.name === "string" && typeof data.role === "string"
        ? [{ id: "custom." + row.key.slice("setup.customProfile.".length), name: data.name, role: data.role }] : [];
    }),
    configurations: Object.fromEntries(settings.filter(row => row.key.startsWith(prefix))
      .map(row => [row.key.slice(prefix.length), row.value])),
  });
}

export async function POST(request: NextRequest) {
  if (!await signedIn(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (request.headers.get("origin") !== request.nextUrl.origin) {
    return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  }
  try {
    const { entity, profile, tabs, reset } = await request.json();
    if (!recordPageObjects.includes(entity) || typeof profile !== "string") throw Error("Invalid object or profile");
    const customProfile = profile.startsWith("custom.") && await prisma.businessSetting.findUnique({
      where: { key: "setup.customProfile." + profile.slice(7) },
    });
    if (profile !== "default" && !setupRoles.includes(profile) && !customProfile) throw Error("Unknown profile");
    const allowed = recordRelationships(entity).map(relation => relation.key);
    const value: RecordTab[] = reset === true ? defaultRecordTabs(entity) : tabs;
    if (!Array.isArray(value) || value.length > 10) throw Error("Add up to ten tabs");
    const labels = new Set(["details"]);
    for (const tab of value) {
      if (!tab || typeof tab.label !== "string" || !tab.label.trim() || tab.label.trim().length > 40 ||
        !Array.isArray(tab.lists) || !tab.lists.length || new Set(tab.lists).size !== tab.lists.length ||
        tab.lists.some(key => !allowed.includes(key)) || labels.has(tab.label.trim().toLowerCase())) {
        throw Error("Use unique tab names and choose at least one supported related list per tab");
      }
      labels.add(tab.label.trim().toLowerCase());
    }
    const key = prefix + profile + "." + entity;
    const cleanTabs = value.map(tab => ({ label: tab.label.trim(), lists: tab.lists }));
    await prisma.$transaction(async tx => {
      if (reset === true) await tx.businessSetting.deleteMany({ where: { key } });
      else await tx.businessSetting.upsert({ where: { key }, create: { key, value: cleanTabs }, update: { value: cleanTabs } });
      await tx.auditLog.create({ data: { action: "SETUP_RECORD_PAGE", entity: "CRMSetup", entityId: key } });
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to save record page" }, { status: 400 });
  }
}
