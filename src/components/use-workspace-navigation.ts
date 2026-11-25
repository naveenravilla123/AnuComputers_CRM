"use client";

import { useEffect, useState } from "react";
import type { NavigationItem } from "@/lib/workspace-navigation";

export const workspaceNavigationChanged = "anu-workspace-navigation-changed";

export function useWorkspaceNavigation(enabled = true) {
  const [items, setItems] = useState<NavigationItem[] | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let controller: AbortController;
    function load() {
      controller?.abort();
      controller = new AbortController();
      const { signal } = controller;
      fetch("/api/workspace-navigation", { signal, cache: "no-store" }).then(async response => {
        if (!response.ok) return;
        const data = await response.json();
        if (!signal.aborted) setItems(data.items);
      }).catch(() => {});
    }
    load();
    window.addEventListener(workspaceNavigationChanged, load);
    return () => {
      controller?.abort();
      window.removeEventListener(workspaceNavigationChanged, load);
    };
  }, [enabled]);

  return items;
}
