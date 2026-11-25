"use client";

import { useEffect, useState } from "react";
import { defaultRecordTabs, recordPageObjects, recordRelationships, type RecordTab } from "@/lib/record-pages";
import { fieldLabel, setupRoles } from "@/lib/setup-metadata";

type Settings = { profiles: { id: string; name: string; role: string }[]; configurations: Record<string, RecordTab[]> };

export default function RecordPageSetup() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [entity, setEntity] = useState("Customer");
  const [profile, setProfile] = useState("default");
  const [draft, setDraft] = useState<RecordTab[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const key = profile + "." + entity;
  const role = settings?.profiles.find(item => item.id === profile)?.role;
  const inherited = role ? settings?.configurations[role + "." + entity] : undefined;
  const tabs = draft ?? settings?.configurations[key] ?? inherited ??
    settings?.configurations["default." + entity] ?? defaultRecordTabs(entity);
  const relations = recordRelationships(entity);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/setup/record-pages", { signal: controller.signal, cache: "no-store" })
      .then(async response => {
        if (!response.ok) throw Error("Unable to load record pages");
        setSettings(await response.json());
      })
      .catch(error => { if (!controller.signal.aborted) setMessage(error.message); });
    return () => controller.abort();
  }, []);

  function update(index: number, tab: RecordTab) {
    setDraft(tabs.map((item, position) => position === index ? tab : item));
  }

  async function save(reset = false) {
    if (!settings || busy) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/setup/record-pages", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entity, profile, tabs, reset }),
      });
      if (!response.ok) throw Error((await response.json()).error);
      const configurations = { ...settings.configurations };
      if (reset) delete configurations[key];
      else configurations[key] = tabs.map(tab => ({ ...tab, label: tab.label.trim() }));
      setSettings({ ...settings, configurations });
      setDraft(null);
      setMessage("Record page saved");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to save record page");
    } finally {
      setBusy(false);
    }
  }

  return <section className="space-y-4 rounded-xl border bg-white p-4">
    <fieldset disabled={!settings || busy} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">Object<select className="mt-1 block w-full rounded border p-2" value={entity}
          onChange={event => { setEntity(event.target.value); setDraft(null); setMessage(""); }}>
          {recordPageObjects.map(object => <option key={object} value={object}>{fieldLabel(object)}</option>)}
        </select></label>
        <label className="text-sm">Profile<select className="mt-1 block w-full rounded border p-2" value={profile}
          onChange={event => { setProfile(event.target.value); setDraft(null); setMessage(""); }}>
          <option value="default">Default</option>
          {setupRoles.map(role => <option key={role}>{role}</option>)}
          {settings?.profiles.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select></label>
      </div>
      <p className="text-sm text-slate-600">Details uses the assigned Page Layout. Related tabs show only records and fields the viewer can read.</p>
      {!relations.length && <p className="text-sm text-slate-600">This object has no supported related lists.</p>}
      {tabs.map((tab, index) => <fieldset key={index} className="space-y-3 rounded-lg border p-3">
        <legend className="px-2 text-sm font-semibold">{tab.label || "New tab"}</legend>
        <label className="block text-sm">Tab name<input className="ml-2 rounded border p-2" value={tab.label} maxLength={40}
          onChange={event => update(index, { ...tab, label: event.target.value })}/></label>
        <div className="flex flex-wrap gap-3">{relations.map(relation => <label key={relation.key} className="text-sm">
          <input type="checkbox" className="mr-1" checked={tab.lists.includes(relation.key)}
            onChange={event => update(index, { ...tab, lists: relations.map(item => item.key).filter(key =>
              key === relation.key ? event.target.checked : tab.lists.includes(key)) })}/>{relation.label}
        </label>)}</div>
        <div className="flex flex-wrap gap-3 text-sm">
          <button type="button" disabled={!index} onClick={() => {
            const next = [...tabs];
            [next[index - 1], next[index]] = [next[index], next[index - 1]];
            setDraft(next);
          }}>Move up</button>
          <button type="button" className="text-red-700" onClick={() => setDraft(tabs.filter((_, position) => position !== index))}>Remove tab</button>
        </div>
      </fieldset>)}
      <div className="flex flex-wrap gap-3">
        <button type="button" className="rounded border px-3 py-2" disabled={!relations.length || tabs.length >= 10}
          onClick={() => setDraft([...tabs, { label: "", lists: [] }])}>Add tab</button>
        <button type="button" className="rounded bg-indigo-600 px-3 py-2 text-white" disabled={!draft}
          onClick={() => save()}>Save record page</button>
        {settings?.configurations[key] && <button type="button" className="rounded border px-3 py-2"
          onClick={() => save(true)}>Use inherited tabs</button>}
      </div>
    </fieldset>
    {message && <p role="status">{message}</p>}
  </section>;
}
