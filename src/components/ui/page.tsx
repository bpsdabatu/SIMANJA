import * as React from "react";
import { Alert } from "@/components/ui/card";
import type { FlashParams } from "@/lib/flash";

export function PageHeader({
  title, description, actions, eyebrow,
}: { title: string; description?: string; actions?: React.ReactNode; eyebrow?: string }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow && <p className="mb-1 text-xs font-semibold uppercase tracking-[0.14em] text-gold-600">{eyebrow}</p>}
        <h1 className="text-2xl font-bold text-navy-900 sm:text-[1.7rem]">{title}</h1>
        {description && <p className="mt-1 max-w-3xl text-sm text-slate-600">{description}</p>}
      </div>
      {actions && <div className="no-print flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Flash({ ok, err }: FlashParams) {
  if (!ok && !err) return null;
  return (
    <div className="no-print space-y-2">
      {ok && <Alert tone="green">{ok}</Alert>}
      {err && <Alert>{err}</Alert>}
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="px-6 py-12 text-center">
      <p className="font-display text-base font-semibold text-navy-800">{title}</p>
      {children && <div className="mx-auto mt-1.5 max-w-md text-sm text-slate-600">{children}</div>}
    </div>
  );
}

export function TableWrap({ children }: { children: React.ReactNode }) {
  return <div className="overflow-x-auto">{children}</div>;
}
