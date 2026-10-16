export type Tone = "slate" | "teal" | "red" | "amber" | "navy" | "green" | "gold";

export const TX_STATUS: Record<string, { label: string; tone: Tone }> = {
  draft: { label: "Draf", tone: "amber" },
  submitted: { label: "Diajukan", tone: "navy" },
  contracted: { label: "Berkontrak", tone: "navy" },
  payment_processing: { label: "Belum SP2D", tone: "red" },
  realisasi: { label: "Realisasi", tone: "green" },
  returned: { label: "Dikembalikan", tone: "red" },
  cancelled: { label: "Dibatalkan", tone: "slate" },
};

export const DOC_STATUS: Record<string, { label: string; tone: Tone }> = {
  draft: { label: "Draf", tone: "amber" },
  submitted: { label: "Diajukan", tone: "navy" },
  under_review: { label: "Sedang direviu", tone: "gold" },
  returned_for_correction: { label: "Perlu perbaikan", tone: "red" },
  resubmitted: { label: "Diajukan ulang", tone: "navy" },
  review_completed: { label: "Reviu selesai", tone: "green" },
  approved: { label: "Disetujui", tone: "green" },
  issued: { label: "BA terbit", tone: "green" },
  archived: { label: "Arsip", tone: "slate" },
  cancelled: { label: "Dibatalkan", tone: "slate" },
};
