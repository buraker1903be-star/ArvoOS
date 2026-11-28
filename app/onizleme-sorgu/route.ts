import { notFound } from "next/navigation";

/*
  ÖNİZLEME TEŞHİS UCU (28.11.2026). Veritabanı kipinde bir SELECT
  çalıştırıp sonucunu döndürür: "ekranda neden bu yazıyor" sorusunu
  tahminle değil ölçümle yanıtlamak için. Yalnızca önizlemede ve
  yalnızca SELECT.
*/
export const dynamic = "force-dynamic";

export async function GET(istek: Request) {
  if (process.env.ARVOOS_ONIZLEME !== "1" || process.env.ARVOOS_ONIZLEME_DB !== "1") notFound();
  const sql = new URL(istek.url).searchParams.get("sql") ?? "";
  if (!/^\s*select\s/i.test(sql)) return Response.json({ hata: "yalnızca select" }, { status: 400 });
  const { veritabani, oturumAc } = await import("@/scripts/onizleme/pglite");
  const db = await veritabani();
  await oturumAc(db, null);
  try {
    const { rows } = await db.query(sql);
    return Response.json({ rows });
  } catch (hata) {
    return Response.json({ hata: hata instanceof Error ? hata.message : String(hata) }, { status: 500 });
  }
}
