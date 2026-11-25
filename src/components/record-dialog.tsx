"use client";

import type { FormEventHandler, ReactNode } from "react";
import { createPortal } from "react-dom";

export default function RecordDialog({ label, width = "max-w-3xl", onSubmit, children, actions }: {
  label: string;
  width?: string;
  onSubmit: FormEventHandler<HTMLFormElement>;
  children: ReactNode;
  actions: ReactNode;
}) {
  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/60 p-2 sm:p-4">
      <form role="dialog" aria-modal="true" aria-label={label} onSubmit={onSubmit}
        className={`crm-record-form flex max-h-full w-full min-w-0 flex-col overflow-hidden rounded-2xl bg-white shadow-xl ${width}`}>
        <div className="crm-dialog-content min-h-0 space-y-4 overflow-y-auto overscroll-contain p-4 sm:p-6">{children}</div>
        <footer className="flex shrink-0 flex-wrap justify-end gap-3 border-t border-slate-200 bg-slate-50 p-3 sm:px-6">
          {actions}
        </footer>
      </form>
    </div>,
    document.body,
  );
}
