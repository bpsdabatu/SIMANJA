"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CornerDownLeft, Search } from "lucide-react";
import type { NavItem } from "@/lib/nav";
import { cn } from "@/lib/utils";

/** Palet menu: Ctrl/⌘+K untuk melompat cepat ke menu mana pun. Hanya memuat menu yang diizinkan bagi pengguna. */
export function CommandPalette({ items, open, onClose }: { items: NavItem[]; open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    return t ? items.filter((i) => `${i.label} ${i.hint} ${i.group}`.toLowerCase().includes(t)) : items;
  }, [q, items]);

  useEffect(() => { if (open) { setQ(""); setActive(0); setTimeout(() => input.current?.focus(), 0); } }, [open]);
  useEffect(() => { setActive(0); }, [q]);
  if (!open) return null;

  const go = (href: string) => { onClose(); router.push(href); };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") { e.preventDefault(); onClose(); }
    else if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(list.length - 1, a + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
    else if (e.key === "Enter" && list[active]) { e.preventDefault(); go(list[active]!.href); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-[12vh]" role="dialog" aria-modal="true" aria-label="Cari menu" onKeyDown={onKey}>
      <div className="absolute inset-0 bg-navy-950/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-lift">
        <div className="flex items-center gap-3 border-b border-slate-100 px-4">
          <Search size={18} aria-hidden className="text-slate-400" />
          <input ref={input} value={q} onChange={(e) => setQ(e.target.value)} role="combobox" aria-expanded="true" aria-controls="palette-list" aria-activedescendant={list[active] ? `pal-${active}` : undefined}
            placeholder="Cari menu… (mis. realisasi, kas, master)" className="h-14 w-full bg-transparent text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none" />
          <kbd className="hidden rounded border border-slate-200 px-1.5 py-0.5 text-[10px] text-slate-500 sm:block">Esc</kbd>
        </div>
        <ul id="palette-list" role="listbox" className="max-h-80 overflow-y-auto p-2">
          {list.length === 0 && <li className="px-3 py-6 text-center text-sm text-slate-500">Tidak ada menu yang cocok.</li>}
          {list.map((i, idx) => (
            <li key={i.href} id={`pal-${idx}`} role="option" aria-selected={idx === active}
              onMouseEnter={() => setActive(idx)} onClick={() => go(i.href)}
              className={cn("flex cursor-pointer items-center justify-between gap-3 rounded-lg px-3 py-2.5", idx === active ? "bg-navy-50" : "")}>
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-slate-900">{i.label}</span>
                <span className="block truncate text-xs text-slate-500">{i.group} · {i.hint}</span>
              </span>
              {idx === active && <CornerDownLeft size={14} aria-hidden className="shrink-0 text-slate-400" />}
            </li>
          ))}
        </ul>
        <p className="border-t border-slate-100 bg-slate-50 px-4 py-2 text-[11px] text-slate-500">↑ ↓ untuk memilih · Enter untuk membuka · Ctrl/⌘ + K membuka palet ini</p>
      </div>
    </div>
  );
}
