/*
  BİR DÖNEMİN BEKLENEN TUTARI (14.10.2026) — saf kural.

  Kiracının bir aylık dönem için ödemesi gereken tutar üç yerde ayrı ayrı
  hesaplanıyordu: kart ödeme bağlantısı (lib/license-checkout), yenileme
  hatırlatması (app/api/cron/abonelik-hatirlatma) ve — hiç — havale
  onayında. Havale onayı kiracının YAZDIĞI tutar ve paketle lisansı bir
  ay uzatıyordu; 5.990 TL'lik pakete 1.990 TL bildirip onaylatmak
  mümkündü ve hiçbir ekran farkı göstermiyordu.

  Kural: ArvoOS'ta paket ücreti + dahil sayıyı aşan her ETKİN kullanıcı
  için ek kullanıcı birim bedeli; öteki ürünlerde ürün lisansının aylık
  ücreti (koltuk kavramı yok). Birim testi tests/unit/abonelik-tutari.test.ts.
*/
import { ekKullaniciSayisi, ekKullaniciUcretiKurus } from "./kota-durumu";
import { paraBirimiCoz, paraYaz, tutar as paraTutari, type ParaBirimi } from "./para";

export function donemTutari(girdi: {
  urun: string;
  aylikUcret: number | null | undefined;
  aktifKullanici?: number | null;
  kullaniciLimiti?: number | null;
  ekKullaniciUcreti?: number | null;
}): { tutar: number; ekKoltuk: number } {
  const paket = Math.max(0, Number(girdi.aylikUcret ?? 0));
  if (girdi.urun !== "arvoos") return { tutar: paket, ekKoltuk: 0 };
  const aktif = Number(girdi.aktifKullanici ?? 0);
  return {
    tutar: paket + ekKullaniciUcretiKurus(aktif, girdi.kullaniciLimiti ?? null, girdi.ekKullaniciUcreti ?? 0),
    ekKoltuk: ekKullaniciSayisi(aktif, girdi.kullaniciLimiti ?? null),
  };
}

/**
 * Havale bildiriminin beklenenle karşılaştırması: onaydan önce kurucuya
 * gösterilecek farklar. Boş liste = bildirim beklenenle uyumlu.
 *
 * Fark HATA DEĞİL — eksik/fazla ödeme, pazarlık, birden çok ayın tek
 * havalesi olabilir — ama onay lisansı BİLDİRİLEN paketle bir ay
 * uzattığı için kurucu farkı görerek onaylamalı.
 */
export type HavaleFarki = {
  /*
    TÜR, BAŞLIĞI BELİRLER (27.11.2026 ara kontrolü). Üç hâl aynı
    başlıkla ("Beklenenle uyuşmuyor") gösteriliyordu; oysa beklenen
    ücret HİÇ GİRİLMEMİŞSE karşılaştırılacak iki tutar yok —
    "uyuşmuyor" demek, olmayan bir karşılaştırmayı iddia etmek ve
    kurucuyu var olmayan bir farkı aramaya göndermek.
  */
  tur: "dogrulanamadi" | "tutar" | "paket" | "para_birimi";
  metin: string;
};

export function havaleFarklari(girdi: {
  bildirilenTutar: number;
  beklenenTutar: number | null;
  bildirilenPaket: string | null;
  mevcutPaket: string | null;
  /*
    PARA BİRİMLERİ 28.11.2026'da eklendi. Verilmezse ikisi de TRY
    sayılıyor: 28.11.2026 öncesindeki her bildirim TRY'ydi ve o
    kayıtların karşılaştırması değişmemeli. Ama YENİ bir bildirimde
    birim boş gelirse bu bir veri eksiği, varsayım değil — çağıran
    tarafta (ödeme onayı) açıkça yazılıyor.
  */
  bildirilenParaBirimi?: string | null;
  beklenenParaBirimi?: string | null;
}): HavaleFarki[] {
  const farklar: HavaleFarki[] = [];
  const bildirilenBirim: ParaBirimi = paraBirimiCoz(girdi.bildirilenParaBirimi) ?? "TRY";
  const beklenenBirim: ParaBirimi = paraBirimiCoz(girdi.beklenenParaBirimi) ?? bildirilenBirim;
  const tl = (kurus: number, birim: ParaBirimi = bildirilenBirim) => paraYaz(paraTutari(kurus, birim));

  /*
    PARA BİRİMİ UYUŞMAZLIĞI TUTARDAN ÖNCE GELİYOR: 100 USD ile 100 TRY
    "tutar aynı" değildir ve rakamları karşılaştırmak yanıltıcı olur.
    Bu fark görünürken onay verilirse lisans yanlış bedelle açılır.
  */
  if (bildirilenBirim !== beklenenBirim) {
    farklar.push({
      tur: "para_birimi",
      metin: `Para birimi uyuşmuyor: bildirim ${bildirilenBirim}, beklenen ${beklenenBirim}. Tutarlar karşılaştırılamaz.`,
    });
    if (girdi.bildirilenPaket && girdi.mevcutPaket && girdi.bildirilenPaket !== girdi.mevcutPaket) {
      farklar.push({ tur: "paket", metin: `Bildirimdeki paket (${girdi.bildirilenPaket}) kiracının mevcut paketinden (${girdi.mevcutPaket}) farklı; onay lisansı bildirimdeki pakete geçirir.` });
    }
    return farklar;
  }

  if (!girdi.beklenenTutar) {
    farklar.push({ tur: "dogrulanamadi", metin: "Kiracının bu ürün için aylık ücreti girilmemiş; bildirilen tutar karşılaştırılamıyor." });
  } else if (girdi.bildirilenTutar !== girdi.beklenenTutar) {
    const yon = girdi.bildirilenTutar < girdi.beklenenTutar ? "eksik" : "fazla";
    farklar.push({ tur: "tutar", metin: `Bildirilen ${tl(girdi.bildirilenTutar)}, beklenen ${tl(girdi.beklenenTutar, beklenenBirim)} (${tl(Math.abs(girdi.bildirilenTutar - girdi.beklenenTutar))} ${yon}).` });
  }
  if (girdi.bildirilenPaket && girdi.mevcutPaket && girdi.bildirilenPaket !== girdi.mevcutPaket) {
    farklar.push({ tur: "paket", metin: `Bildirimdeki paket (${girdi.bildirilenPaket}) kiracının mevcut paketinden (${girdi.mevcutPaket}) farklı; onay lisansı bildirimdeki pakete geçirir.` });
  }
  return farklar;
}

/**
 * Uyarı başlığı. İki tutar KARŞILAŞTIRILABİLİYOR ve farklıysa
 * "uyuşmuyor"; beklenen ücret hiç girilmemişse "doğrulanamadı".
 * İkisi birden olamaz (biri ötekini dışlıyor), paket farkı tek
 * başına kaldığında da kendi başlığını alıyor.
 */
export function havaleUyariBasligi(farklar: readonly HavaleFarki[]): string | null {
  if (!farklar.length) return null;
  /* Para birimi farkı en ağırı: tutarlar karşılaştırılabilir bile
     değil, onay lisansı yanlış bedelle açar. */
  if (farklar.some((f) => f.tur === "para_birimi")) return "Para birimi uyuşmuyor.";
  if (farklar.some((f) => f.tur === "tutar")) return "Beklenen tutarla uyuşmuyor.";
  if (farklar.some((f) => f.tur === "dogrulanamadi")) return "Beklenen tutar doğrulanamadı.";
  return "Bildirim kiracının kaydından farklı.";
}

/** Düz metin listesi: sunucu işleminin hata mesajı ve onay penceresi için. */
export function farkMetinleri(farklar: readonly HavaleFarki[]): string[] {
  return farklar.map((f) => f.metin);
}
