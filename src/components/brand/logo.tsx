import Image from "next/image";
import { cn } from "@/lib/utils";

/** Logo resmi SIMASPRAJA. `mark` = lambang saja; `full` = lambang + nama + kepanjangan. */
export function Logo({
  variant = "mark",
  className,
  priority = false,
  size,
}: {
  variant?: "mark" | "full";
  className?: string;
  priority?: boolean;
  /** Tinggi dalam px (lebar mengikuti rasio). */
  size?: number;
}) {
  const full = variant === "full";
  const w = full ? 568 : 262;
  const h = full ? 449 : 290;
  const height = size ?? (full ? 180 : 40);
  const width = Math.round((w / h) * height);
  return (
    <Image
      src={full ? "/logo.png" : "/logo-mark.png"}
      alt={full ? "Logo SIMASPRAJA - Sistem Informasi Monitoring dan Evaluasi Perencanaan, Realisasi Anggaran dan Kinerja" : "Logo SIMASPRAJA"}
      width={width}
      height={height}
      priority={priority}
      className={cn("select-none object-contain", className)}
      style={{ width, height }}
    />
  );
}

/** Lencana putih berisi lambang, untuk latar gelap. */
export function LogoBadge({ size = 36, className }: { size?: number; className?: string }) {
  return (
    <span
      className={cn("flex shrink-0 items-center justify-center rounded-lg bg-white shadow-sm ring-1 ring-white/20", className)}
      style={{ width: size + 8, height: size + 8 }}
    >
      <Logo variant="mark" size={size} />
    </span>
  );
}
