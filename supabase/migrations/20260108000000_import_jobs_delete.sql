-- Menghapus riwayat impor yang belum dikonfirmasi (bermasalah / salah file).
-- Riwayat berstatus 'confirmed' TIDAK dapat dihapus: menjadi catatan asal data anggaran dan jejak audit.
-- import_errors ikut terhapus otomatis (on delete cascade). Aman dijalankan ulang.
grant delete on public.import_jobs to authenticated;
drop policy if exists import_jobs_del on public.import_jobs;
create policy import_jobs_del on public.import_jobs for delete to authenticated
  using (organization_id = public.current_org_id() and status <> 'confirmed'
         and public.has_role(array['super_admin','admin_opd','ppbj']::public.app_role[]));
