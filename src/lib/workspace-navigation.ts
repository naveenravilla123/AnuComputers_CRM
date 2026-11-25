export const navigationGroups = ["Home", "Customers", "Sales", "Repairs", "Stock", "My Work"] as const;
export type NavigationGroup = typeof navigationGroups[number];
export type NavigationItem = { id: string; group: NavigationGroup; visible: boolean; label?: string };
export const navigationSetting = "setup.workspaceNavigation";

export const defaultNavigation: NavigationItem[] = [
  { id: "Dashboard", group: "Home", visible: true, label: "Home" },
  { id: "Customers", group: "Customers", visible: true },
  ...groupItems("Sales", ["POS Billing", "Quotations", "Enquiries", "Sales Orders", "Invoices", "Reports"]),
  ...groupItems("Repairs", ["Service Cases", "Job Cards", "Warranties", "After Sales", "Technicians", "Communications"]),
  ...groupItems("Stock", ["Inventory", "Products", "Spare Parts", "Suppliers", "Purchases"]),
  ...groupItems("My Work", ["My Jobs"]),
  { id: "Global Search", group: "Home", visible: false },
];

function groupItems(group: NavigationGroup, ids: string[]): NavigationItem[] {
  return ids.map(id => ({ id, group, visible: true }));
}

export function isStandaloneGroup(group: string, size: number) {
  return size === 1 && ["Home", "Customers", "My Work", "Setup"].includes(group);
}

export function parseNavigation(value: unknown, catalog = defaultNavigation): NavigationItem[] | null {
  if (!Array.isArray(value) || value.length > catalog.length) return null;
  const known = new Map(catalog.map(item => [item.id, item]));
  const items: NavigationItem[] = [];
  for (const item of value) {
    const entry = item && known.get(item.id);
    if (!entry || !known.delete(item.id) || !navigationGroups.includes(item.group) ||
        typeof item.visible !== "boolean") return null;
    items.push({ ...entry, group: item.group, visible: item.visible });
  }
  return [...items, ...catalog.filter(item => known.has(item.id))];
}

export function arrangeNavigation<T extends { id: string; group: string; label?: string }>(available: T[], config: NavigationItem[] | null) {
  const items = new Map(available.map(item => [item.id, item]));
  const arranged = (config ?? defaultNavigation).flatMap(placement => {
      const item = items.get(placement.id);
      return placement.visible && item ? [{ ...item, group: placement.group, ...(placement.label && { label: placement.label }) }] : [];
    });
  const groups = new Map<string, T[]>();
  for (const item of arranged) {
    const list = groups.get(item.group) ?? [];
    list.push(item);
    groups.set(item.group, list);
  }
  return [...groups].map(([group, entries]) => ({ group, entries }));
}
