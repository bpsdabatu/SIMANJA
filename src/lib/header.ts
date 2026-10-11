/** Kunci kolom dibakukan: huruf kecil, spasi/tanda baca -> garis bawah. (Salinan murni tanpa dependensi server.) */
export const normHeader = (h: string) => h.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
