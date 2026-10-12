"use client";

import { useEffect } from "react";

/** Menggulung halaman ke baris transaksi yang baru disimpan agar pengguna langsung melihat lokasinya. */
export function ScrollToRow({ id }: { id: string }) {
  useEffect(() => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [id]);
  return null;
}
