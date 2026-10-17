import "server-only";
import type { createAdminClient } from "@/lib/supabase/admin";

type Admin = NonNullable<ReturnType<typeof createAdminClient>>;

/*
  PANEL BİLDİRİMİ YAZMA — ortak yer.

  İki çağıran var: ürünlerin köprü ucu (app/api/bridge/bildirim) ve
  ArvoARC eşitlemesinin kendi taraması (iade talepleri, lib/arc-bridge).
  Yineleme denetimi ve "kurum var mı" sorusu ikisinde de aynı olmalı;
  ayrı yazılsalardı biri düzeltilince öteki geride kalırdı — bu depoda
  aynı kusur köprü yetkisinde de çıkmıştı.
*/

export type BildirimYazimi = {
  organizationId: string;
  category: string;
  title: string;
  message: string;
  actionUrl?: string | null;
  /** Aynı olay iki kez bildirilmesin; genelde kaynak kaydın kimliği. */
  dedupeKey?: string | null;
  metadata?: Record<string, unknown>;
  /** Satıra yazılan kaynak etiketi: hangi ürün bildirdi. */
  kaynak: string;
};

export type BildirimSonucu =
  | { yazildi: true; id: string }
  | { yazildi: false; sebep: "zaten var" }
  | { yazildi: false; sebep: "hata"; hata: string };

export async function panelBildirimiYaz(admin: Admin, girdi: BildirimYazimi): Promise<BildirimSonucu> {
  if (girdi.dedupeKey) {
    /*
      AYNI OLAY İKİ KEZ BİLDİRİLMESİN. Ödeme sağlayıcısı bildirimini
      yanıt alana kadar tekrarlıyor; eşitleme taraması da aynı kaydı
      her turda yeniden görüyor (pencere bilerek cron aralığından
      geniş, atlanan bir tur bildirimi kaçırmasın diye).
    */
    const { data: varMi, error: okumaHatasi } = await admin
      .from("notifications")
      .select("id")
      .eq("organization_id", girdi.organizationId)
      .eq("category", girdi.category)
      .eq("metadata->>dedupe_key", girdi.dedupeKey)
      .limit(1)
      .maybeSingle();
    /* Okunamazsa yazmaya devam: eksik bildirimdense yinelenen bildirim. */
    if (okumaHatasi) console.error("[bildirim] yineleme denetimi düştü", okumaHatasi.message);
    if (varMi) return { yazildi: false, sebep: "zaten var" };
  }

  const { data: satir, error } = await admin
    .from("notifications")
    .insert({
      organization_id: girdi.organizationId,
      /*
        KURUMA, KİŞİYE DEĞİL. Kuruma yazılan satır bildirim
        çekmecesinde görünüyor ama telefon çaldırmıyor: anlık bildirim
        tetikleyicisi yalnızca kişiye özel satırlarda çalışıyor
        (app/api/push/gonder). Her siparişin herkesin telefonunu
        çaldırması istenen bir şey değil.
      */
      user_id: null,
      audience: "organization",
      category: girdi.category,
      title: girdi.title,
      message: girdi.message,
      action_url: girdi.actionUrl || null,
      metadata: {
        ...(girdi.metadata ?? {}),
        kaynak: girdi.kaynak,
        ...(girdi.dedupeKey ? { dedupe_key: girdi.dedupeKey } : {}),
      },
    })
    .select("id")
    .single();

  if (error) {
    console.error("[bildirim] yazılamadı", error.message);
    return { yazildi: false, sebep: "hata", hata: error.message };
  }
  return { yazildi: true, id: satir.id };
}

/** Kurum gerçekten var mı: olmayan kuruma yazılan bildirim hiçbir ekranda görünmez. */
export async function kurumVarMi(admin: Admin, organizationId: string): Promise<boolean | null> {
  const { data, error } = await admin.from("organizations").select("id").eq("id", organizationId).maybeSingle();
  if (error) {
    console.error("[bildirim] kurum okunamadı", error.message);
    return null;
  }
  return Boolean(data);
}
