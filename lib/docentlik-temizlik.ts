/*
  SAHİPSİZ DOÇENTLİK BELGESİ TEMİZLİĞİ — SAF KARARLAR (F6 PR8).

  Cron rotası (app/api/cron/docentlik-belge-temizligi) ve veritabanı işlevleri
  (20261115145234 → docentlik_temizlik_al/onayla/sonuc) işi yapıyor; burada
  yalnızca Supabase'e dokunmayan kurallar var, birim testli:

  - GÜNLÜĞE YOL YAZILMAZ. Nesne yolu kurum/kişi/faaliyet kimliklerini
    taşıyor; hata metni Storage'dan gelirken yolu içerebiliyor. Günlüğe ve
    deneme kaydına giden her metin yoldan arındırılıyor; kimlik olarak
    yalnızca storage.objects satırının kimliği (nesne_id) kullanılıyor.
  - YALNIZCA BU KOVA, YALNIZCA DOÇENTLİK YOLU. Silinecek ad, veritabanı
    işlevinin döndürdüğü ve biçimi doğrulanmış bir doçentlik yolu
    olmalı; değilse silme hiç denenmez (ikinci kat).
  - SONUÇ. Hiç başarısızlık yoksa "tamam", varsa "eksik": işin kendisi
    çalıştı ama bazı nesneler bir sonraki tura kaldı (geri çekilmeli
    yeniden deneme veritabanında).
*/
export const TEMIZLIK_KOVASI = "docentlik-belgeleri";
export const TEMIZLIK_ESIGI = "24 hours";
export const TEMIZLIK_TUR_SINIRI = 100;

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const DOCENTLIK_YOLU = new RegExp(`^${UUID}/(faaliyet/${UUID}/${UUID}|uak/${UUID})/${UUID}\\.pdf$`);

/** Silinmesine izin verilen tek biçim: doçentlik faaliyet ya da ÜAK belgesi. */
export function silinebilirYolMu(ad: unknown): ad is string {
  return typeof ad === "string" && DOCENTLIK_YOLU.test(ad);
}

/** Günlüğe ve deneme kaydına gidecek hata metni: yol ve kimlik parçaları ayıklanır, 200 karakter. */
export function guvenliHataMetni(hata: unknown): string {
  const ham = hata instanceof Error ? hata.message : typeof hata === "string" ? hata : (hata as { message?: string } | null)?.message ?? "bilinmeyen hata";
  return ham
    .replace(new RegExp(`${UUID}(/[^\\s"']*)?`, "gi"), "[yol]")
    .replace(/[\w.-]+\.pdf/gi, "[dosya]")
    .slice(0, 200) || "bilinmeyen hata";
}

export type TemizlikSayaci = { aday: number; silinen: number; atlanan: number; basarisiz: number };

export function temizlikSonucu(s: TemizlikSayaci): "tamam" | "eksik" {
  return s.basarisiz > 0 ? "eksik" : "tamam";
}
