/*
  YAVAŞ SORGU GÜNLÜĞÜ (13.10.2026). Panel hızlandırma çalışmasında hangi
  sorgunun yavaş olduğu tahminle bulunuyordu: Vercel günlüğünde istek
  süresi yok, pg_stat_statements ise geçmişi biriktiriyor (ArvoARC'ın
  ayrılmasından önceki mağaza sorguları listenin başındaydı). Sunucu
  tarafı Supabase istemcileri bu fetch'i kullanır: ESİK'ten uzun süren
  her çağrı "[yavaş sorgu]" diye, tablo/işlev yoluyla (sorgu değerleri
  olmadan — kimlik ve kişisel veri günlüğe yazılmasın) günlüğe düşer.
  Hızlı çağrılarda hiçbir şey yazılmaz; maliyeti iki zaman damgası.
*/
const ESIK_MS = 150;

export const zamanliFetch: typeof fetch = async (girdi, ayar) => {
  const bas = performance.now();
  const yanit = await fetch(girdi, ayar);
  const sure = performance.now() - bas;
  if (sure >= ESIK_MS) {
    try {
      const url = new URL(typeof girdi === "string" ? girdi : girdi instanceof URL ? girdi.href : girdi.url);
      // Yalnızca yol ("/rest/v1/operasyon_is_liste", "/rest/v1/rpc/…"); sorgu dizgesi değerler taşıyor.
      console.warn(`[yavaş sorgu] ${Math.round(sure)} ms ${ayar?.method ?? "GET"} ${url.pathname} → ${yanit.status}`);
    } catch {
      /* günlük hiçbir zaman isteği bozmasın */
    }
  }
  return yanit;
};
