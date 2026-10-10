export type IconName =
  | "layout-dashboard" | "wallet" | "calendar-clock" | "receipt" | "table-properties"
  | "file-bar-chart" | "files" | "database" | "users" | "scroll-text";

export interface NavItem {
  label: string;
  href: string;
  icon: IconName;
  permission: string;
  /** Fase pengembangan modul; undefined = sudah tersedia. */
  phase?: number;
}

/** Hanya modul berstatus tersedia yang dapat diklik; sisanya ditandai fase rilis (tanpa data tiruan). */
export const NAV_ITEMS: NavItem[] = [
  { label: "Dasbor", href: "/dashboard", icon: "layout-dashboard", permission: "dashboard.view" },
  { label: "Input Anggaran", href: "/anggaran", icon: "wallet", permission: "budget.view", phase: 2 },
  { label: "Anggaran Kas", href: "/anggaran-kas", icon: "calendar-clock", permission: "cashplan.view", phase: 3 },
  { label: "Realisasi Belanja", href: "/realisasi", icon: "receipt", permission: "realization.view", phase: 4 },
  { label: "Rekapitulasi", href: "/rekapitulasi", icon: "table-properties", permission: "recap.view", phase: 5 },
  { label: "Laporan Realisasi Anggaran", href: "/lra", icon: "file-bar-chart", permission: "lra.view", phase: 6 },
  { label: "Dokumen Pengadaan", href: "/dokumen", icon: "files", permission: "document.view", phase: 7 },
  { label: "Data Master", href: "/master", icon: "database", permission: "master.view", phase: 2 },
  { label: "Pengguna & Peran", href: "/pengguna", icon: "users", permission: "users.manage", phase: 2 },
  { label: "Log Audit", href: "/audit", icon: "scroll-text", permission: "audit.view", phase: 2 },
];

export const ROLE_LABEL: Record<string, string> = {
  admin: "Admin",
  ppk: "PPK",
  pptk: "PPTK",
  ppbj: "PPBJ",
};
