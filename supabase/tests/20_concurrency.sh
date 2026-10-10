#!/usr/bin/env bash
# Tes konkurensi: dua sesi mencoba membayar 300.000 pada butir ber-pagu 500.000 secara bersamaan.
# Hasil yang benar: tepat satu berhasil, total pembayaran <= pagu.
# Jalankan setelah run.sh (database uji sudah berisi skema).
set -euo pipefail
: "${PGHOST:=localhost}" "${PGPORT:=5432}" "${PGUSER:=postgres}" "${TEST_DB:=simanja_test}"
export PGHOST PGPORT PGUSER
Q() { psql -v ON_ERROR_STOP=1 -qAt -d "${TEST_DB}" "$@"; }

ORG=00000000-0000-0000-0000-0000000000a1
Q <<SQL
insert into public.fiscal_years (id, organization_id, year) values ('00000000-0000-0000-0000-00000000f027','$ORG',2027) on conflict do nothing;
insert into public.budget_versions (id, organization_id, fiscal_year_id, stage_code, version_no, status)
 values ('00000000-0000-0000-0000-0000000b0027','$ORG','00000000-0000-0000-0000-00000000f027','murni',1,'active') on conflict do nothing;
insert into public.budget_items (id, organization_id, fiscal_year_id, sub_activity_id, expenditure_account_id, funding_source_id, pptk_id, description)
 values ('00000000-0000-0000-0000-0000000b1027','$ORG','00000000-0000-0000-0000-00000000f027','00000000-0000-0000-0000-00000000a003','00000000-0000-0000-0000-00000000e001','00000000-0000-0000-0000-00000000d001','33333333-3333-3333-3333-333333333333','Butir konkurensi') on conflict do nothing;
insert into public.budget_item_versions (id, organization_id, budget_version_id, budget_item_id, pagu)
 values ('00000000-0000-0000-0000-0000000c1027','$ORG','00000000-0000-0000-0000-0000000b0027','00000000-0000-0000-0000-0000000b1027',500000) on conflict do nothing;
insert into public.realization_transactions (id, organization_id, budget_version_id, budget_item_id, transaction_date, description, created_by)
 values ('00000000-0000-0000-0000-00000000aa27','$ORG','00000000-0000-0000-0000-0000000b0027','00000000-0000-0000-0000-0000000b1027','2027-01-05','Transaksi konkurensi','33333333-3333-3333-3333-333333333333') on conflict do nothing;
-- Pembersihan sisa eksekusi sebelumnya (hanya untuk pengujian; trigger dimatikan sesi ini saja)
set session_replication_role = replica;
delete from public.payment_records where transaction_id = '00000000-0000-0000-0000-00000000aa27';
reset session_replication_role;
SQL

TMP=$(mktemp -d)
PAY="insert into public.payment_records (organization_id, transaction_id, amount) values ('$ORG','00000000-0000-0000-0000-00000000aa27',300000)"

# Sesi A menahan transaksi terbuka 2 detik setelah INSERT; sesi B mulai di tengah-tengahnya.
( set +e; psql -v ON_ERROR_STOP=1 -qAt -d "${TEST_DB}" -c "begin; $PAY; select pg_sleep(2); commit;" >"$TMP/a.out" 2>"$TMP/a.err"; echo $? >"$TMP/a.rc" ) &
sleep 0.7
( set +e; psql -v ON_ERROR_STOP=1 -qAt -d "${TEST_DB}" -c "begin; $PAY; commit;" >"$TMP/b.out" 2>"$TMP/b.err"; echo $? >"$TMP/b.rc" ) &
wait

RC_A=$(cat "$TMP/a.rc"); RC_B=$(cat "$TMP/b.rc")
TOTAL=$(Q -c "select coalesce(sum(amount),0) from public.payment_records where transaction_id = '00000000-0000-0000-0000-00000000aa27'")
echo "sesi A rc=$RC_A | sesi B rc=$RC_B | total pembayaran=$TOTAL | pagu=500000"
[ -s "$TMP/b.err" ] && echo "galat sesi B: $(head -1 "$TMP/b.err")"

if [ $((RC_A + RC_B)) -ne 3 ] && ! { [ "$RC_A" -eq 0 ] && [ "$RC_B" -ne 0 ]; } && ! { [ "$RC_A" -ne 0 ] && [ "$RC_B" -eq 0 ]; }; then
  echo "GAGAL: harus tepat satu sesi berhasil"; exit 1
fi
if [ "$(printf '%.0f' "$TOTAL")" -gt 500000 ]; then echo "GAGAL: total melebihi pagu"; exit 1; fi
echo "LULUS: pembayaran bersamaan tidak melebihi pagu"
rm -rf "$TMP"
