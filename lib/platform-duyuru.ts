/*
  KONSOLDAN KURUMLARA DUYURU (02.11.2026) — saf kurallar. Ekran
  app/panel/platform/duyuru, testi tests/unit/platform-duyuru.test.ts.

  Bakım, yeni özellik ya da fiyat değişikliğini bütün kurumlara
  söylemenin yolu yoktu: kurucu kurum kurum e-posta yazıyordu. Duyuru
  her kurumun panel bildirimlerine düşer (kuruma yazılan satır, bütün
  üyeler görür — kişiye özel değil, AGENTS.md "satır KURUMA yazılır").

  Bildirim kategorisi "platform_duyurusu": kurumun kendi iç duyurusu
  (management_announcement) bağlantı taşımıyor ve "Gönderen: <personel>"
  yazıyor; bu ArvoOS'un duyurusu ve bir sayfaya yönlendirebilmeli.
*/

export const DUYURU_HEDEFLERI = [
  { kod: "tum", ad: "Bütün kurumlar" },
  { kod: "arvoos", ad: "ArvoOS kullanan kurumlar" },
  { kod: "arvolab", ad: "ArvoLab kullanan kurumlar" },
  { kod: "arc", ad: "ArvoARC kullanan kurumlar" },
  { kod: "randevu", ad: "ArvoCal kullanan kurumlar" },
] as const;
export type DuyuruHedefi = (typeof DUYURU_HEDEFLERI)[number]["kod"];

const ACIK = new Set(["active", "trialing", "past_due"]);

export type DuyuruKiracisi = { id: string; kind: string | null; license_status: string | null };
export type DuyuruLisansi = { organization_id: string; product: string; status: string };

/**
 * Duyurunun gideceği kurumlar. Arvo'nun kendi kurumu (kind = internal)
 * hiçbir hedefte yok: kurucu kendi duyurusunu kendi panelinde görmesin.
 * Ürün hedefinde lisansı AÇIK (aktif, deneme, ödemesi gecikmiş) olanlar;
 * iptal etmiş kuruma "yeni özellik" duyurusu gitmez. Grup markaları
 * kiracı oldukları için dâhil: duyuru onları da ilgilendiriyor.
 */
export function duyuruAlicilari(kiracilar: DuyuruKiracisi[], lisanslar: DuyuruLisansi[], hedef: DuyuruHedefi): string[] {
  const kiraci = kiracilar.filter((k) => k.kind !== "internal");
  if (hedef === "tum") return kiraci.map((k) => k.id);
  const acik = new Set(lisanslar.filter((l) => l.product === hedef && ACIK.has(l.status)).map((l) => l.organization_id));
  /* ArvoOS'un çekirdek lisansı kiracı kaydında; ek ürün tablosunda da olabilir. */
  return kiraci.filter((k) => acik.has(k.id) || (hedef === "arvoos" && ACIK.has(k.license_status ?? ""))).map((k) => k.id);
}

export type DuyuruGirdisi = { baslik: string; metin: string; baglanti: string | null; hedef: DuyuruHedefi };

/** Girdiyi denetler; hata varsa Türkçe mesajla fırlatır. */
export function duyuruDogrula(ham: { baslik: string; metin: string; baglanti: string; hedef: string }): DuyuruGirdisi {
  const baslik = ham.baslik.trim();
  const metin = ham.metin.trim();
  const baglanti = ham.baglanti.trim();
  if (baslik.length < 3 || baslik.length > 120) throw new Error("Başlık 3–120 karakter olmalı.");
  if (metin.length < 3 || metin.length > 2000) throw new Error("Metin 3–2000 karakter olmalı.");
  if (!DUYURU_HEDEFLERI.some((h) => h.kod === ham.hedef)) throw new Error("Hedef geçersiz.");
  /* Bağlantı yalnızca panel içi bir yol: bildirim listesi dışarıya
     yönlendirmiyor (notifications/feed.ts) ve kurucunun yanlış
     yapıştırdığı bir dış adres kurumların önüne düşmemeli. */
  if (baglanti && !/^\/panel(\/[\w\-./?=&%]*)?$/.test(baglanti)) throw new Error("Bağlantı panel içinde bir yol olmalı (ör. /panel/kilavuz).");
  return { baslik, metin, baglanti: baglanti || null, hedef: ham.hedef as DuyuruHedefi };
}
