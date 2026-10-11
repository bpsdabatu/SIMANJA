"use client";
/** Tombol submit dengan dialog konfirmasi bawaan peramban (untuk aksi yang tidak bisa dibatalkan). */
export function ConfirmButton({ message, className, children }: { message: string; className?: string; children: React.ReactNode }) {
  return <button type="submit" className={className} onClick={(e) => { if (!window.confirm(message)) e.preventDefault(); }}>{children}</button>;
}
