"use client";

import { useSyncExternalStore } from "react";

const event = "anu-crm-navigation";
export type RecordRef = { entity: string; id: string };

function subscribe(listener: () => void) {
  window.addEventListener("popstate", listener);
  window.addEventListener(event, listener);
  return () => {
    window.removeEventListener("popstate", listener);
    window.removeEventListener(event, listener);
  };
}

export function useCrmUrl() {
  const search = useSyncExternalStore(subscribe, () => window.location.search, () => "");
  return new URLSearchParams(search);
}

function writeCrmUrl(changes: Record<string, string | null>, parents: string[] = []) {
  const url = new URL(window.location.href);
  for (const [key, value] of Object.entries(changes)) {
    if (value) url.searchParams.set(key, value);
    else url.searchParams.delete(key);
  }
  if (url.href === window.location.href) return;
  window.history.pushState({ ...window.history.state, crmRecordParents: parents }, "", url);
  window.dispatchEvent(new Event(event));
}

export function navigateModule(module: string) {
  writeCrmUrl({ module, setup: null, customObject: null, object: null, record: null, tab: null });
}

export function navigateSetup(section: string) {
  writeCrmUrl({ setup: section, customObject: null, object: null, record: null, tab: null });
}

export function openCustomObject(object: string) {
  writeCrmUrl({ module: "CRM Setup", setup: "Object Manager", customObject: object, object: null, record: null, tab: null });
}

function recordParents(): string[] {
  const parents = window.history.state?.crmRecordParents;
  return Array.isArray(parents) ? parents : [];
}

export function openCrmRecord({ entity, id }: RecordRef) {
  writeCrmUrl({ object: entity, record: id, tab: null }, [...recordParents(), window.location.search]);
}

export function navigateRecordTab(tab: string) {
  writeCrmUrl({ tab }, recordParents());
}

export function closeCrmRecord() {
  const parents = recordParents();
  const parent = parents.at(-1);
  if (typeof parent === "string") {
    const previous = new URLSearchParams(parent);
    writeCrmUrl({ object: previous.get("object"), record: previous.get("record"), tab: previous.get("tab") }, parents.slice(0, -1));
  } else {
    writeCrmUrl({ object: null, record: null, tab: null });
  }
}
