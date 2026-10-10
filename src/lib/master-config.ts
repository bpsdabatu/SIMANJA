/** Konfigurasi Data Master. Daftar putih kolom: hanya kolom di sini yang dapat ditulis dari formulir. */
export type FieldKind = "text" | "textarea";
export interface MasterField { key: string; label: string; required?: boolean; kind?: FieldKind; max?: number; mono?: boolean }
export interface MasterParent { key: string; label: string; table: string; labelOf: "code_name" | "year" }
export interface MasterEntity {
  label: string;
  table: string;
  fields: MasterField[];
  parent?: MasterParent;
  orderBy: string;
  hint?: string;
}

export const MASTER: Record<string, MasterEntity> = {
  programs: {
    label: "Program", table: "programs", orderBy: "code",
    fields: [{ key: "code", label: "Kode", required: true, max: 40, mono: true }, { key: "name", label: "Nama Program", required: true, max: 300 }],
  },
  activities: {
    label: "Kegiatan", table: "activities", orderBy: "code",
    parent: { key: "program_id", label: "Program", table: "programs", labelOf: "code_name" },
    fields: [{ key: "code", label: "Kode", required: true, max: 40, mono: true }, { key: "name", label: "Nama Kegiatan", required: true, max: 300 }],
  },
  sub_activities: {
    label: "Sub Kegiatan", table: "sub_activities", orderBy: "code",
    parent: { key: "activity_id", label: "Kegiatan", table: "activities", labelOf: "code_name" },
    fields: [{ key: "code", label: "Kode", required: true, max: 40, mono: true }, { key: "name", label: "Nama Sub Kegiatan", required: true, max: 300 }],
  },
  expenditure_accounts: {
    label: "Rekening Belanja", table: "expenditure_accounts", orderBy: "code",
    fields: [{ key: "code", label: "Kode Rekening", required: true, max: 40, mono: true }, { key: "name", label: "Uraian", required: true, max: 300 }],
  },
  funding_sources: {
    label: "Sumber Dana", table: "funding_sources", orderBy: "code",
    fields: [{ key: "code", label: "Kode", required: true, max: 40, mono: true }, { key: "name", label: "Nama Sumber Dana", required: true, max: 200 }],
  },
  procurement_methods: {
    label: "Metode Pengadaan", table: "procurement_methods", orderBy: "code",
    fields: [{ key: "code", label: "Kode", required: true, max: 40, mono: true }, { key: "name", label: "Nama Metode", required: true, max: 200 }],
  },
  suppliers: {
    label: "Penyedia", table: "suppliers", orderBy: "name",
    fields: [
      { key: "name", label: "Nama Penyedia", required: true, max: 200 },
      { key: "npwp", label: "NPWP", max: 40, mono: true },
      { key: "address", label: "Alamat", kind: "textarea", max: 500 },
    ],
  },
  rup_references: {
    label: "Referensi RUP", table: "rup_references", orderBy: "rup_code",
    parent: { key: "fiscal_year_id", label: "Tahun Anggaran", table: "fiscal_years", labelOf: "year" },
    fields: [{ key: "rup_code", label: "Kode RUP", required: true, max: 60, mono: true }, { key: "package_name", label: "Nama Paket", max: 300 }],
  },
};

export const MASTER_KEYS = Object.keys(MASTER);
