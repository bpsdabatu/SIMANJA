"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CalendarClock, ChevronDown, Database, FileBarChart, Files, KeyRound, LayoutDashboard, LogOut, Menu,
  PanelLeftClose, PanelLeftOpen, Presentation, Receipt, ScrollText, TableProperties, Users, Wallet, X,
  type LucideIcon,
} from "lucide-react";
import { logoutAction } from "@/app/actions";
import { DigitalClock, GreetingBanner, resetGreeting } from "@/components/clock-greeting";
import { LogoBadge } from "@/components/brand/logo";
import type { IconName, NavItem } from "@/lib/nav";
import { APP_NAME } from "@/lib/brand";
import { cn } from "@/lib/utils";

const ICONS: Record<IconName, LucideIcon> = {
  "layout-dashboard": LayoutDashboard, wallet: Wallet, "calendar-clock": CalendarClock, receipt: Receipt,
  "table-properties": TableProperties, "file-bar-chart": FileBarChart, files: Files, database: Database,
  users: Users, "scroll-text": ScrollText, presentation: Presentation,
};

interface Props {
  user: { fullName: string; username: string; roleLabels: string[] };
  context: { year: number; stageLabel: string };
  items: NavItem[];
  children: React.ReactNode;
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join("") || "U";
}

export function AppShell({ user, context, items, children }: Props) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [drawer, setDrawer] = useState(false);

  // Ingat status sidebar per browser (kenyamanan saja; aman bila storage gagal)
  useEffect(() => {
    try { setCollapsed(localStorage.getItem("simaspraja.sidebar") === "1"); } catch { /* abaikan */ }
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
      try { localStorage.setItem("simaspraja.sidebar", c ? "0" : "1"); } catch { /* abaikan */ }
      return !c;
    });
  };

  const groups = items.reduce<Record<string, NavItem[]>>((acc, it) => {
    (acc[it.group] ??= []).push(it);
    return acc;
  }, {});

  const nav = (compact: boolean) => (
    <nav aria-label="Navigasi utama" className="flex-1 overflow-y-auto px-3 py-4">
      {Object.entries(groups).map(([group, list]) => (
        <div key={group} className="mb-4">
          {!compact && (
            <p className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-navy-300/70">{group}</p>
          )}
          {compact && <div className="mx-3 mb-1.5 border-t border-white/10" />}
          <ul className="space-y-0.5">
            {list.map((item) => {
              const Icon = ICONS[item.icon];
              const active = pathname === item.href || pathname.startsWith(item.href + "/");
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    title={compact ? item.label : undefined}
                    className={cn(
                      "group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                      active ? "bg-white/10 text-white" : "text-navy-100/90 hover:bg-white/5 hover:text-white",
                    )}
                  >
                    {active && <span className="absolute inset-y-1.5 left-0 w-[3px] rounded-r bg-gold-400" aria-hidden />}
                    <Icon size={18} aria-hidden className={cn("shrink-0", active && "text-gold-300")} />
                    {!compact && <span className="truncate">{item.label}</span>}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );

  const brand = (compact: boolean) => (
    <Link href="/dashboard" className="flex h-16 shrink-0 items-center gap-3 border-b border-white/10 px-4" aria-label={`${APP_NAME} - Dasbor`}>
      <LogoBadge size={30} />
      {!compact && (
        <span className="leading-tight">
          <span className="block font-display text-[15px] font-bold tracking-wide text-white">{APP_NAME}</span>
          <span className="block text-[10px] text-gold-300">Monev Anggaran & Kinerja</span>
        </span>
      )}
    </Link>
  );

  const sidebarBg = "bg-gradient-to-b from-navy-950 via-navy-900 to-navy-800";

  return (
    <div className="flex min-h-screen">
      {/* Sidebar desktop */}
      <aside className={cn("hidden shrink-0 flex-col transition-[width] duration-200 lg:flex", sidebarBg, collapsed ? "w-[72px]" : "w-[17rem]")}>
        <div className="sticky top-0 flex h-screen flex-col">
          {brand(collapsed)}
          {nav(collapsed)}
          <button
            onClick={toggle}
            aria-label={collapsed ? "Perluas sidebar" : "Ciutkan sidebar"}
            className="flex h-12 items-center gap-3 border-t border-white/10 px-6 text-sm text-navy-200 hover:text-white"
          >
            {collapsed ? <PanelLeftOpen size={18} aria-hidden /> : <PanelLeftClose size={18} aria-hidden />}
            {!collapsed && <span>Ciutkan</span>}
          </button>
        </div>
      </aside>

      {/* Drawer mobile */}
      {drawer && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu navigasi">
          <div className="absolute inset-0 bg-navy-950/60 backdrop-blur-sm" onClick={() => setDrawer(false)} />
          <aside className={cn("relative flex h-full w-72 max-w-[85%] flex-col", sidebarBg)}>
            <button
              onClick={() => setDrawer(false)}
              aria-label="Tutup menu"
              className="absolute right-2 top-3.5 flex h-9 w-9 items-center justify-center text-navy-200 hover:text-white"
            >
              <X size={20} aria-hidden />
            </button>
            {brand(false)}
            {nav(false)}
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header
          data-noprint
          className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-slate-200/80 bg-white/90 px-4 backdrop-blur sm:px-6"
        >
          <button
            onClick={() => setDrawer(true)}
            aria-label="Buka menu"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-700 hover:bg-slate-100 lg:hidden"
          >
            <Menu size={20} aria-hidden />
          </button>

          <div className="flex min-w-0 flex-1 items-center gap-2 text-sm">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-gold-50 px-3 py-1 font-semibold text-gold-700 ring-1 ring-gold-200" title="Konteks anggaran aktif">
              TA {context.year} · {context.stageLabel}
            </span>
            <Link href="/pilih-konteks" className="hidden text-slate-500 underline-offset-2 hover:text-navy-700 hover:underline sm:inline">
              Ganti
            </Link>
          </div>

          <DigitalClock />

          <details className="group relative">
            <summary className="flex cursor-pointer list-none items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-slate-100 [&::-webkit-details-marker]:hidden">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-navy-700 text-xs font-bold text-white">
                {initials(user.fullName)}
              </span>
              <span className="hidden text-left leading-tight sm:block">
                <span className="block max-w-[11rem] truncate text-sm font-semibold text-slate-800">{user.fullName}</span>
                <span className="block text-xs text-slate-500">{user.roleLabels.join(", ") || "Tanpa peran"}</span>
              </span>
              <ChevronDown size={15} aria-hidden className="text-slate-500 transition-transform group-open:rotate-180" />
            </summary>
            <div className="absolute right-0 mt-2 w-64 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lift">
              <div className="border-b border-slate-100 px-4 py-3">
                <p className="truncate text-sm font-semibold text-slate-900">{user.fullName}</p>
                <p className="text-xs text-slate-500">@{user.username}</p>
              </div>
              <Link href="/ganti-password" className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50">
                <KeyRound size={16} aria-hidden /> Ganti kata sandi
              </Link>
              <form action={logoutAction} onSubmit={resetGreeting}>
                <button className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm text-red-700 hover:bg-red-50">
                  <LogOut size={16} aria-hidden /> Keluar
                </button>
              </form>
            </div>
          </details>
        </header>

        <GreetingBanner name={user.fullName} />
        <main id="konten" className="flex-1 px-4 py-6 sm:px-8 sm:py-8">{children}</main>

        <footer data-noprint className="border-t border-slate-200 bg-white px-6 py-4 text-xs text-slate-500">
          © {new Date().getFullYear()} {APP_NAME}. Akses dan seluruh aktivitas tercatat dalam log audit.
        </footer>
      </div>
    </div>
  );
}
