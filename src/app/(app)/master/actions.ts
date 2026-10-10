"use server";

import { requireModule } from "@/lib/auth/guard";
import { userClient } from "@/lib/supabase/server";
import { flashRedirect } from "@/lib/flash";
import { MASTER } from "@/lib/master-config";
import { isUuid, optStr, runAction, str } from "@/lib/action-utils";

export async function saveMasterAction(fd: FormData): Promise<void> {
  const { user } = await requireModule("master.manage");
  const entityKey = str(fd, "entity", 40);
  const cfg = MASTER[entityKey];
  const back = `/master?tab=${encodeURIComponent(entityKey)}`;
  if (!cfg) flashRedirect("/master", { err: "Jenis master tidak dikenal." });

  const id = str(fd, "id", 40);
  const row: Record<string, string | null> = {};
  for (const f of cfg.fields) {
    const v = f.required ? str(fd, f.key, f.max ?? 300) : optStr(fd, f.key, f.max ?? 300);
    if (f.required && !v) flashRedirect(back, { err: `${f.label} wajib diisi.` });
    row[f.key] = v;
  }
  if (cfg.parent) {
    const p = str(fd, cfg.parent.key, 40);
    if (!isUuid(p)) flashRedirect(back, { err: `${cfg.parent.label} wajib dipilih.` });
    row[cfg.parent.key] = p;
  }

  const supabase = await userClient();
  if (id) {
    if (!isUuid(id)) flashRedirect(back, { err: "Data tidak valid." });
    return runAction(back, `${cfg.label} diperbarui.`, async () => supabase.from(cfg.table).update(row).eq("id", id));
  }
  return runAction(back, `${cfg.label} ditambahkan.`, async () =>
    supabase.from(cfg.table).insert({ ...row, organization_id: user.organizationId }),
  );
}

export async function toggleMasterAction(fd: FormData): Promise<void> {
  await requireModule("master.manage");
  const entityKey = str(fd, "entity", 40);
  const cfg = MASTER[entityKey];
  const back = `/master?tab=${encodeURIComponent(entityKey)}`;
  const id = str(fd, "id", 40);
  if (!cfg || !isUuid(id)) flashRedirect("/master", { err: "Data tidak valid." });
  const next = str(fd, "active", 5) === "true";
  const supabase = await userClient();
  return runAction(back, next ? `${cfg.label} diaktifkan.` : `${cfg.label} dinonaktifkan.`, async () =>
    supabase.from(cfg.table).update({ is_active: next }).eq("id", id),
  );
}
