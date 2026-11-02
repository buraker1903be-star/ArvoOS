import { createAdminClient } from "@/lib/supabase/admin";
import { alanFarki, type AlanTanimi, type Degisiklik } from "@/lib/konsol-degisiklik";
import { productLicenseLabels } from "@/lib/products";
import { kapanisNedeniAdi } from "@/lib/kapanis-nedeni";
import { PAKET_ADI, depolama, para, sayi, tarih } from "./bicim";

/*
  Konsol işleminin kaydını yazar (gerekçe: lib/konsol-degisiklik.ts).

  BİLEREK "use server" DEĞİL: o dosyadaki her export dışarıdan
  çağrılabilir bir uç noktaya dönüşür. Bu yardımcı yalnızca kurucu
  yetkisini zaten doğrulamış sunucu işlemlerinden çağrılıyor.

  Kayıt akışı DÜŞÜRMEZ: işlem olmuştur, kayıt yazılamadı diye kurucuya
  "olmadı" demek yanlış olurdu. Yazılamazsa log'a gider (üye erişimi
  kaydıyla aynı kural).

  service_role ile yazılıyor: activity_logs'un INSERT politikası yalnızca
  kurumun ÜYESİNE açık ve kurucu müşteri kurumun üyesi değil.
*/

const durum = (v: unknown) => productLicenseLabels[String(v)] ?? String(v);
const tamsayi = (v: unknown) => sayi(Number(v));
const tutar = (v: unknown) => para(Number(v));
const gun = (v: unknown) => tarih(String(v));

export const LISANS_ALANLARI: Record<string, AlanTanimi> = {
  license_status: { ad: "Durum", yaz: durum },
  plan_code: { ad: "Paket", yaz: (v) => PAKET_ADI[String(v)] ?? String(v) },
  user_limit: { ad: "Kullanıcı limiti", yaz: tamsayi },
  storage_limit_mb: { ad: "Depolama", yaz: (v) => depolama(Number(v)) },
  ai_credit_limit: { ad: "AI kredisi", yaz: tamsayi },
  monthly_fee: { ad: "Aylık ücret", yaz: tutar },
  extra_user_fee: { ad: "Ek koltuk bedeli", yaz: tutar },
  extra_user_cap: { ad: "Ek koltuk tavanı", yaz: tamsayi },
  trial_ends_at: { ad: "Deneme bitişi", yaz: gun },
  current_period_end: { ad: "Dönem sonu", yaz: gun },
  suspension_reason: { ad: "Askı sebebi" },
  kapanis_nedeni: { ad: "Kayıp nedeni", yaz: (v) => kapanisNedeniAdi(String(v)) },
  kapanis_notu: { ad: "Kayıp notu" },
};

export const URUN_LISANS_ALANLARI: Record<string, AlanTanimi> = {
  status: { ad: "Durum", yaz: durum },
  plan_code: { ad: "Paket", yaz: (v) => PAKET_ADI[String(v)] ?? String(v) },
  monthly_fee: { ad: "Aylık ücret", yaz: tutar },
  limits: { ad: "Kotalar", yaz: (v) => Object.entries(v as Record<string, number>).map(([k, n]) => `${k} ${sayi(n)}`).join(", ") },
  current_period_end: { ad: "Dönem sonu", yaz: gun },
  suspension_reason: { ad: "Askı sebebi" },
  integrated: { ad: "Köprü", yaz: (v) => (v === false ? "Bağımsız" : "Entegre") },
  kapanis_nedeni: { ad: "Kayıp nedeni", yaz: (v) => kapanisNedeniAdi(String(v)) },
  kapanis_notu: { ad: "Kayıp notu" },
};

export const KURUM_ALANLARI: Record<string, AlanTanimi> = {
  name: { ad: "Kurum adı" },
  display_name: { ad: "Tabela unvanı" },
  sector: { ad: "Sektör" },
  custom_domain: { ad: "Alan adı" },
  kind: { ad: "Tür", yaz: (v) => (v === "internal" ? "Arvo" : "Müşteri") },
  grup_markasi: { ad: "Grup markası", yaz: (v) => (v ? "Evet" : "Hayır") },
  contact_phone: { ad: "İletişim telefonu" },
};

export async function konsolKaydiYaz(kayit: {
  organizationId: string;
  userId: string | null;
  entityType: "organization_license" | "product_license" | "product_bridge" | "organization_settings" | "organization_module" | "founder_scope" | "package_limits" | "proforma";
  entityId: string;
  baslik: string;
  degisiklikler: Degisiklik[];
}): Promise<void> {
  /* Hiçbir şey değişmediyse kayıt yok: "değişmedi" satırları geçmişi
     okunmaz hâle getiriyor (lib/activity-log.ts ile aynı kural). */
  if (!kayit.degisiklikler.length) return;
  const admin = createAdminClient();
  if (!admin) {
    console.error("[konsol] işlem kaydı yazılamadı: sunucu anahtarı yok", kayit.entityType, kayit.organizationId);
    return;
  }
  const { error } = await admin.from("activity_logs").insert({
    organization_id: kayit.organizationId,
    actor_user_id: kayit.userId,
    action: "update",
    entity_type: kayit.entityType,
    entity_id: kayit.entityId,
    metadata: { by: "founder_console", baslik: kayit.baslik, degisiklikler: kayit.degisiklikler },
  });
  if (error) console.error("[konsol] işlem kaydı yazılamadı", kayit.entityType, error.message);
}

export { alanFarki };
