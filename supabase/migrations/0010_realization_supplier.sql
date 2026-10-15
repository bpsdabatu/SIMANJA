-- =====================================================================
-- 0010 — Penyedia dapat ditambahkan langsung dari form Realisasi Belanja
-- PPTK (realization.edit) tidak memiliki master.manage sehingga tidak dapat menulis tabel suppliers langsung.
-- Fungsi ini (security definer, izin diperiksa eksplisit, dibatasi organisasi pemanggil) menambah penyedia baru
-- ke Data Master atau memakai ulang penyedia dengan nama yang sama (tanpa membedakan huruf besar/kecil & spasi ganda).
-- Aditif: tidak mengubah tabel, kebijakan RLS, maupun fungsi yang ada.
-- =====================================================================
create or replace function public.create_supplier_for_realization(p_name text, p_npwp text default null, p_address text default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_org uuid := app.current_org();
  v_name text := regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g');
  v_npwp text := nullif(btrim(coalesce(p_npwp, '')), '');
  v_addr text := nullif(btrim(coalesce(p_address, '')), '');
  v_id uuid; v_active boolean;
begin
  perform app.require_permission('realization.edit');
  if v_org is null then raise exception 'Organisasi tidak ditemukan' using errcode = '42501'; end if;
  if v_name = '' then raise exception 'Nama penyedia wajib diisi' using errcode = '22023'; end if;
  if length(v_name) > 200 then raise exception 'Nama penyedia maksimal 200 karakter' using errcode = '22023'; end if;
  if v_npwp is not null and length(v_npwp) > 40 then raise exception 'NPWP maksimal 40 karakter' using errcode = '22023'; end if;
  if v_addr is not null and length(v_addr) > 500 then raise exception 'Alamat maksimal 500 karakter' using errcode = '22023'; end if;

  -- Cegah dua penyedia identik dibuat bersamaan.
  perform pg_advisory_xact_lock(hashtext(v_org::text || '|supplier|' || lower(v_name)));

  select id, is_active into v_id, v_active
    from public.suppliers
   where organization_id = v_org and lower(regexp_replace(btrim(name), '\s+', ' ', 'g')) = lower(v_name)
   order by is_active desc, created_at limit 1;
  if v_id is not null then
    if not v_active then
      raise exception 'Penyedia "%" sudah ada di Data Master tetapi nonaktif. Minta pengelola Data Master mengaktifkannya.', v_name using errcode = '22023';
    end if;
    return v_id;
  end if;

  insert into public.suppliers (organization_id, name, npwp, address) values (v_org, v_name, v_npwp, v_addr) returning id into v_id;
  return v_id;
end $$;

revoke all on function public.create_supplier_for_realization(text, text, text) from public, anon;
grant execute on function public.create_supplier_for_realization(text, text, text) to authenticated;
