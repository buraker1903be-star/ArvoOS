import { cookies } from "next/headers";
import { getPanelContextErisimdenBagimsiz } from "@/lib/panel-context";
import { firstForwardedIp } from "@/app/_components/request-origin";

/*
  ÇEVRİMİÇİ SİNYALİ (22.10.2026, hız çalışması).

  Eskiden sunucu işlemiydi (app/panel/presence-actions.ts). Next sunucu
  işlemlerini SIRAYLA çalıştırıyor: sayfa açılır açılmaz basılan bir
  düğme, bu sinyalin beş ardışık veritabanı turunu (~850 ms) bekliyordu.
  Ayrı bir uç olduğunda sıraya girmiyor; iş de tek işlevde, tek turda
  (arvo_varlik_kaydet, 20261022130643). Bağlam React cache'li; aynı
  istekte bir kez kurulur.

  Erişimi kapatılmış kurumda da yazar (getPanelContextErisimdenBagimsiz):
  oturum kaydı yönetimin kaydı, kilit ekranında geçen süre de orada olmalı.
  Yanıt gövdesi yok; istemci sonuca bakmıyor.
*/
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const OTURUM_CEREZI = "arvo_presence_session";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(istek: Request) {
  let yol = "/panel";
  try {
    const govde = (await istek.json()) as { yol?: unknown };
    if (typeof govde.yol === "string" && govde.yol.startsWith("/")) yol = govde.yol.slice(0, 300);
  } catch {
    /* gövdesiz sinyal de geçerli */
  }

  /* Oturum yoksa bağlam /login'e yönlendirmek ister; uçta bu bir hata değil, sessiz 204. */
  const baglam = await getPanelContextErisimdenBagimsiz().catch(() => null);
  if (!baglam) return new Response(null, { status: 204 });
  const { supabase, membership } = baglam;

  const cerezler = await cookies();
  const onceki = cerezler.get(OTURUM_CEREZI)?.value ?? "";
  const h = istek.headers;
  const { data, error } = await supabase.rpc("arvo_varlik_kaydet", {
    p_org: membership.organization_id,
    p_oturum: UUID.test(onceki) ? onceki : null,
    p_yol: yol,
    p_ip: firstForwardedIp(h.get("x-forwarded-for")) || h.get("x-real-ip"),
    p_ua: h.get("user-agent")?.slice(0, 500) ?? null,
  });
  if (error) {
    console.error("[varlik] sinyal yazılamadı", error.message);
    return new Response(null, { status: 204 });
  }
  const oturum = typeof data === "string" ? data : null;
  if (oturum && oturum !== onceki) {
    cerezler.set(OTURUM_CEREZI, oturum, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 });
  }
  return new Response(null, { status: 204 });
}
