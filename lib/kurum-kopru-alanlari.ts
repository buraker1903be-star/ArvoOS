/*
  KÖPRÜNÜN TAŞIDIĞI KURUM ALANLARI.

  CANLI HATA (01.10.2026 09:09 → 02.10.2026): köprü kurumları
  `select("*")` ile okuyup hedefe olduğu gibi yazıyordu. ArvoOS'un
  organizations tablosuna eklenen HER yeni sütun böylece karşı tarafa da
  gidiyor; hedef şemada o sütun yoksa yazma tamamen düşüyor.

  revision_days eklendiği an ArvoRandevu ve ArvoARC eşitlemesi durdu:
  "Could not find the 'revision_days' column of 'organizations'".
  Bir gün boyunca hiçbir kurum, lisans ve üyelik karşıya geçmedi; hata
  yalnızca günlükte kaldı.

  `select("*")` iki şemayı birbirine bağlıyordu: ArvoOS'a sütun eklemek,
  başka bir ürünü kıran bir işe dönüşmüştü. Artık ne taşınacağı burada
  AÇIKÇA yazıyor. Yeni bir sütun eklendiğinde köprü sessizce kırılmaz;
  tests/unit/kurum-kopru-alanlari.test.ts listeye alınmadığını söyler ve
  karar vermeye zorlar.
*/

/*
  TEK KAYNAK LİTERAL DİZGE, dizi ondan türetiliyor. Tersi daha okunaklıydı
  ama supabase-js select()'i TİP DÜZEYİNDE çözümlüyor: diziden join ile
  üretilen dizge literal olmadığı için tip çıkarımı çöküyor ve sorgu
  sonucu hata tipine düşüyordu.
*/
// Tek satır ve birleştirmesiz: "+" ile kurulan dizge literal olmaktan
// çıkıyor ve supabase-js tip çıkarımı yine çöküyor.
// prettier-ignore
export const KURUM_KOPRU_SECIMI = "id,name,slug,sector,status,plan_code,custom_domain,created_at,updated_at,provisioning_state,logo_url,primary_color,document_footer,contact_email,contact_phone,website_url,signature_stamp_url,custom_domain_status,custom_domain_verification,custom_domain_updated_at,display_name,brand_color,legal_name,legal_address,legal_city,legal_district,tax_office,tax_number,mersis_no,bank_name,bank_account_holder,iban,kind";

/** Hedeflerde (ArvoRandevu, ArvoARC) birebir var olan kurum alanları. */
export const KURUM_KOPRU_ALANLARI = KURUM_KOPRU_SECIMI.split(",");

/*
  ArvoOS'a özel, karşı tarafa GİTMEYEN alanlar. Buraya yazmak bilinçli bir
  karardır: alan hedefte yok ve olmasına da gerek yok.
    revision_days        — revizyon penceresi, ArvoOS operasyonuna ait
    tracking_show_phases — ArvoOS takip sayfasının görünüm ayarı
*/
export const ARVOOS_OZEL_KURUM_ALANLARI = ["revision_days", "tracking_show_phases"];

/*
  LİSANS SATIRININ KARŞIYA GİDEN ALANLARI.

  CANLI HATA (22.09.2026 → 13.10.2026): yukarıdaki kurum hatasının ikizi.
  Lisanslar `select("*")` ile okunup hedefe olduğu gibi yazılıyordu;
  20260922090245 ArvoOS'a integrated ve limits sütunlarını eklediği an
  ArvoARC ve ArvoRandevu'ya lisans yazımı düştü ("Could not find the
  'integrated' column of 'organization_product_licenses'") ve üç hafta
  boyunca yalnızca günlükte kaldı: askıya alma, yenileme, deneme bitişi
  karşıya geçmedi. Kurumlar ve üyelikler ayrı yazıldığı için geçiyordu.

  Okuma yine "*": köprünün kapsamı integrated'a bakıyor (kopruluMu).
  YAZMADAN önce satır bu listeye indiriliyor (lisansKopyasi).
*/
export const LISANS_KOPRU_ALANLARI = [
  "organization_id", "product", "status", "plan_code", "monthly_fee",
  "current_period_start", "current_period_end", "trial_ends_at",
  "suspended_at", "suspension_reason", "updated_by", "created_at", "updated_at",
];

/*
  ArvoOS'a özel lisans alanları — hedefte yok, gerek de yok:
    integrated — köprünün kendisi bunu okuyor (kapsam kararı ArvoOS'ta)
    limits     — ürün kotaları, ölçümü ArvoOS tarafında
*/
export const ARVOOS_OZEL_LISANS_ALANLARI = ["integrated", "limits"];

/** Lisans satırını hedefe yazılacak alanlara indirir. */
export function lisansKopyasi<T extends Record<string, unknown>>(satir: T): Record<string, unknown> {
  return Object.fromEntries(LISANS_KOPRU_ALANLARI.filter((alan) => alan in satir).map((alan) => [alan, satir[alan]]));
}
