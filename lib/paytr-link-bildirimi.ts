/*
  PAYTR LİNK BİLDİRİMİ — KAYIT SONRASI KARAR (10.11.2026, PR #313 son kontrol).

  app/api/paytr/callback imzayı doğruladıktan sonra buraya gelir. Modül
  hiçbir şey import etmiyor: veritabanı çağrısı, önceki olayın okunması ve
  PayTR'ye kapatma isteği BAĞIMLILIK olarak veriliyor. Rota gerçek
  Supabase/PayTR'yi, test (tests/db/paytr-link-bildirimi.test.mjs) gerçek
  veritabanı işlevlerini ve taklit bir PayTR'yi veriyor — yani test rotanın
  çalıştırdığı kararın AYNISINI sınıyor, kopyasını değil.

  Bağlantıyı PayTR'de kapatmak neden önemli: Link API bağlantısı
  kapatılmazsa müşteri aynı adresten yeniden ödeyebilir. Eskiden kapatma
  hatası yalnızca uyarı satırıydı ve PayTR'ye yine "OK" dönülüyordu:
  bağlantı açık kalıyor, kimse yeniden denemiyordu. Artık:

    - Kapatma başarısızsa PayTR'ye 503 dönülür. PayTR OK almayınca aynı
      bildirimi yeniden gönderir (mevcut mimari: "OK dönmezsek PayTR
      yeniden dener"); hata günlükte "[paytr] bağlantı kapatılamadı" ile
      izlenir.
    - Yeniden gelen bildirim veritabanında 'duplicate' döner: tahsilat ve
      lisans dönemi İKİNCİ KEZ UYGULANMAZ (tekillik merchant_oid'de).
      Kapatma yalnızca önceki olay GERÇEKTEN bu bağlantının başarılı
      tahsilatıysa yeniden denenir: aynı bağlantı, test değil, sonuç
      'recorded' ya da 'no_license'. Her 'duplicate' başarılı sayılmaz —
      eksik ödeme (amount_mismatch) gibi sonuçlarda bağlantı bilerek açık
      kalıyordu ve öyle kalır.
    - Ödenmiş bir bağlantıya FARKLI merchant_oid ile ikinci tahsilat
      gelirse veritabanı onu ayrı bir olay olarak işler (kaybolmaz, yok
      sayılmaz); burada günlüğe ayrıca uyarı yazılır.
*/

/** Para tahsil edilmiş sonuçlar: bağlantı PayTR'de kapatılmalı. */
export const TAHSIL_EDILMIS_SONUCLAR: ReadonlySet<string> = new Set(["recorded", "no_license"]);

export type OncekiOlay = { payment_link_id: string | null; result: string; test_mode: boolean } | null;

export type KapatmaKarari = { kapat: boolean; neden: string };

/** Bağlantı PayTR'de kapatılmalı mı? Saf karar; rota ve test aynı işlevi kullanır. */
export function baglantiKapatilmaliMi(sonuc: string | null, linkId: string, onceki: OncekiOlay): KapatmaKarari {
  if (sonuc !== null && TAHSIL_EDILMIS_SONUCLAR.has(sonuc)) return { kapat: true, neden: "tahsilat" };
  if (sonuc !== "duplicate") return { kapat: false, neden: `sonuç ${sonuc ?? "yok"}` };
  if (!onceki) return { kapat: false, neden: "önceki olay bulunamadı" };
  if (onceki.payment_link_id !== linkId) return { kapat: false, neden: "önceki olay başka bağlantıya ait" };
  if (onceki.test_mode) return { kapat: false, neden: "önceki olay test ödemesi" };
  if (!TAHSIL_EDILMIS_SONUCLAR.has(onceki.result)) return { kapat: false, neden: `önceki olay tahsil edilmiş değil (${onceki.result})` };
  return { kapat: true, neden: "yeniden deneme" };
}

export type LinkBildirimBagimliliklari = {
  /** arvo_record_paytr_payment çağrısı. */
  kaydet: () => Promise<{ sonuc: string | null; hata: string | null }>;
  /** Aynı merchant_oid'in daha önce yazılmış olayı (yalnızca 'duplicate' sonucunda sorulur). */
  oncekiOlay: () => Promise<{ olay: OncekiOlay; hata: string | null }>;
  /** Bağlantıyı PayTR'de kapatır; başarısızsa fırlatır. */
  kapat: () => Promise<void>;
  /** 'recorded' sonrası yan işler (AI kredisi, ürün köprüleri); kendi hatasını yutar. */
  tahsilatSonrasi: () => Promise<void>;
  hata: (...ayrinti: unknown[]) => void;
  uyari: (...ayrinti: unknown[]) => void;
};

export type LinkBildirimSonucu = {
  durum: 200 | 500 | 503;
  govde: string;
  sonuc: string | null;
  kapatma: "kapatildi" | "atlandi" | "basarisiz";
};

export async function linkBildiriminiIsle(
  girdi: { linkId: string; merchantOid: string; /** Kayıttan ÖNCE okunan bağlantı durumu. */ baglantiDurumu: string | null; payerOrganizationId: string | null },
  d: LinkBildirimBagimliliklari,
): Promise<LinkBildirimSonucu> {
  const { sonuc, hata } = await d.kaydet();
  if (hata) {
    d.hata("[paytr] ödeme kaydedilemedi", hata);
    return { durum: 500, govde: "record failed", sonuc: null, kapatma: "atlandi" }; // OK dönmüyoruz: PayTR yeniden dener
  }

  let onceki: OncekiOlay = null;
  if (sonuc === "duplicate") {
    const okuma = await d.oncekiOlay();
    // Doğrulanamayan tekrar başarılı SAYILMAZ; okuma geçiciyse PayTR yeniden dener.
    if (okuma.hata) {
      d.hata("[paytr] tekrarlanan bildirimin önceki olayı okunamadı", girdi.merchantOid, okuma.hata);
      return { durum: 503, govde: "try again", sonuc, kapatma: "atlandi" };
    }
    onceki = okuma.olay;
  }

  if (sonuc !== null && TAHSIL_EDILMIS_SONUCLAR.has(sonuc) && girdi.baglantiDurumu === "paid") {
    d.uyari("[paytr] zaten ödenmiş bağlantıya ikinci tahsilat (farklı merchant_oid); ayrı ödeme olarak işlendi", girdi.linkId, girdi.merchantOid, sonuc);
  }
  if (sonuc === "no_license") {
    d.hata("[paytr] tahsil edildi, lisans kaydı yok; Platform → Ödemeler'den yeniden işlenmeli", girdi.payerOrganizationId, girdi.merchantOid);
  }
  if (sonuc === "recorded") await d.tahsilatSonrasi();

  const karar = baglantiKapatilmaliMi(sonuc, girdi.linkId, onceki);
  if (!karar.kapat) return { durum: 200, govde: "OK", sonuc, kapatma: "atlandi" };
  try {
    await d.kapat();
    return { durum: 200, govde: "OK", sonuc, kapatma: "kapatildi" };
  } catch (kapatmaHatasi) {
    d.hata(
      "[paytr] bağlantı kapatılamadı; PayTR bildirimi yeniden gönderecek",
      girdi.linkId, girdi.merchantOid, karar.neden,
      kapatmaHatasi instanceof Error ? kapatmaHatasi.message : kapatmaHatasi,
    );
    return { durum: 503, govde: "link close failed", sonuc, kapatma: "basarisiz" };
  }
}
