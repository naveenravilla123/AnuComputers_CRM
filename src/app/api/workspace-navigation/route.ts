import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorizeRequest } from "@/lib/request-access";
import { validSession } from "@/lib/session";
import { defaultNavigation, navigationSetting, parseNavigation, type NavigationItem } from "@/lib/workspace-navigation";

import { objectManagerCatalog } from "@/lib/object-manager-catalog";
import { fieldLabel } from "@/lib/setup-metadata";

export const dynamic = "force-dynamic";
const error = (message: string, status: number) => NextResponse.json({ error: message }, { status });

async function navigationCatalog() {
  const prefix = "setup.customObject.";
  const objects = await prisma.businessSetting.findMany({ where: { key: { startsWith: prefix } } });
  const shortcuts: NavigationItem[] = objects.flatMap(row => {
    const definition = row.value;
    return definition && typeof definition === "object" && !Array.isArray(definition) && typeof definition.name === "string"
      ? [{ id: "custom:" + row.key.slice(prefix.length), label: definition.name, group: "My Work", visible: false }]
      : [];
  });
  const standardShortcuts: NavigationItem[] = Object.keys(objectManagerCatalog).map(entity => ({
    id: "standard:" + entity, label: fieldLabel(entity) + " records", group: "My Work", visible: false,
  }));
  return [...defaultNavigation, ...standardShortcuts, ...shortcuts];
}

export async function GET(request: NextRequest) {
  try {
    const auth = await authorizeRequest(request);
    if (!auth.allowed) return error("Unauthorized", 401);
    const [setting, catalog] = await Promise.all([
      prisma.businessSetting.findUnique({ where: { key: navigationSetting } }), navigationCatalog(),
    ]);
    const current = setting?.value;
    const keys = new Set(catalog.map(item => item.id));
    const surviving = Array.isArray(current) ? current.filter(item => item && typeof item === "object" &&
      !Array.isArray(item) && typeof item.id === "string" && keys.has(item.id)) : current;
    const items = parseNavigation(surviving, catalog);
    return NextResponse.json({
      items: auth.access.kind === "admin" ? items : items?.filter(item => !item.id.includes(":")) ?? null,
      ...(auth.access.kind === "admin" && { defaults: catalog }),
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return error("Unable to load workspace navigation", 503);
  }
}

export async function PUT(request: NextRequest) {
  if (!await validSession(request.cookies.get("anu_session")?.value)) return error("Unauthorized", 401);
  if (request.headers.get("origin") !== request.nextUrl.origin) return error("Invalid origin", 403);
  try {
    const items = parseNavigation((await request.json()).items, await navigationCatalog());
    if (!items) return error("Invalid navigation layout", 400);
    await prisma.$transaction(async tx => {
      await tx.businessSetting.upsert({
        where: { key: navigationSetting }, create: { key: navigationSetting, value: items }, update: { value: items },
      });
      await tx.auditLog.create({ data: {
        action: "SETUP_WORKSPACE_NAVIGATION", entity: "CRMSetup", entityId: navigationSetting, after: items,
      } });
    });
    return NextResponse.json({ items });
  } catch {
    return error("Unable to save workspace navigation", 503);
  }
}
