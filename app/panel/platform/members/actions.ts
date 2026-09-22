"use server";

import { revalidatePath } from "next/cache";
import { flashSuccess, runPanelAction } from "@/lib/panel-action";
import { getPanelContext } from "@/lib/panel-context";
import { createAdminClient } from "@/lib/supabase/admin";
import { erisimDegisikligiEngeli } from "@/lib/uye-erisimi";

/*
  Kurucu konsolundan üye erişimini açma/kapatma.

  Üye listesi şimdiye kadar salt okunurdu: kurucu kimin nereye erişebildiğini
  görüyor ama hiçbir şey yapamıyordu. Ayrılan bir çalışanın erişimini kapatmak
  için kurumun kendi paneline geçmek, oradan İK ekranını bulmak gerekiyordu.

  Yazma service_role ile: organization_memberships'te authenticated için
  UPDATE politikası yok, tüm yazmalar sunucu tarafından yapılıyor.

  DİKKAT: service_role veritabanındaki son-sahip korumasını atlıyor
  (arvo_membership_owner_guard yalnızca istek bağlamı olan çağrılarda
  denetliyor). Kural bu yüzden burada da uygulanıyor — lib/uye-erisimi.ts.
*/
async function uyeErisimiDegistir__impl(formData: FormData) {
  const { userId, isPlatformOwner } = await getPanelContext();
  if (!isPlatformOwner) throw new Error("Bu işlem için kurucu yetkisi gerekiyor.");

  const organizationId = String(formData.get("organization_id") ?? "").trim();
  const hedefKullanici = String(formData.get("user_id") ?? "").trim();
  const aciliyorMu = String(formData.get("acik") ?? "") === "1";
  if (!organizationId || !hedefKullanici) throw new Error("Üye seçilmedi.");

  const admin = createAdminClient();
  if (!admin) throw new Error("Sunucu anahtarı tanımlı değil.");

  const { data: uyelik } = await admin
    .from("organization_memberships")
    .select("role,is_active")
    .eq("organization_id", organizationId)
    .eq("user_id", hedefKullanici)
    .maybeSingle();
  if (!uyelik) throw new Error("Üyelik kaydı bulunamadı.");
  if (Boolean(uyelik.is_active) === aciliyorMu) return; // Zaten istenen durumda.

  const { count: digerAktifSahip } = await admin
    .from("organization_memberships")
    .select("user_id", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .eq("role", "owner")
    .eq("is_active", true)
    .neq("user_id", hedefKullanici);

  const engel = erisimDegisikligiEngeli({
    kendisiMi: hedefKullanici === userId,
    aciliyorMu,
    hedefRol: String(uyelik.role ?? ""),
    digerAktifSahip: digerAktifSahip ?? 0,
  });
  if (engel) throw new Error(engel);

  const { error } = await admin
    .from("organization_memberships")
    .update({ is_active: aciliyorMu })
    .eq("organization_id", organizationId)
    .eq("user_id", hedefKullanici);
  if (error) throw new Error(`Erişim güncellenemedi: ${error.message}`);

  /*
    Kayıt hedef KURUMUN altına düşüyor, Arvo'nun altına değil: o kurumun
    yöneticisi "erişimim neden kapandı" diye sorduğunda yanıt kendi
    etkinlik kaydında olmalı.
  */
  /*
    logActivity yardımcısı yalnızca CRM varlıklarını tipliyor (CrmEntityType);
    tabloda böyle bir kısıt yok. Kaydı doğrudan yazıyoruz ki kurucunun
    müşteri verisine dokunuşu izsiz kalmasın.
  */
  const { error: kayitHatasi } = await admin.from("activity_logs").insert({
    organization_id: organizationId,
    actor_user_id: userId,
    action: "status",
    entity_type: "organization_membership",
    entity_id: hedefKullanici,
    metadata: { is_active: aciliyorMu, by: "founder_console" },
  });
  // Kayıt yazılamazsa işlem yine de olmuştur; kullanıcıyı yanıltmayalım.
  if (kayitHatasi) console.error("[konsol] üye erişimi kaydı yazılamadı", kayitHatasi.message);

  revalidatePath("/panel/platform/members");
  await flashSuccess(aciliyorMu ? "Erişim açıldı" : "Erişim kapatıldı");
}

export async function uyeErisimiDegistir(formData: FormData): Promise<void> {
  await runPanelAction(() => uyeErisimiDegistir__impl(formData));
}
