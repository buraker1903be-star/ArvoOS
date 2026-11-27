/*
  PR7 ENTEGRASYON — SUPABASE AĞ GEÇİDİ TAKLİDİ (yalnızca yerel).

  Supabase istemcisi tek bir adrese konuşur: /auth/v1 → GoTrue,
  /rest/v1 → PostgREST, /storage/v1 → Storage API. Barındırılan
  Supabase'te bunu Kong yapıyor; burada aynı yönlendirmeyi yapan en küçük
  köprü. İstek ve yanıt gövdesine DOKUNMAZ (başlıklar, durum kodu,
  Content-Range, Set-Cookie aynen geçer) — ölçülen davranış arka uçların
  kendisi. PR7_REST=300 ile satır tavanı 300 olan PostgREST'e gider.

  CORS: barındırılan Supabase'te ön kontrolü (OPTIONS) Kong'un cors
  eklentisi karşılar; Storage API'nin kendisi karşılamaz (404). Tarayıcıdan
  doğrudan kovaya yükleme bu yüzden burada da Kong gibi yanıtlanıyor —
  yoksa ölçülen şey Supabase değil, eksik bir köprü olurdu.
*/
import http from "node:http";

const PORT = Number(process.env.PR7_GECIT_PORT ?? 54400);
const REST = process.env.PR7_REST === "300" ? 53002 : 53001;
const HEDEF = { "/auth/v1": [59998, ""], "/rest/v1": [REST, ""], "/storage/v1": [55000, ""] };

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS",
  "access-control-allow-headers": "authorization,apikey,content-type,x-client-info,x-upsert,cache-control,range,prefer,accept-profile,content-profile,x-supabase-api-version",
  "access-control-expose-headers": "content-range,content-length,content-type",
  "access-control-max-age": "3600",
};

http.createServer((istek, yanit) => {
  if (istek.method === "OPTIONS") { yanit.writeHead(204, CORS).end(); return; }
  const onek = Object.keys(HEDEF).find((o) => istek.url === o || istek.url.startsWith(o + "/") || istek.url.startsWith(o + "?"));
  if (!onek) { yanit.writeHead(404).end("pr7 geçit: bilinmeyen yol"); return; }
  const [port] = HEDEF[onek];
  const ileri = http.request({ host: "127.0.0.1", port, method: istek.method, path: istek.url.slice(onek.length) || "/", headers: { ...istek.headers, host: `127.0.0.1:${port}` } }, (r) => {
    yanit.writeHead(r.statusCode ?? 502, { ...CORS, ...r.headers });
    r.pipe(yanit);
  });
  ileri.on("error", (e) => { if (!yanit.headersSent) yanit.writeHead(502); yanit.end(`pr7 geçit: ${e.message}`); });
  istek.pipe(ileri);
}).listen(PORT, "127.0.0.1", () => console.log(`pr7 geçit http://127.0.0.1:${PORT} (rest tavanı: ${REST === 53002 ? 300 : 1000})`));
