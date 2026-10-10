-- =====================================================================
-- 0005_login_captcha.sql
-- Pencatatan nonce kode keamanan (CAPTCHA) agar setiap kode hanya berlaku SATU kali.
-- Hanya service role (server) yang mengakses; RLS aktif tanpa kebijakan.
-- =====================================================================
create table public.captcha_nonces (
  nonce_hash text primary key,
  expires_at timestamptz not null,
  used_at    timestamptz not null default now()
);
create index captcha_nonces_exp_idx on public.captcha_nonces (expires_at);

alter table public.captcha_nonces enable row level security;
revoke all on public.captcha_nonces from anon, authenticated;
