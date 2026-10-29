import { timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { todayInIstanbul } from "@/lib/istanbul-date";
import { otomatikProformaKos } from "@/lib/otomatik-proforma-isi";
import { cronRotasi, type CronKosusu } from "@/lib/cron-kaydi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/*
  OTOMATİK PROFORMA (29.10.2026). Her sabah (zamanlama vercel.json'da):
  dönem sonuna üç gün kalan aboneliklerin proformasını keser ve
  yetkiliye e-postayla gönderir; dünden gönderilemeyen kalmışsa yeniden
  dener. Kural ve kapsam lib/otomatik-proforma.ts ile
  lib/otomatik-proforma-isi.ts'in başında.
*/
function yetkili(istek: Request) {
  const sir = process.env.CRON_SECRET;
  const baslik = istek.headers.get("authorization") ?? "";
  if (!sir || !baslik.startsWith("Bearer ")) return false;
  const beklenen = Buffer.from(sir);
  const gelen = Buffer.from(baslik.slice("Bearer ".length));
  return beklenen.length === gelen.length && timingSafeEqual(beklenen, gelen);
}

export async function GET(istek: Request) {
  if (!yetkili(istek)) return Response.json({ hata: "yetkisiz" }, { status: 401 });
  return cronRotasi("/api/cron/otomatik-proforma", kosu);
}

async function kosu(): Promise<CronKosusu> {
  const admin = createAdminClient();
  if (!admin) return {
    yanit: Response.json({ hata: "sunucu anahtarı yok" }, { status: 500 }),
    sonuc: "hata", ayrinti: { hata: "sunucu anahtarı yok" },
  };
  try {
    const s = await otomatikProformaKos(admin, todayInIstanbul());
    /* Gönderilemeyen proforma "eksik": belge kesildi, müşteri panelinde
       görüyor, ama posta gitmedi ve kurucu bakmalı. */
    const eksik = s.hatalar.length > 0 || s.gonderilemeyen.length > 0;
    const ayrinti = { aday: s.aday, kesilen: s.kesilen.length, gonderilen: s.gonderilen, bildirilen: s.bildirilen, gonderilemeyen: s.gonderilemeyen.length, atlanan: s.atlanan, hata: [...s.hatalar, ...s.gonderilemeyen.map((g) => `${g.no}: ${g.hata}`)].slice(0, 5) };
    return { yanit: Response.json(ayrinti), sonuc: eksik ? "eksik" : "tamam", ayrinti };
  } catch (hata) {
    const mesaj = hata instanceof Error ? hata.message : String(hata);
    console.error("[otomatik-proforma] koşu düştü", mesaj);
    return { yanit: Response.json({ hata: mesaj }, { status: 500 }), sonuc: "hata", ayrinti: { hata: mesaj } };
  }
}
