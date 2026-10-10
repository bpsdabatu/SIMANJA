"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CalendarClock, Database, FileBarChart, Files, Landmark, LayoutDashboard, LogOut, Menu,
  PanelLeftClose, PanelLeftOpen, Receipt, ScrollText, TableProperties, Users, Wallet, X,
  type LucideIcon,
} from "lucide-react";
import { logoutAction } from "@/app/actions";
import type { IconName, NavItem } from "@/lib/nav";
import { cn } from "@/lib/utils";

const ICONS: Record<IconName, LucideIcon> = {
  "layout-dashboard": LayoutDashboard, wallet: Wallet, "calendar-clock": CalendarClock, receipt: Receipt,
  "table-properties": TableProperties, "file-bar-chart": FileBarChart, files: Files, database: Database,
  users: Users, "scroll-text": ScrollText,
};

interface Props {
  user: { fullName: string; username: string; roleLabels: string[] };
  context: { year: number; stageLabel: string };
  items: NavItem[];
  children: React.ReactNode;
}

export function AppShell({ user, context, items, children }: Props) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [drawer, setDrawer] = useState(false);

  // Ingat status sidebar per pengguna-browser (kenyamanan saja; aman bila storage gagal)
  useEffect(() => {
    try { setCollapsed(localStorage.getItem("simanja.sidebar") === "1"); } catch { /* abaikan */ }
  }, []);
  useEffect(() => { setDrawer(false); }, [pathname]);
  useEffect(() => {
    if (!drawer) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setDrawer(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawer]);

  const toggle = () => {
    setCollapsed((c) => {
      try { localStorage.setItem("simanja.sidebar", c ? "0" : "1"); } catch { /* abaikan */ }
      return !c;
    });
  };

  const nav = (compact: boolean) => (
    <nav aria-label="Navigasi utama" className="flex-1 space-y-0.5 overflow-y-auto px-2 py-3">
      {items.map((item) => {
        const Icon = ICONS[item.icon];
        const active = pathname === item.href || pathname.startsWith(item.href + "/");
        const base = "flex items-center gap-3 rounded-md px-3 py-2 text-sm";
        if (item.phase) {
          return (
            <div key={item.href} aria-disabled="true" title={`Tersedia pada Fase ${item.phase}`}
              className={cn(base, "cursor-not-allowed text-navy-200/60")}>
              <Icon size={18} aria-hidden className="shrink-0" />
              {!compact && (
                <>
                  <span className="flex-1 truncate">{item.label}</span>
                  <span className="rounded bg-white/10 px-1.5 text-[10px] font-medium text-navy-200">Fase {item.phase}</span>
                </>
              )}
            </div>
          );
        }
        return (
          <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined}
            title={compact ? item.label : undefined}
            className={cn(base, active ? "bg-white/10 text-white" : "text-navy-100 hover:bg-white/5 hover:text-white")}>
            <Icon size={18} aria-hidden className="shrink-0" />
            {!compact && <span className="truncate">{item.label}</span>}
          </Link>
        );
      })}
    </nav>
  );

  const brand = (compact: boolean) => (
    <div className="flex h-14 shrink-0 items-center gap-2.5 border-b border-white/10 px-4">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-teal-600 text-white">
        <Landmark size={17} aria-hidden />
      </span>
      {!compact && <span className="font-semibold tracking-wide text-white">SIMANJA</span>}
    </div>
  );

  return (
    <div className="flex min-h-screen">
      {/* Sidebar desktop */}
      <aside className={cn("hidden shrink-0 flex-col bg-navy-900 transition-[width] lg:flex", collapsed ? "w-16" : "w-64")}>
        {brand(collapsed)}
        {nav(collapsed)}
        <button onClick={toggle} aria-label={collapsed ? "Perluas sidebar" : "Ciutkan sidebar"}
          className="flex h-11 items-center gap-3 border-t border-white/10 px-5 text-sm text-navy-200 hover:text-white">
          {collapsed ? <PanelLeftOpen size={18} aria-hidden /> : <PanelLeftClose size={18} aria-hidden />}
          {!collapsed && <span>Ciutkan</span>}
        </button>
      </aside>

      {/* Drawer mobile */}
      {drawer && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu navigasi">
          <div className="absolute inset-0 bg-slate-900/50" onClick={() => setDrawer(false)} />
          <aside className="relative flex h-full w-72 max-w-[85%] flex-col bg-navy-900">
            <button onClick={() => setDrawer(false)} aria-label="Tutup menu"
              className="absolute right-2 top-2.5 flex h-9 w-9 items-center justify-center text-navy-200 hover:text-white">
              <X size={20} aria-hidden />
            </button>
            {brand(false)}
            {nav(false)}
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header data-noprint className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-slate-200 bg-white px-4">
          <button onClick={() => setDrawer(true)} aria-label="Buka menu"
            className="flex h-9 w-9 items-center justify-center rounded-md text-slate-700 hover:bg-slate-100 lg:hidden">
            <Menu size={20} aria-hidden />
          </button>
          <div className="flex min-w-0 flex-1 items-center gap-2 text-sm">
            <span className="rounded-md bg-teal-50 px-2.5 py-1 font-medium text-teal-700" title="Konteks anggaran aktif">
              TA {context.year} · {context.stageLabel}
            </span>
            <Link href="/pilih-konteks" className="hidden text-slate-500 underline-offset-2 hover:text-slate-800 hover:underline sm:inline">
              Ganti
            </Link>
          </div>
          <div className="hidden text-right leading-tight sm:block">
            <p className="text-sm font-medium text-slate-800">{user.fullName}</p>
            <p className="text-xs text-slate-500">{user.roleLabels.join(", ") || "Tanpa peran"} · @{user.username}</p>
          </div>
          <form action={logoutAction}>
            <button aria-label="Keluar" title="Keluar"
              className="flex h-9 items-center gap-2 rounded-md px-2.5 text-sm text-slate-600 hover:bg-slate-100">
              <LogOut size={17} aria-hidden /> <span className="hidden sm:inline">Keluar</span>
            </button>
          </form>
        </header>

        <main id="konten" className="flex-1 px-4 py-6 sm:px-6">{children}</main>
      </div>
    </div>
  );
}
