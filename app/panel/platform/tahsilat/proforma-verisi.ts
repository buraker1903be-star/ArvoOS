import type { createAdminClient } from "@/lib/supabase/admin";
import { arvolabClient } from "@/lib/arvolab";
import { PLANS, YILLIK_ODENEN_AY } from "@/lib/site/pricing";
import { planTutari, ekKalemTutari, type Fiyatlar } from "@/lib/site/fiyat-kaynagi";
import type { ProformaAlici } from "@/lib/proforma";
import { sayfaliSonuc } from "@/lib/rapor-okuma";

/** Proforma alıcısı için okunan kurum sütunları. */
type KurumSatiri = {
  id: string; name: string; display_name: string | null; kind: string | null; grup_markasi: boolean | null;
  legal_name: string | null; legal_address: string | null; legal_district: string | null; legal_city: string | null;
  tax_office: string | null; tax_number: string | null; contact_email: string | null;
};
import type { ProformaFiyatKisayolu } from "./proforma-formu";

/*
  Proforma formunun ön doldurma verisi (28.10.2026). Sayfa dosyası
  zaten uzun; okuma burada, kural (alıcı nasıl kurulur) da burada.
*/

type Admin = NonNullable<ReturnType<typeof createAdminClient>>;

export type KurumAlicisi = { id: string; ad: string; kind: string | null; grup_markasi: boolean | null; alici: ProformaAlici };

/*
  Kurumun alıcı bilgisi yasal bilgilerinden (Ayarlar → Kurum bilgileri);
  ad soyad, kurum sahibinin adı (resmî belgede muhatap kişi). E-posta
  kurumun iletişim adresi.
*/
export async function kurumAlicilari(admin: Admin): Promise<KurumAlicisi[]> {
  /*
    İKİSİ DE SAYFALI. Bu liste proformanın ALICI seçiciSİ: 1.000 satır
    tavanında kesilen bir kurum, kurucunun ona proforma kesememesi
    demek — hem de eksik olduğu hiçbir yerde yazmadan (lib/rapor-okuma).
  */
  const [{ data: kurumlar, error }, { data: sahipler, error: sahipHatasi }] = await Promise.all([
    sayfaliSonuc<KurumSatiri>("kurumlar", (bas, son) =>
      admin.from("organizations")
        .select("id,name,display_name,kind,grup_markasi,legal_name,legal_address,legal_district,legal_city,tax_office,tax_number,contact_email")
        .order("id").range(bas, son)),
    sayfaliSonuc<{ organization_id: string; user_id: string }>("kurum sahipleri", (bas, son) =>
      admin.from("organization_memberships").select("organization_id,user_id").eq("role", "owner").eq("is_active", true)
        .order("organization_id").range(bas, son)),
  ]);
  if (error) throw new Error("Kurumlar okunamadı: " + error.message);
  /* Sahip adı yalnızca ön doldurma: okunamazsa alan boş gelir, kurucu
     yazar. Kurum listesi ise zorunlu (yukarıda fırlatılıyor). */
  // hata-tamam: sahip adı okunamazsa yalnızca "Ad soyad" kutusu boş açılıyor.
  const sahipListesi = sahipHatasi ? [] : ((sahipler ?? []) as { organization_id: string; user_id: string }[]);
  const kullaniciIdleri = [...new Set(sahipListesi.map((s) => s.user_id))];
  const { data: profiller } = kullaniciIdleri.length
    ? await admin.from("profiles").select("id,full_name").in("id", kullaniciIdleri)
    // hata-tamam: profil okunamazsa ad soyad boş açılır, kurucu yazar.
    : { data: [] as { id: string; full_name: string | null }[] };
  const ad = new Map(((profiller ?? []) as { id: string; full_name: string | null }[]).map((p) => [p.id, p.full_name]));
  const sahip = new Map(sahipListesi.map((s) => [s.organization_id, ad.get(s.user_id) ?? null]));

  return ((kurumlar ?? []) as {
    id: string; name: string; display_name: string | null; kind: string | null; grup_markasi: boolean | null;
    legal_name: string | null; legal_address: string | null; legal_district: string | null; legal_city: string | null;
    tax_office: string | null; tax_number: string | null; contact_email: string | null;
  }[])
    .map((k) => {
      const ilce = [k.legal_district, k.legal_city].filter(Boolean).join(" / ");
      return {
        id: k.id,
        ad: k.legal_name && k.legal_name !== (k.display_name || k.name) ? `${k.display_name || k.name} — ${k.legal_name}` : k.display_name || k.name,
        kind: k.kind,
        grup_markasi: k.grup_markasi,
        alici: {
          // Unvan girilmemişse kurumun adı: belgede boş muhatap olmasın, kurucu düzeltebilir.
          unvan: k.legal_name || k.display_name || k.name,
          adSoyad: sahip.get(k.id) ?? null,
          vergiDairesi: k.tax_office,
          vergiNo: k.tax_number,
          adres: [k.legal_address, ilce].filter(Boolean).join(", ") || null,
          eposta: k.contact_email,
        },
      };
    })
    .sort((a, b) => a.ad.localeCompare(b.ad, "tr"));
}

/*
  Abonenin adı ArvoOS'taki abone kaydında boşsa ArvoLab profilinden.
  Eskiden seçim kutusunda yalnızca e-posta görünüyordu: köprü adı
  yalnızca kayıt anında taşıyordu, profilini sonra dolduran kişinin adı
  ArvoOS'a hiç gelmiyordu. Köprü kapalıysa ya da okuma düşerse e-posta
  kalır — proforma yine kesilebilir, ad formda elle yazılır.
*/
export async function arvolabAdlari(kullaniciIdleri: string[]): Promise<Map<string, string>> {
  const sonuc = new Map<string, string>();
  const istemci = arvolabClient();
  if (!istemci || !kullaniciIdleri.length) return sonuc;
  const { data, error } = await istemci.from("profiles").select("id,full_name").in("id", kullaniciIdleri.slice(0, 500));
  // hata-tamam: ad okunamazsa seçim kutusunda e-posta kalıyor; proforma yine kesilebiliyor.
  if (error) return sonuc;
  for (const p of (data ?? []) as { id: string; full_name: string | null }[]) if (p.full_name?.trim()) sonuc.set(p.id, p.full_name.trim());
  return sonuc;
}

const URUN_ADI: Record<string, string> = { arvoos: "ArvoOS", arvolab: "ArvoLab", randevu: "ArvoCal" };

/** Yayımlı fiyat listesinden kalem kısayolları: her basamağın aylığı ve yıllığı, ek kalemler. */
export function fiyatKisayollari(fiyatlar: Fiyatlar): ProformaFiyatKisayolu[] {
  const liste: ProformaFiyatKisayolu[] = [];
  for (const plan of PLANS) {
    if (!(plan.product in URUN_ADI)) continue;
    const aylik = planTutari(plan, fiyatlar);
    if (aylik === null) continue;
    const ad = `${URUN_ADI[plan.product]} ${plan.ad.tr}`;
    liste.push({ urun: plan.product, etiket: `${plan.ad.tr} aylık`, aciklama: `${ad} aboneliği (1 ay)`, kurus: aylik });
    liste.push({ urun: plan.product, etiket: `${plan.ad.tr} yıllık`, aciklama: `${ad} aboneliği (12 ay, ${YILLIK_ODENEN_AY} ay bedeli)`, kurus: aylik * YILLIK_ODENEN_AY });
  }
  const ekKullanici = ekKalemTutari("ek-kullanici", fiyatlar);
  if (ekKullanici !== null) liste.push({ urun: "arvoos", etiket: "Ek kullanıcı", aciklama: "ArvoOS ek kullanıcı (1 ay)", kurus: ekKullanici });
  const ekSube = ekKalemTutari("ek-sube", fiyatlar);
  if (ekSube !== null) liste.push({ urun: "randevu", etiket: "Ek şube", aciklama: "ArvoCal ek şube (1 ay)", kurus: ekSube });
  return liste;
}
