/*
  ÖDENMİŞ AMA YÜKLENMEMİŞ AI KREDİSİ (14.10.2026).

  Akış şöyle kopuyordu: müşteri krediyi satın alıyor, PayTR ödemeyi
  bildiriyor, ArvoOS krediyi ArvoLab'a yüklemeye çalışıyor. ArvoLab'a o
  anda ulaşılamazsa yükleme düşüyor ve PayTR'ye yine OK dönülüyor —
  dönmemek bildirimin tekrarlanmasına yol açardı ve ödeme zaten
  kaydedildi. Geriye `ai_credit_orders.loaded_at`'i boş bir satır
  kalıyor; callback'in yorumu bunu "para alındı ama kredi yüklenmedi"
  diye tarif ediyor ve "elle yüklenebilir" diyor.

  AMA O SATIRI OKUYAN HİÇBİR ŞEY YOKTU. Ne bir ekran, ne bir uyarı, ne
  bir yeniden deneme. Müşteri parasını ödüyor, kredisi gelmiyor ve
  asistanda "Kurumunuzun AI kredisi bitti" duvarına çarpıyor —
  kurucunun bundan haberi olmuyor. Para kaybolmuyor ama müşteri
  ödediğini alamıyor; bu, kaybolmaktan daha kötü.

  YENİDEN DENEME GÜVENLİ. ArvoLab yüklemeyi ÖDEMENİN KİMLİĞİYLE
  (PayTR merchant_oid) tekilleştiriyor: aynı kaynakla ikinci kez kredi
  eklemiyor (lib/arvolab arvolabKrediYukle). Bu yüzden ÖZGÜN kimlikle
  deniyoruz, yeni bir anahtar üretmiyoruz — dar ama gerçek bir aralık
  var: yükleme başarılı olup ardından `loaded_at` yazımı düşerse satır
  boş kalır, kredi ise yüklenmiştir. Yeni bir anahtarla denemek o
  müşteriye krediyi İKİ KEZ verirdi; özgün kimlik ArvoLab tarafında
  eleniyor ve satır yalnızca işaretleniyor.

  ÖDENMEMİŞ SİPARİŞ SORUN DEĞİL. Sipariş kaydı ödeme bağlantısıyla
  birlikte, ödemeden ÖNCE yazılıyor (lib/ai-kredi-checkout): müşteri
  bağlantıyı açıp vazgeçerse satır loaded_at'siz kalır ve bu olağan.
  Ayıraç ödeme olayının kendisi: yalnızca `result = 'recorded'` bir
  PayTR olayı olan sipariş "ödendi" sayılıyor — merchant_oid de zaten
  oradan geliyor.
*/
import type { SupabaseClient } from "@supabase/supabase-js";
import { arvolabKrediYukle } from "./arvolab";

export type BekleyenKredi = {
  siparisId: string;
  organizationId: string;
  kredi: number;
  /** Ödemenin kimliği; yeniden denemenin tekilleştirme anahtarı. */
  merchantOid: string;
  odendiAt: string;
};

export type KrediSiparisi = { id: string; organization_id: string; kredi: number; payment_link_id: string };
export type KrediOdemesi = { payment_link_id: string; merchant_oid: string; received_at: string };

/*
  Siparişi ödemesiyle eşleştirir. Saf; testi
  tests/unit/ai-kredi-yukleme.test.ts.

  ÖDEMESİ OLMAYAN SİPARİŞ ELENİYOR: sipariş satırı ödeme bağlantısıyla
  birlikte, ödemeden ÖNCE yazılıyor. Müşteri bağlantıyı açıp vazgeçerse
  satır loaded_at'siz kalır ve bu olağan — onu "para alındı, kredi
  yüklenmedi" saymak, kurucuyu her vazgeçen müşteri için uyandırırdı.

  AYNI BAĞLANTIYA BİRDEN ÇOK OLAY GELEBİLİYOR (PayTR bildirimi
  tekrarlanabiliyor): en ESKİSİ asıl ödeme ve tekilleştirme anahtarı o.
  Sonrakini seçmek, ArvoLab'ın ilk yüklemede kullandığı kimlikten farklı
  bir anahtarla denemek demekti — yani krediyi ikinci kez vermek.
*/
export function krediEslestir(siparisler: KrediSiparisi[], olaylar: KrediOdemesi[]): BekleyenKredi[] {
  const odeme = new Map<string, { merchantOid: string; receivedAt: string }>();
  for (const o of olaylar) {
    const onceki = odeme.get(o.payment_link_id);
    if (!onceki || o.received_at < onceki.receivedAt) odeme.set(o.payment_link_id, { merchantOid: o.merchant_oid, receivedAt: o.received_at });
  }
  return siparisler
    .flatMap((s) => {
      const o = odeme.get(s.payment_link_id);
      return o ? [{ siparisId: s.id, organizationId: s.organization_id, kredi: Number(s.kredi), merchantOid: o.merchantOid, odendiAt: o.receivedAt }] : [];
    })
    .sort((a, b) => a.odendiAt.localeCompare(b.odendiAt));
}

/**
 * Ödemesi kaydedilmiş ama ArvoLab'a yüklenememiş krediler, eskiden yeniye.
 *
 * `admin` service_role istemcisi olmalı: sipariş ve ödeme olayları
 * kiracıya kapalı.
 */
export async function bekleyenKrediler(admin: SupabaseClient): Promise<BekleyenKredi[]> {
  /* Okuma bilerek SINIRSIZ: yüklenememiş sipariş sayısı normalde sıfır,
     arıza anında birkaç tane. Sınır koymak, sınıra ulaşıldığı gün bir
     müşterinin kredisini sessizce dışarıda bırakırdı. */
  const { data: siparisler, error } = await admin
    .from("ai_credit_orders")
    .select("id,organization_id,kredi,payment_link_id")
    .is("loaded_at", null);
  if (error) throw new Error("Kredi siparişleri okunamadı: " + error.message);
  const satirlar = (siparisler ?? []) as KrediSiparisi[];
  if (!satirlar.length) return [];

  const { data: olaylar, error: olayHatasi } = await admin
    .from("payment_provider_events")
    .select("payment_link_id,merchant_oid,received_at")
    .in("payment_link_id", satirlar.map((s) => s.payment_link_id))
    .eq("result", "recorded");
  if (olayHatasi) throw new Error("Ödeme olayları okunamadı: " + olayHatasi.message);

  return krediEslestir(satirlar, (olaylar ?? []) as KrediOdemesi[]);
}

export type YuklemeSonucu = {
  denenen: number;
  yuklenen: number;
  /** Hâlâ yüklenemeyenler; kurucuya bunlar bildiriliyor. */
  kalanlar: BekleyenKredi[];
};

/**
 * Bekleyen kredileri ArvoLab'a yüklemeyi yeniden dener.
 *
 * Bir siparişin düşmesi ötekileri durdurmuyor: ArvoLab'a ulaşılamıyorsa
 * hepsi düşecek zaten, ama tek bir kurumun kaydıyla ilgili bir hata
 * yüzünden ötekilerin krediyi beklemesi için sebep yok.
 */
export async function bekleyenKredileriYukle(admin: SupabaseClient): Promise<YuklemeSonucu> {
  const bekleyen = await bekleyenKrediler(admin);
  const kalanlar: BekleyenKredi[] = [];
  let yuklenen = 0;

  for (const kayit of bekleyen) {
    const sonuc = await arvolabKrediYukle(kayit.organizationId, kayit.kredi, kayit.merchantOid);
    if (sonuc !== "loaded") { kalanlar.push(kayit); continue; }
    const { error } = await admin.from("ai_credit_orders")
      .update({ loaded_at: new Date().toISOString() }).eq("id", kayit.siparisId);
    if (error) {
      /* Kredi YÜKLENDİ ama işaret yazılamadı. Sipariş bir sonraki turda
         yine denenecek ve ArvoLab özgün kimlikle ikinci kez yüklemeyeceği
         için müşteri fazladan kredi almayacak — o yüzden burada
         "yüklendi" saymıyoruz, kalanlara koyuyoruz. */
      console.error("[ai-kredi] yükleme işareti yazılamadı", kayit.siparisId, error.message);
      kalanlar.push(kayit);
      continue;
    }
    yuklenen += 1;
  }

  return { denenen: bekleyen.length, yuklenen, kalanlar };
}
