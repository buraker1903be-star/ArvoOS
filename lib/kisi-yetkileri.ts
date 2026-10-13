import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { etkinYetkiler, gizliModulleriHesapla } from "@/lib/yetkiler";

/*
  BİR KURUMDA BİR YETENEĞE SAHİP ETKİN ÜYELER — oturum dışından (cron,
  push). Panelin kullandığı aynı hesap (lib/yetkiler.ts: rol + kişi
  kuralları, modül kapısı); karar rol listesiyle verilmez (AGENTS.md):
  kurum "Lisans ve ödeme"yi bir müdüre açtıysa abonelik hatırlatması da
  ona gider.

  kullanicilar verilmezse kurumun bütün etkin üyelerine bakılır.
  Okunamayan kural "kısıt yok" sayılmaz: hata olursa boş küme döner
  (kimseye gitmez) ve hata günlüğe yazılır.
*/
export async function yetkisiOlanlar(admin: SupabaseClient, orgId: string, yetenek: string, kullanicilar?: string[]): Promise<Set<string>> {
  const sonuc = new Set<string>();
  if (kullanicilar && !kullanicilar.length) return sonuc;
  let uyelikSorgusu = admin.from("organization_memberships").select("user_id,role").eq("organization_id", orgId).eq("is_active", true);
  if (kullanicilar) uyelikSorgusu = uyelikSorgusu.in("user_id", kullanicilar);
  const { data: uyelikler, error } = await uyelikSorgusu;
  if (error) { console.error("[yetki] üyelikler okunamadı", error.message); return sonuc; }
  const etkin = (uyelikler ?? []) as { user_id: string; role: string }[];
  if (!etkin.length) return sonuc;
  const roller = [...new Set(etkin.map((u) => u.role))];
  const kisiler = etkin.map((u) => u.user_id);
  const [rm, km, ry, ky] = await Promise.all([
    admin.from("role_module_permissions").select("role,module_key,can_access").eq("organization_id", orgId).in("role", roller),
    admin.from("member_module_permissions").select("user_id,module_key,can_access").eq("organization_id", orgId).in("user_id", kisiler),
    admin.from("role_capability_permissions").select("role,capability_key,allowed").eq("organization_id", orgId).in("role", roller),
    admin.from("member_capability_permissions").select("user_id,capability_key,allowed").eq("organization_id", orgId).in("user_id", kisiler),
  ]);
  const hata = [rm, km, ry, ky].find((r) => r.error);
  if (hata?.error) { console.error("[yetki] kurallar okunamadı", hata.error.message); return sonuc; }
  for (const u of etkin) {
    const gizli = gizliModulleriHesapla({
      rol: u.role,
      rolSatirlari: (rm.data ?? []).filter((r) => r.role === u.role),
      kisiSatirlari: (km.data ?? []).filter((r) => r.user_id === u.user_id),
    });
    const yetkiler = etkinYetkiler({
      rol: u.role,
      gizliModuller: gizli,
      rolKurallari: (ry.data ?? []).filter((r) => r.role === u.role),
      kisiKurallari: (ky.data ?? []).filter((r) => r.user_id === u.user_id),
    });
    if (yetkiler.has(yetenek)) sonuc.add(u.user_id);
  }
  return sonuc;
}
