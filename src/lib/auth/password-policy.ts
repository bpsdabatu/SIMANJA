import { z } from "zod";

/** Kebijakan kata sandi (selaras dengan pengaturan Supabase Auth: minimal 10 karakter). */
export const passwordSchema = z
  .string()
  .min(10, "Kata sandi minimal 10 karakter.")
  .max(128, "Kata sandi maksimal 128 karakter.")
  .regex(/[a-z]/, "Kata sandi harus memuat huruf kecil.")
  .regex(/[A-Z]/, "Kata sandi harus memuat huruf besar.")
  .regex(/[0-9]/, "Kata sandi harus memuat angka.");
