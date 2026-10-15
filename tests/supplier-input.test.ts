import { describe, expect, it } from "vitest";
import { normalizeName, parseNpwp, similarSuppliers } from "../src/lib/supplier-input";

describe("input penyedia manual", () => {
  it("nama dinormalisasi (spasi ganda)", () => expect(normalizeName("  CV   Maju  Jaya ")).toBe("CV Maju Jaya"));

  it("NPWP opsional; 15/16 digit; format titik/hubung diterima", () => {
    expect(parseNpwp("")).toEqual({ value: null });
    expect(parseNpwp("01.234.567.8-901.000")).toEqual({ value: "01.234.567.8-901.000" });
    expect(parseNpwp("0123456789012345").value).toBe("0123456789012345");
    expect(parseNpwp("12345").error).toMatch(/15 atau 16/);
    expect(parseNpwp("ABC123456789012").error).toMatch(/angka/);
  });

  it("mendeteksi penyedia yang sudah ada (tanpa beda huruf/spasi) dan yang mirip", () => {
    const list = [{ id: "1", label: "CV Maju Jaya" }, { id: "2", label: "PT Maju Jaya Abadi" }, { id: "3", label: "UD Sentosa" }];
    expect(similarSuppliers("cv  maju JAYA", list).exact?.id).toBe("1");
    expect(similarSuppliers("maju jaya", list).similar.map((s) => s.id)).toEqual(["1", "2"]);
    expect(similarSuppliers("ab", list)).toEqual({ exact: null, similar: [] });
    expect(similarSuppliers("Toko Baru", list)).toEqual({ exact: null, similar: [] });
  });
});
