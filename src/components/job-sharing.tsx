"use client";

import { useState } from "react";

type Sharing = {
  ownerId: string | null;
  technicians: { id: string; name: string }[];
  staffIds: string[];
};

export default function JobSharing({ id }: { id: string }) {
  const [sharing, setSharing] = useState<Sharing | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function load() {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/setup/job-sharing?id=" + encodeURIComponent(id));
      const result = await response.json();
      if (!response.ok) throw Error(result.error);
      setSharing(result);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to load sharing");
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (!sharing) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/setup/job-sharing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, staffIds: sharing.staffIds }),
      });
      if (!response.ok) throw Error((await response.json()).error);
      setMessage("Sharing saved");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to save sharing");
    } finally {
      setBusy(false);
    }
  }

  return <details className="mt-3 rounded border p-3" onToggle={event => {
    if (event.currentTarget.open && !sharing && !busy) void load();
  }}>
    <summary>Share job card</summary>
    {message && <p role="status">{message}</p>}
    {busy && !sharing && <p>Loading sharing…</p>}
    {sharing && <>
      <p className="my-2 text-sm">Shared technicians can read fields granted by their profile or permission sets.</p>
      {sharing.technicians.filter(person => person.id !== sharing.ownerId).map(person =>
        <label className="block" key={person.id}>
          <input type="checkbox" className="mr-2" disabled={busy} checked={sharing.staffIds.includes(person.id)}
            onChange={event => {
              const checked = event.target.checked;
              setSharing(current => current && ({
                ...current,
                staffIds: checked ? [...current.staffIds, person.id]
                  : current.staffIds.filter(staffId => staffId !== person.id),
              }));
            }} />
          {person.name}
        </label>
      )}
      <button type="button" className="mt-2 rounded border px-3 py-1" disabled={busy} onClick={save}>
        Save sharing
      </button>
    </>}
  </details>;
}
