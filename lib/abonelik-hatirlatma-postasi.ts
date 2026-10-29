import { htmlKacis } from "./posta-imza";

/*
  ABONELİK HATIRLATMA E-POSTASI (29.10.2026, konsol müşteri listesinin
  toplu işlemi) — saf.

  Kurucu birkaç müşteriyi seçip "dönem sonunuz yaklaşıyor / geçti"
  hatırlatmasını tek seferde gönderiyor. WhatsApp hatırlatması
  (Abonelikler → Dönem sonu yaklaşanlar) tek tek ve onaylı şablonla
  gidiyor; bu ise e-posta, bütün ürünleri tek mektupta topluyor.

  HTML ile düz metin aynı içerik, aynı sırada; her değer htmlKacis'tan
  geçiyor (AGENTS.md).
*/
export type HatirlatmaKalemi = {
  urunAdi: string;
  /** Dönem ya da deneme sonu, YYYY-AA-GG. */
  bitis: string;
  deneme: boolean;
  /** KDV dahil aylık tutar (kuruş); bilinmiyorsa null. */
  tutar: number | null;
};

const GUN = 86_400_000;
const gunYazisi = (gun: string) => gun.split("-").reverse().join(".");
const para = (kurus: number) => new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY" }).format(kurus / 100);

export function kalemCumlesi(k: HatirlatmaKalemi, bugun: string): string {
  const kalan = Math.round((Date.parse(`${k.bitis}T00:00:00Z`) - Date.parse(`${bugun}T00:00:00Z`)) / GUN);
  const ne = k.deneme ? `${k.urunAdi} deneme süreniz` : `${k.urunAdi} aboneliğinizin dönemi`;
  const ne_zaman = kalan < 0 ? `${gunYazisi(k.bitis)} tarihinde sona erdi` : kalan === 0 ? "bugün sona eriyor"
    : kalan === 1 ? "yarın sona eriyor" : `${gunYazisi(k.bitis)} tarihinde (${kalan} gün sonra) sona eriyor`;
  return `${ne} ${ne_zaman}${k.tutar ? ` · aylık ${para(k.tutar)} (KDV dahil)` : ""}.`;
}

export function hatirlatmaPostasi(g: { muhatap: string | null; kalemler: HatirlatmaKalemi[]; adres: string; bugun: string; satici: string }): { konu: string; metin: string; html: string } {
  const gecmis = g.kalemler.some((k) => Math.round((Date.parse(`${k.bitis}T00:00:00Z`) - Date.parse(`${g.bugun}T00:00:00Z`)) / GUN) < 0);
  const konu = gecmis ? "Abonelik döneminiz sona erdi" : "Abonelik döneminiz yaklaşıyor";
  const selam = g.muhatap ? `Merhaba ${g.muhatap},` : "Merhaba,";
  const cumleler = g.kalemler.map((k) => kalemCumlesi(k, g.bugun));
  const kapanis = "Kesintisiz devam için ödemenizi abonelik sayfanızdan kartla ya da havale ile yapabilirsiniz.";
  const metin = [selam, "", ...cumleler.map((c) => `• ${c}`), "", kapanis, g.adres, "", g.satici].join("\n");
  const h = htmlKacis;
  const html = `<!doctype html><html lang="tr"><body style="margin:0;padding:24px;background:#f4f5f7;font-family:Arial,Helvetica,sans-serif;color:#1d2433">
<table role="presentation" width="100%" style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;padding:24px" cellpadding="0" cellspacing="0"><tr><td>
<p style="margin:0 0 12px">${h(selam)}</p>
<ul style="margin:0 0 16px;padding-left:18px">${cumleler.map((c) => `<li style="margin:4px 0">${h(c)}</li>`).join("")}</ul>
<p style="margin:0 0 16px">${h(kapanis)}</p>
<p style="margin:0 0 20px"><a href="${h(g.adres)}" style="display:inline-block;padding:10px 18px;border-radius:8px;background:#1f3a5f;color:#ffffff;text-decoration:none;font-weight:600">Abonelik sayfasını aç</a></p>
<p style="margin:0;color:#5b6472">${h(g.satici)}</p>
</td></tr></table></body></html>`;
  return { konu, metin, html };
}
