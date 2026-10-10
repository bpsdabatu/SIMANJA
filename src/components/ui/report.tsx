import { APP_NAME } from "@/lib/brand";
import { Logo } from "@/components/brand/logo";
import { formatDateTimeWIB } from "@/lib/format";

/** Kop laporan: hanya tampil saat dicetak. */
export function PrintHeader({ orgName, title, subtitle }: { orgName: string; title: string; subtitle: string }) {
  return (
    <div className="print-only mb-4 border-b-2 border-navy-900 pb-3">
      <div className="flex items-center gap-4">
        <Logo variant="mark" size={56} />
        <div className="flex-1 text-center">
          <p className="text-sm font-semibold uppercase tracking-wide">{orgName}</p>
          <p className="font-display text-lg font-bold uppercase">{title}</p>
          <p className="text-sm">{subtitle}</p>
        </div>
        <div className="w-14" />
      </div>
    </div>
  );
}

/** Blok tanda tangan; nama/jabatan dikosongkan agar diisi sesuai ketentuan instansi. */
export function SignatureBlock({ place = "" }: { place?: string }) {
  const cell = (role: string) => (
    <div className="text-center">
      <p>{role}</p>
      <div className="h-20" />
      <p className="border-t border-slate-700 pt-1">(............................................)</p>
      <p className="text-xs">NIP. ......................................</p>
    </div>
  );
  return (
    <div className="print-only mt-8 break-inside-avoid text-sm">
      <p className="mb-3 text-right">{place ? `${place}, ` : ""}{new Date().toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Jakarta" })}</p>
      <div className="grid grid-cols-3 gap-8">{cell("Mengetahui,")}{cell("Pejabat Penatausahaan Keuangan")}{cell("Penyusun Laporan")}</div>
    </div>
  );
}

export function PrintFooter() {
  return <p className="print-only mt-4 text-[10px] text-slate-500">Dicetak dari {APP_NAME} pada {formatDateTimeWIB(new Date())}.</p>;
}
