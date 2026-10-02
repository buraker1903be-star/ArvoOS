/*
  YAYINDAKİ SÜRÜM.

  02.10.2026: bir hatanın sebebini ararken veri tarafındaki her şey yeşil
  çıktı ve geriye tek soru kaldı — "düzeltme yayında mı?". Buna cevap
  verecek hiçbir yol yoktu; belirsizlik saatlere mal oldu.

  Vercel her dağıtımda commit kimliğini ortam değişkeni olarak veriyor;
  burası onu okunur hâle getiriyor. /api/surum isteyen, o anda çalışan
  kodun hangi commit olduğunu görür.

  Yalnızca commit kimliği, dal adı ve ortam dönüyor. Depo özel olsa bile
  bu üçü tek başına ne kod ne veri açar; karşılığında "yayında mı"
  sorusu tahminle değil tek istekle cevaplanır.
*/
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json(
    {
      commit: process.env.VERCEL_GIT_COMMIT_SHA ?? "bilinmiyor (yerel çalışma)",
      dal: process.env.VERCEL_GIT_COMMIT_REF ?? null,
      ortam: process.env.VERCEL_ENV ?? "local",
      sunucu_saati: new Date().toISOString(),
    },
    { headers: { "cache-control": "no-store" } },
  );
}
