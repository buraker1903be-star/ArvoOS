import { getPanelContext } from "@/lib/panel-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/*
  GEÇİCİ ÖLÇÜM (13.10.2026, hızlandırma). Sunucudan veritabanına bir
  isteğin ne kadarı yol masrafı (ağ, API geçidi, PostgREST), ne kadarı
  sorgunun kendisi — ayırmak için. Oturum ister; yalnızca süre döner,
  veri dönmez. Ölçüm bitince kaldırılacak.
*/
export async function GET() {
  const { supabase, membership } = await getPanelContext();
  const org = membership.organization_id;
  const olc = async (ad: string, fn: () => PromiseLike<unknown>) => {
    const sureler: number[] = [];
    for (let i = 0; i < 5; i++) {
      const bas = performance.now();
      await fn();
      sureler.push(Math.round(performance.now() - bas));
    }
    return [ad, sureler] as const;
  };
  const sonuc = [
    await olc("en basit (organizations 1 satır)", () => supabase.from("organizations").select("id").eq("id", org).maybeSingle()),
    await olc("talep sayımı (görünüm, head)", () => supabase.from("crm_talep_liste").select("id", { count: "exact", head: true }).eq("organization_id", org).eq("stage", "new")),
    await olc("talep sayımı (tablo, head)", () => supabase.from("crm_opportunities").select("id", { count: "exact", head: true }).eq("organization_id", org).eq("stage", "new")),
    await olc("iş sayımı (görünüm, head)", () => supabase.from("operasyon_is_liste").select("id", { count: "exact", head: true }).eq("organization_id", org).neq("status", "cancelled")),
    await olc("talep listesi 50 satır (görünüm)", () => supabase.from("crm_talep_liste").select("*").eq("organization_id", org).range(0, 49)),
  ];
  return Response.json(Object.fromEntries(sonuc), { headers: { "Cache-Control": "no-store" } });
}
