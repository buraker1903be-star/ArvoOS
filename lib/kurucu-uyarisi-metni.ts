/*
  KURUCUYA ANINDA UYARI E-POSTASI — metin (02.11.2026), saf. Gönderim
  lib/kurucu-uyarisi.ts, testi tests/unit/kurucu-uyarisi-metni.test.ts.

  Kurumun dekont göndermesi ve acil/yüksek öncelikli destek talebi
  kurucuya yalnızca konsolun ziline ve dock rozetine düşüyordu: konsol
  açık değilken saatlerce görülmüyordu, oysa ikisi de "bugün bakılmalı"
  işi (dekont onaylanmadan lisans açılmıyor).

  HTML ile düz metin aynı içerik ve sıra; her değer htmlKacis'tan geçiyor
  (AGENTS.md: gövdeyi müşteri yazıyor, kaçırılmayan "<" cümleyi yutar).
*/
import { htmlKacis } from "./posta-imza";

export type UyariSatiri = [etiket: string, deger: string | null | undefined];

export function kurucuUyariPostasi(g: { baslik: string; satirlar: UyariSatiri[]; not?: string | null; adres: string; dugme: string }): { konu: string; metin: string; html: string } {
  const satirlar = g.satirlar.filter((s): s is [string, string] => Boolean(s[1] && String(s[1]).trim()));
  const konu = `[Konsol] ${g.baslik}`;
  const metin = [g.baslik, "", ...satirlar.map(([e, d]) => `${e}: ${d}`), ...(g.not ? ["", g.not] : []), "", `${g.dugme}: ${g.adres}`].join("\n");
  const h = htmlKacis;
  const tablo = satirlar.map(([e, d]) => `<tr><td style="padding:4px 12px 4px 0;color:#5b6472;white-space:nowrap;vertical-align:top">${h(e)}</td><td style="padding:4px 0">${h(d)}</td></tr>`).join("");
  const not = g.not ? `<p style="margin:12px 0 0;padding:10px 12px;background:#f4f5f7;border-radius:8px;white-space:pre-wrap">${h(g.not)}</p>` : "";
  const html = `<!doctype html><html lang="tr"><body style="margin:0;padding:24px;background:#f4f5f7;font-family:Arial,Helvetica,sans-serif;color:#1d2433">
<table role="presentation" width="100%" style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;padding:24px" cellpadding="0" cellspacing="0"><tr><td>
<p style="margin:0 0 4px;color:#5b6472;font-size:12px;letter-spacing:.06em">KURUCU KONSOLU</p>
<h1 style="margin:0 0 16px;font-size:20px">${h(g.baslik)}</h1>
<table role="presentation" cellpadding="0" cellspacing="0" style="font-size:14px">${tablo}</table>
${not}
<p style="margin:20px 0 0"><a href="${h(g.adres)}" style="display:inline-block;padding:10px 18px;border-radius:8px;background:#1f3a5f;color:#ffffff;text-decoration:none;font-weight:600">${h(g.dugme)}</a></p>
</td></tr></table></body></html>`;
  return { konu, metin, html };
}
