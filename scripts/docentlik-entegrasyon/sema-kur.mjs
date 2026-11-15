/*
  PR7 ENTEGRASYON — ŞEMAYI YEREL POSTGRES'E KURAR (yalnızca yerel, sentetik).

  tests/db/ortam.mjs'in PGlite'a yaptığının gerçek PostgreSQL 17 karşılığı:
  canlı döküm → bekleyen migration'lar → belge kovası → Supabase varsayılan
  yetkisi → döküm ve migration'ların grant/revoke satırları özgün sırayla.
  Fark: auth şemasını GERÇEK GoTrue, storage şemasını GERÇEK Storage API
  kendi migration'larıyla kurmuş olmalı (bkz. ortam.sh); burada taklit yok.

  Bağlantı yalnızca PR7_PG_URL'den ve yalnızca 127.0.0.1'e: canlıya ya da
  paylaşılan Test projesine yanlışlıkla bağlanmayı adres düzeyinde reddeder.
*/
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { BEKLEYEN_MIGRATIONLAR } from "../../tests/db/ortam.mjs";

const KOK = path.resolve(import.meta.dirname, "../..");
const URL_ = process.env.PR7_PG_URL ?? "postgres://postgres:pr7-yerel@127.0.0.1:55433/postgres";
if (!/@127\.0\.0\.1:\d+\//.test(URL_)) throw new Error("PR7 yalnızca 127.0.0.1'deki yerel veritabanına kurulur.");

const yorumsuz = (sql) => sql.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ");
const yetkiSatirlari = (sql) => yorumsuz(sql).match(/^\s*(?:grant|revoke)\s[^;]*;/gim) ?? [];
const oku = (p) => fs.readFileSync(path.join(KOK, p), "utf8");

const ON = `
create schema if not exists private;
grant usage on schema auth, extensions, private, public to anon, authenticated, service_role;
`;
const sema = oku("supabase/schema/canli-sema.sql");
const bekleyen = [...BEKLEYEN_MIGRATIONLAR, "20261114201157_docentlik_belge_kovasi.sql"]
  .sort().map((ad) => oku(`supabase/migrations/${ad}`));
const VARSAYILAN = `
grant all on all tables in schema public to anon, authenticated, service_role;
grant all on all sequences in schema public to anon, authenticated, service_role;
grant execute on all functions in schema auth to anon, authenticated, service_role;
`;
const yetkiler = [sema, ...bekleyen].flatMap(yetkiSatirlari).join("\n");
const hepsi = [ON, sema, ...bekleyen, VARSAYILAN, yetkiler, "notify pgrst, 'reload schema';"].join("\n;\n");
const dosya = path.join(process.env.TMPDIR ?? "/tmp", "pr7-sema.sql");
fs.writeFileSync(dosya, hepsi);
execFileSync("psql", [URL_, "-v", "ON_ERROR_STOP=1", "-q", "-f", dosya], { stdio: "inherit" });
console.log(`şema kuruldu: döküm + ${bekleyen.length} migration + ${yetkiSatirlari(yetkiler).length} yetki satırı`);
