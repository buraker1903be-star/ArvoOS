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
export function havaleFarklari(girdi: {
  bildirilenTutar: number;
  beklenenTutar: number | null;
  bildirilenPaket: string | null;
  mevcutPaket: string | null;
}): string[] {
  const farklar: string[] = [];
  const tl = (kurus: number) => new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 2 }).format(kurus / 100);
  if (!girdi.beklenenTutar) {
    farklar.push("Kiracının bu ürün için aylık ücreti girilmemiş; tutar doğrulanamıyor.");
  } else if (girdi.bildirilenTutar !== girdi.beklenenTutar) {
    const yon = girdi.bildirilenTutar < girdi.beklenenTutar ? "eksik" : "fazla";
    farklar.push(`Bildirilen ${tl(girdi.bildirilenTutar)}, beklenen ${tl(girdi.beklenenTutar)} (${tl(Math.abs(girdi.bildirilenTutar - girdi.beklenenTutar))} ${yon}).`);
  }
  if (girdi.bildirilenPaket && girdi.mevcutPaket && girdi.bildirilenPaket !== girdi.mevcutPaket) {
    farklar.push(`Bildirimdeki paket (${girdi.bildirilenPaket}) kiracının mevcut paketinden (${girdi.mevcutPaket}) farklı; onay lisansı bildirimdeki pakete geçirir.`);
  }
  return farklar;
}
