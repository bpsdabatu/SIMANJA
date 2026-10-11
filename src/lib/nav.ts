export type IconName =
  | "layout-dashboard" | "wallet" | "calendar-clock" | "receipt" | "table-properties"
  | "file-bar-chart" | "files" | "database" | "users" | "scroll-text" | "presentation";

export interface NavItem {
  label: string;
  href: string;
  icon: IconName;
  permission: string;
  group: "Utama" | "Perencanaan & Pelaksanaan" | "Pelaporan" | "Pengadaan" | "Administrasi";
}

/** Seluruh menu aktif. Tampil hanya bila pengguna memiliki izin (kenyamanan UI; RLS tetap penentu akses). */
export const NAV_ITEMS: NavItem[] = [
  { label: "Dasbor", href: "/dashboard", icon: "layout-dashboard", permission: "dashboard.view", group: "Utama" },
  { label: "Input Anggaran", href: "/anggaran", icon: "wallet", permission: "budget.view", group: "Perencanaan & Pelaksanaan" },
  { label: "Anggaran Kas", href: "/anggaran-kas", icon: "calendar-clock", permission: "cashplan.view", group: "Perencanaan & Pelaksanaan" },
  { label: "Realisasi Belanja", href: "/realisasi", icon: "receipt", permission: "realization.view", group: "Perencanaan & Pelaksanaan" },
  { label: "Rekapitulasi", href: "/rekapitulasi", icon: "table-properties", permission: "recap.view", group: "Pelaporan" },
  { label: "Laporan Realisasi Anggaran", href: "/lra", icon: "file-bar-chart", permission: "lra.view", group: "Pelaporan" },
  { label: "Laporan Triwulanan", href: "/laporan-triwulan", icon: "presentation", permission: "recap.view", group: "Pelaporan" },
  { label: "Dokumen Pengadaan", href: "/dokumen", icon: "files", permission: "document.view", group: "Pengadaan" },
  { label: "Data Master", href: "/master", icon: "database", permission: "master.view", group: "Administrasi" },
  { label: "Pengguna & Peran", href: "/pengguna", icon: "users", permission: "users.manage", group: "Administrasi" },
  { label: "Log Audit", href: "/audit", icon: "scroll-text", permission: "audit.view", group: "Administrasi" },
];

export const ROLE_LABEL: Record<string, string> = {
  admin: "Admin",
  ppk: "PPK",
  pptk: "PPTK",
  ppbj: "PPBJ",
};
