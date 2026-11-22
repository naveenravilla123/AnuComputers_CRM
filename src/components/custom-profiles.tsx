"use client";

import { useEffect, useState } from "react";
import { setupRoles, standardCatalog } from "@/lib/setup-metadata";
import PermissionMatrix from "./permission-matrix";

type Profile = { id: string; value: { name: string; role: string; permissions: string[] } };
const permissions = Object.keys(standardCatalog).flatMap(entity =>
  ["READ", "CREATE", "EDIT", "DELETE"].map(action => entity + ":" + action));
const field = "block w-full rounded border p-2";
const button = "rounded bg-indigo-600 px-3 py-2 text-white disabled:opacity-50";

export default function CustomProfiles({ staff }: { staff: { id: string; name: string; role: string; active: boolean }[] }) {
  const [data, setData] = useState<{ profiles: Profile[]; assignments: Record<string, string> }>({ profiles: [], assignments: {} });
  const [draft, setDraft] = useState({ id: "", name: "", role: setupRoles[0] });
  const [grants, setGrants] = useState<string[] | null>(null);
  const [editing, setEditing] = useState(false);
  const [personId, setPersonId] = useState("");
  const [profileId, setProfileId] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const person = staff.find(user => user.id === personId);

  async function load(signal?: AbortSignal) {
    const response = await fetch("/api/setup/custom-profiles", { signal });
    if (!response.ok) throw Error((await response.json()).error);
    const result = await response.json();
    if (!signal?.aborted) setData(result);
  }
  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal).catch(error => {
      if (!controller.signal.aborted) setMessage(error.message);
    });
    return () => controller.abort();
  }, []);

  async function save(payload: object) {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/setup/custom-profiles", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
      });
      if (!response.ok) throw Error((await response.json()).error);
      await load();
      setMessage("Saved");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to save");
    } finally {
      setBusy(false);
    }
  }

  return <section className="space-y-4 rounded-xl border bg-white p-4">
    <h3 className="font-semibold">Custom profiles</h3>
    {message && <p role="status">{message}</p>}
    <label>Profile <select className={field} disabled={busy} value={editing ? draft.id : ""} onChange={event => {
      const profile = data.profiles.find(profile => profile.id === event.target.value);
      setEditing(!!profile);
      setDraft(profile ? { id: profile.id, name: profile.value.name, role: profile.value.role }
        : { id: "", name: "", role: setupRoles[0] });
      setGrants(profile?.value.permissions ?? null);
    }}>
      <option value="">Clone a role profile</option>
      {data.profiles.map(profile => <option value={profile.id} key={profile.id}>{profile.value.name}</option>)}
    </select></label>
    <form className="space-y-2" onSubmit={event => {
      event.preventDefault();
      void save({ action: "save", ...draft, permissions: grants });
    }}>
      <label>Profile key <input className={field} required readOnly={editing} value={draft.id} pattern="[a-z][a-z0-9-]{0,39}"
        onChange={event => setDraft({ ...draft, id: event.target.value })} /></label>
      <label>Profile name <input className={field} required maxLength={100} value={draft.name}
        onChange={event => setDraft({ ...draft, name: event.target.value })} /></label>
      <label>Base role <select className={field} disabled={editing} value={draft.role}
        onChange={event => setDraft({ ...draft, role: event.target.value })}>
        {setupRoles.map(role => <option key={role}>{role}</option>)}
      </select></label>
      {editing && <PermissionMatrix catalog={permissions} value={grants ?? []} onChange={setGrants} />}
      <button className={button} disabled={busy}>{editing ? "Save profile" : "Clone profile"}</button>
    </form>
    <form className="space-y-2 border-t pt-4" onSubmit={event => {
      event.preventDefault();
      void save({ action: "assign", staffId: personId, profileId: profileId || null });
    }}>
      <label>Staff member <select required className={field} value={personId} onChange={event => {
        setPersonId(event.target.value);
        setProfileId(data.assignments[event.target.value] ?? "");
      }}>
        <option value="">Select staff</option>
        {staff.filter(user => user.active && setupRoles.includes(user.role)).map(user =>
          <option key={user.id} value={user.id}>{user.name}</option>)}
      </select></label>
      <label>Assigned profile <select className={field} value={profileId} onChange={event => setProfileId(event.target.value)}>
        <option value="">Default role profile</option>
        {data.profiles.filter(profile => profile.value.role === person?.role).map(profile =>
          <option key={profile.id} value={profile.id}>{profile.value.name}</option>)}
      </select></label>
      <button className={button} disabled={busy || !person}>Save assignment</button>
    </form>
  </section>;
}
