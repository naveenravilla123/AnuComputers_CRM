"use client";

import { useEffect, useState } from "react";
import { defaultNavigation, navigationGroups, type NavigationItem } from "@/lib/workspace-navigation";
import { workspaceNavigationChanged } from "./use-workspace-navigation";

export default function WorkspaceNavigationSetup() {
  const [items, setItems] = useState<NavigationItem[] | null>(null);
  const [defaults, setDefaults] = useState(defaultNavigation);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/workspace-navigation", { signal: controller.signal, cache: "no-store" }).then(async response => {
      if (!response.ok) throw Error("Unable to load workspace navigation");
      const result = await response.json();
      if (!controller.signal.aborted) {
        setDefaults(result.defaults ?? defaultNavigation);
        setItems(result.items ?? result.defaults ?? defaultNavigation);
      }
    }).catch(error => { if (!controller.signal.aborted) setMessage(error.message); });
    return () => controller.abort();
  }, []);

  function update(next: NavigationItem[]) {
    setItems(next);
    setDirty(true);
    setMessage("");
  }

  async function save() {
    if (!items || busy) return;
    setBusy(true);
    try {
      const response = await fetch("/api/workspace-navigation", {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ items }),
      });
      const result = await response.json();
      if (!response.ok) throw Error(result.error);
      setItems(result.items);
      setDirty(false);
      setMessage("Workspace navigation saved");
      window.dispatchEvent(new Event(workspaceNavigationChanged));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to save workspace navigation");
    } finally {
      setBusy(false);
    }
  }

  return <section className="space-y-4 rounded-xl border bg-white p-4">
    <p className="text-sm text-slate-600">Show or remove sidebar shortcuts, choose their group, and set their order. Standard and custom object record shortcuts open in the admin workspace.</p>
    <fieldset disabled={!items || busy} className="space-y-4">
      <label className="block text-sm font-medium">Find modules and objects<input type="search" className="mt-1 block w-full max-w-sm rounded border px-3 py-2" value={search} onChange={event => setSearch(event.target.value)}/></label>
      <ul className="divide-y rounded-lg border">{items?.map((item, index) => (item.label ?? item.id).toLowerCase().includes(search.trim().toLowerCase()) && <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 px-3 py-2">
        <label className="flex min-w-44 items-center gap-2 text-sm font-medium">
          <input type="checkbox" aria-label={"Show " + (item.label ?? item.id)} checked={item.visible}
            onChange={event => update(items.map(row => row.id === item.id ? { ...row, visible: event.target.checked } : row))}/>
          {item.label ?? item.id}<span className="text-xs font-normal text-slate-500">{item.visible ? "Shown" : "Hidden"}</span>
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <select aria-label={(item.label ?? item.id) + " placement"} value={item.group} className="rounded border px-2 py-1 text-sm"
            onChange={event => update(items.map(row => row.id === item.id ? { ...row, group: event.target.value as NavigationItem["group"] } : row))}>
            {navigationGroups.map(group => <option key={group}>{group}</option>)}
          </select>
          {([-1, 1] as const).map(direction => <button type="button" key={direction}
            aria-label={`Move ${item.label ?? item.id} ${direction < 0 ? "up" : "down"}`}
            className="rounded border px-2 py-1 text-sm disabled:opacity-30"
            title={search.trim() ? "Clear search to reorder shortcuts" : undefined}
            disabled={!!search.trim() || index + direction < 0 || index + direction >= items.length}
            onClick={() => {
              const reordered = [...items];
              [reordered[index], reordered[index + direction]] = [reordered[index + direction], item];
              update(reordered);
            }}>{direction < 0 ? "↑" : "↓"}</button>)}
        </div>
      </li>)}</ul>
      <div className="flex gap-3">
        <button type="button" className="rounded bg-indigo-600 px-4 py-2 text-white disabled:opacity-50" disabled={!dirty}
          onClick={() => void save()}>Save navigation</button>
        <button type="button" className="rounded border px-4 py-2" onClick={() => update(defaults)}>Restore defaults</button>
      </div>
    </fieldset>
    {message && <p role="status">{message}</p>}
  </section>;
}
