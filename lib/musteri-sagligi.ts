/*
  MÜŞTERİ SAĞLIĞI (02.11.2026) — saf. Konsolun Müşteriler listesi ve
  müşteri kartı; testi tests/unit/musteri-sagligi.test.ts.

  Bir müşterinin durumu dört ayrı ekrana dağılmıştı: kullanım
  (Müşteriler listesinin Kullanıcı sütunu), ödeme gecikmesi (lisans
  rozeti), bekleyen destek (Destek kuyruğu) ve yenileme (Yenileme
  takvimi). "Bu hafta kimle konuşmalıyım" sorusu dört ekranı birlikte
  okumayı istiyordu. Sağlık hepsini tek göstergede topluyor ve NEDENİNİ
  yazıyor — gerekçesiz bir "riskli" rozeti kurucuyu yine o dört ekrana
  gönderirdi.

  Puan değil üç seviye: "72 puan" ne yapılacağını söylemiyor, "Riskli ·
  ödeme gecikti" söylüyor. Erişimi kapalı (iptal, askı) müşteride
  hesaplanmıyor; onun durumu zaten kendi rozetinde.
*/
import type { EtkinlikHali } from "./musteri-etkinligi";

export type SaglikSeviyesi = "iyi" | "izlenmeli" | "riskli";
export type SaglikGirdisi = {
  /** null: etkinlik ölçülemiyor (ArvoOS lisansı yok ya da okunamadı). */
  etkinlik: EtkinlikHali | null;
  odemeGecikmis: boolean;
  yanitBekleyenDestek: number;
  /** 24 saattir yanıtsız talepler (lib/destek-kuyrugu gecikmisMi). */
  gecikenDestek: number;
  /** En yakın yenilemeye kalan gün; geçmişse eksi; bilinmiyorsa null. */
  yenilemeGun: number | null;
};

export const SAGLIK_ADI: Record<SaglikSeviyesi, string> = { iyi: "İyi", izlenmeli: "İzlenmeli", riskli: "Riskli" };
export const SAGLIK_TONU: Record<SaglikSeviyesi, string> = { iyi: "success", izlenmeli: "warning", riskli: "danger" };

export function musteriSagligi(g: SaglikGirdisi): { seviye: SaglikSeviyesi; nedenler: string[] } {
  const riskli: string[] = [];
  const izle: string[] = [];
  const yakin = g.yenilemeGun !== null && g.yenilemeGun <= 30;

  if (g.odemeGecikmis) riskli.push("ödeme gecikti");
  if (g.etkinlik === "sessiz" && yakin) riskli.push("yenileme yakın, panel kullanılmıyor");
  else if (g.etkinlik === "sessiz") izle.push("panel kullanılmıyor");
  else if (g.etkinlik === "azaliyor") izle.push("kullanım azaldı");
  if (g.gecikenDestek) riskli.push(`${g.gecikenDestek} destek talebi 1 günden uzun yanıtsız`);
  else if (g.yanitBekleyenDestek) izle.push(`${g.yanitBekleyenDestek} destek talebi yanıt bekliyor`);
  if (g.yenilemeGun !== null && g.yenilemeGun <= 7 && !g.odemeGecikmis) izle.push(g.yenilemeGun < 0 ? "dönem sonu geçti" : `yenilemeye ${g.yenilemeGun} gün`);

  if (riskli.length) return { seviye: "riskli", nedenler: [...riskli, ...izle] };
  if (izle.length) return { seviye: "izlenmeli", nedenler: izle };
  return { seviye: "iyi", nedenler: [] };
}

/** Sıralama: riskli önce. */
export const SAGLIK_SIRASI: Record<SaglikSeviyesi, number> = { riskli: 0, izlenmeli: 1, iyi: 2 };
