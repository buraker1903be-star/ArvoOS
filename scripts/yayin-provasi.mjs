/*
  YAYIN PROVASI — 20261110063102 (PR #313). CI'DA DEĞİL; scripts/yayin-provasi.sh çalıştırır.

  10.11.2026'da oturumun geçici dizininde yazıldı ve elle koşuldu (24/24); kaybolmasın,
  yeniden çalıştırılabilsin diye buraya taşındı. Mantığı aynı; yalnızca yollar göreli,
  dizin/port ortamdan.

  Ne yapar: sarmalayıcının kurduğu İZOLE PostgreSQL'de (yalnızca unix soket, sentetik
  veri) önce yayın belgesinin §1 ön kontrollerini, sonra migration'ı tek işlemde, sonra
  §3 kontrollerini ve ödeme akışını koşar. Callback kararı rotanın kullandığı modül
  (lib/paytr-link-bildirimi.ts); veritabanı çağrıları psql ile, uygulamanın rolleriyle;
  PayTR kapatma çağrısı TAKLİT. Gizli bilgi yok: kimlikler sabit UUID, e-postalar
  example.test, PayTR adresi .invalid.
*/
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { linkBildiriminiIsle } from "../lib/paytr-link-bildirimi.ts";

const KOK = path.resolve(import.meta.dirname, "..");
const P = process.env.PROVA_PG_DIZIN ?? "/var/tmp/arvo-prova";
const PORT = process.env.PROVA_PG_PORT ?? "55433";
const KURUCU = "00000000-0000-4000-8000-000000000001";
const SAHIP = "00000000-0000-4000-8000-000000000002";
const ARVO = "00000000-0000-4000-8000-0000000000a0";
const SALON = "00000000-0000-4000-8000-0000000000a1";
const LINK = "00000000-0000-4000-8000-0000000000f1";

const sonuclar = [];
const kontrol = (ad, kosul, ayrinti = "") => { sonuclar.push([kosul ? "GEÇTİ" : "KALDI", ad, ayrinti]); };

/** psql ile tek işlem; rol ve JWT iddiaları uygulamanın Supabase'te kullandığıyla aynı. */
function sql(govde, { rol = "postgres", kullanici = null, hataBekle = false } = {}) {
  const giris = rol === "postgres" ? "" :
    `select set_config('request.jwt.claims', '${JSON.stringify({ sub: kullanici ?? "", role: rol })}', true) \\g /dev/null\nset local role ${rol};\n`;
  try {
    const out = execFileSync("psql", ["-h", P, "-p", PORT, "-U", "postgres", "-d", "arvo_prova", "-X", "-q", "-tA", "-F", "|", "-v", "ON_ERROR_STOP=1"],
      { input: `begin;\n${giris}${govde.trim().replace(/;?$/, ";")}\ncommit;\n`, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] });
    return { cikti: out.trim(), hata: null };
  } catch (e) {
    if (!hataBekle) throw new Error(String(e.stderr));
    return { cikti: null, hata: String(e.stderr) };
  }
}
const deger = (q, o) => sql(q, o).cikti;
const dosya = (yol, o) => {
  const out = execFileSync("psql", ["-h", P, "-p", PORT, "-U", "postgres", "-d", "arvo_prova", "-X", "-q", "-tA", "-v", "ON_ERROR_STOP=1", "-f", yol], { encoding: "utf8", ...o });
  return out;
};

// ---------- Tohum: "üretim benzeri" başlangıç (sentetik) ----------
sql(`
insert into auth.users (id, email) values ('${KURUCU}', 'kurucu@example.test'), ('${SAHIP}', 'salon@example.test');
insert into public.plans (code, name, description) values ('starter', 'Başlangıç', '') on conflict do nothing;
insert into public.organizations (id, name, slug, status, plan_code) values
  ('${ARVO}', 'Arvo', 'arvo-os', 'active', 'starter'), ('${SALON}', 'Prova Salon', 'prova-salon', 'active', 'starter');
insert into public.organization_memberships (organization_id, user_id, role) values ('${ARVO}', '${KURUCU}', 'owner'), ('${SALON}', '${SAHIP}', 'owner');
insert into public.payment_links (id, organization_id, provider, provider_link_id, url, amount, status, purpose, payer_organization_id, plan_code, product, created_by)
values ('${LINK}', '${ARVO}', 'paytr', 'PL-PROVA', 'https://paytr.invalid/prova', 150000, 'active', 'subscription', '${SALON}', 'starter', 'arvoos', '${SAHIP}');
`);

// ---------- Belge §1: migration öncesi salt okunur kontroller ----------
const belge = fs.readFileSync(path.join(KOK, "docs/yayin-20261110063102-lisans-kaydi-yokken-odeme.md"), "utf8");
const bloklar = [...belge.matchAll(/```sql\n([\s\S]*?)```/g)].map((m) => m[1]);
fs.writeFileSync(`${P}/b1.sql`, bloklar[0]); fs.chmodSync(`${P}/b1.sql`, 0o644);
let b1Hata = null;
try { dosya(`${P}/b1.sql`); } catch (e) { b1Hata = String(e.stderr); }
kontrol("§1 ön kontroller hatasız çalışır (salt okunur)", !b1Hata, b1Hata ?? "6 sorgu");
kontrol("§1.5 yeni işlevler migration öncesi yok", deger(`select count(*) from pg_proc where proname in ('arvo_apply_paytr_event','arvo_reprocess_paytr_event')`) === "0");
const oncesiDokum = deger(`select coalesce(string_agg(result||':'||n, ','), '') from (select result, count(*) n from public.payment_provider_events group by result) x`);

// ---------- Migration (belge §0.2: begin/commit içinde) ----------
const mig = fs.readFileSync(path.join(KOK, "supabase/migrations/20261110063102_lisans_kaydi_yokken_odeme.sql"), "utf8");
fs.writeFileSync(`${P}/mig.sql`, `begin;\n${mig}\ncommit;\n`); fs.chmodSync(`${P}/mig.sql`, 0o644);
let migHata = null;
try { dosya(`${P}/mig.sql`); } catch (e) { migHata = String(e.stderr); }
kontrol("Migration izole veritabanına uygulandı", !migHata, migHata ?? "tek işlem");

// ---------- Belge §3: migration sonrası ----------
fs.writeFileSync(`${P}/b3.sql`, bloklar[1]); fs.chmodSync(`${P}/b3.sql`, 0o644);
const b3 = dosya(`${P}/b3.sql`);
kontrol("§3.1 dört işlev security definer, search_path boş", (b3.match(/\|t\|\{"search_path=\\"\\""\}/g) ?? []).length === 4, "");
const yetki = deger(`select string_agg(rolname||'='||has_function_privilege(rolname,'private.arvo_apply_paytr_event(uuid)','execute')||'/'||has_function_privilege(rolname,'public.arvo_reprocess_paytr_event(uuid)','execute')||'/'||has_function_privilege(rolname,'public.arvo_record_paytr_payment(uuid,text,bigint,bigint,text,boolean,jsonb)','execute'), ' ' order by rolname) from pg_roles where rolname in ('anon','authenticated','service_role')`);
kontrol("§3.2 yetkiler beklendiği gibi", yetki === "anon=false/false/false authenticated=false/true/false service_role=false/true/true", yetki);
kontrol("§3.3 migration veriye dokunmadı", deger(`select coalesce(string_agg(result||':'||n, ','), '') from (select result, count(*) n from public.payment_provider_events group by result) x`) === oncesiDokum);

// ---------- Akış: callback (rota modülü + gerçek DB + taklit PayTR) ----------
const paytrCagrilari = [];
let paytrBasarisizSirasi = new Set();
const gunluk = [];
let yanIs = 0;
async function callback(oid) {
  const link = deger(`select status from public.payment_links where id = '${LINK}'`);
  return linkBildiriminiIsle(
    { linkId: LINK, merchantOid: oid, baglantiDurumu: link, payerOrganizationId: SALON },
    {
      kaydet: async () => {
        const r = sql(`select public.arvo_record_paytr_payment('${LINK}', '${oid}', 150000, 150000, 'TL', false, '{"payment_type":"card"}'::jsonb);`, { rol: "service_role" });
        return { sonuc: r.cikti, hata: null };
      },
      oncekiOlay: async () => {
        const r = deger(`select payment_link_id||'|'||result||'|'||test_mode from public.payment_provider_events where provider='paytr' and merchant_oid='${oid}'`, { rol: "service_role" });
        if (!r) return { olay: null, hata: null };
        const [payment_link_id, result, t] = r.split("|");
        return { olay: { payment_link_id, result, test_mode: t === "t" }, hata: null };
      },
      kapat: async () => {
        paytrCagrilari.push("PL-PROVA");
        if (paytrBasarisizSirasi.has(paytrCagrilari.length)) throw new Error("taklit PayTR: link silinemedi");
      },
      tahsilatSonrasi: async () => { yanIs += 1; },
      hata: (...a) => gunluk.push("HATA " + a.join(" ")),
      uyari: (...a) => gunluk.push("UYARI " + a.join(" ")),
    },
  );
}
const sayac = () => deger(`select (select count(*) from public.payment_provider_events)||'/'||(select count(*) from public.organization_payment_requests where status='approved' and organization_id='${SALON}')||'/'||(select count(*) from public.billing_subscriptions where organization_id='${SALON}')||'/'||(select count(*) from public.billing_invoices where organization_id='${SALON}')`);

// 1) Eksik lisans + başarılı tahsilat + kapatma hatası
sql(`delete from public.organization_licenses where organization_id = '${SALON}'`);
paytrBasarisizSirasi = new Set([1]);
const r1 = await callback("OID-PROVA-1");
kontrol("Tahsilat başarılı, lisans yok → no_license", r1.sonuc === "no_license", r1.sonuc);
kontrol("Kapatma hatası → PayTR'ye 503 (yeniden gönderir)", r1.durum === 503 && r1.kapatma === "basarisiz", `${r1.durum} ${r1.kapatma}`);
kontrol("Kapatma hatası günlükte izlenebilir", gunluk.some((g) => g.includes("bağlantı kapatılamadı") && g.includes("OID-PROVA-1")));
const s1 = sayac();
kontrol("Tahsilat yazıldı, onaylı ödeme/aktivasyon/fatura yok (olay/onaylı/aktivasyon/fatura)", s1 === "1/0/0/0", s1);
kontrol("Bağlantı 'paid' (tahsil edildi)", deger(`select status from public.payment_links where id='${LINK}'`) === "paid");

// 2) PayTR tekrar bildirimi
const r2 = await callback("OID-PROVA-1");
kontrol("Tekrar bildirim → duplicate, kapatma yeniden denendi ve başarılı", r2.sonuc === "duplicate" && r2.kapatma === "kapatildi" && r2.durum === 200, `${r2.sonuc} ${r2.kapatma} ${r2.durum}`);
kontrol("Tekrar bildirimde yan işlem çoğalmadı", sayac() === s1 && yanIs === 0 && paytrCagrilari.length === 2, `sayaç ${sayac()} yanİş ${yanIs} PayTR çağrısı ${paytrCagrilari.length}`);

// 3) Müşteri ekranının okuduğu veri (app/panel/billing/page.tsx sorgusunun karşılığı, service_role)
const musteri = deger(`select e.merchant_oid||'|'||e.payment_amount from public.payment_provider_events e join public.payment_links l on l.id = e.payment_link_id where e.result = 'no_license' and l.payer_organization_id = '${SALON}'`, { rol: "service_role" });
kontrol("Müşteri: 'ödeme alındı, uygulama bekliyor' verisi (tutar ve sipariş) okunuyor", musteri === "OID-PROVA-1|150000", musteri);
const istemci = sql(`select count(*) from public.payment_provider_events`, { rol: "authenticated", kullanici: SAHIP });
kontrol("Müşteri olay tablosunu doğrudan okuyamıyor (RLS)", istemci.cikti === "0", istemci.cikti);

// 4) Kurucu ekranının okuduğu veri (lib/payment-incidents.ts sorgusunun karşılığı)
const olay = deger(`select id||'|'||result from public.payment_provider_events where result not in ('recorded','test','duplicate')`, { rol: "service_role" });
const [olayId, olaySonuc] = olay.split("|");
kontrol("Kurucu: olay işlenemeyenler listesinde, yeniden işlenebilir sonuçla", olaySonuc === "no_license", olay);
const ilkOlay = deger(`select id||'|'||received_at||'|'||payload::text from public.payment_provider_events where id='${olayId}'`);

// 5) Kurucu lisansı oluşturur (Lisanslar formu, kurucu RLS'iyle) ve yeniden işler
sql(`insert into public.organization_licenses (organization_id, plan_code, license_status, trial_started_at, user_limit, storage_limit_mb, ai_credit_limit, monthly_fee)
     values ('${SALON}', 'starter', 'trialing', now(), 3, 5120, 500, 150000);`, { rol: "authenticated", kullanici: KURUCU });
const yetkisiz = sql(`select public.arvo_reprocess_paytr_event('${olayId}');`, { rol: "authenticated", kullanici: SAHIP, hataBekle: true });
kontrol("Kurucu olmayan yeniden işleyemez", /Founder authorization required/.test(yetkisiz.hata ?? ""));
const yeniden = deger(`select public.arvo_reprocess_paytr_event('${olayId}');`, { rol: "authenticated", kullanici: KURUCU });
kontrol("Yeniden işleme → recorded", yeniden === "recorded", yeniden);
const s5 = sayac();
kontrol("Tek aktivasyon (olay/onaylı/aktivasyon/fatura)", s5 === "1/1/1/1", s5);
kontrol("Lisans aktif, dönem ~1 ay", deger(`select license_status||'|'||(current_period_end > now() + interval '27 days') from public.organization_licenses where organization_id='${SALON}'`) === "active|true");
kontrol("Olay aynı satır: kimlik, zaman, payload korundu", deger(`select id||'|'||received_at||'|'||payload::text from public.payment_provider_events where id='${olayId}'`) === ilkOlay);
kontrol("Deneme kurucunun adıyla işlem kaydında", deger(`select actor_user_id||'|'||(metadata->>'sonuc') from public.activity_logs where entity_type='payment_event'`) === `${KURUCU}|recorded`);

// 6) Aynı olay tekrar uygulanamaz; PayTR tekrarı da uzatmaz
const ikinci = sql(`select public.arvo_reprocess_paytr_event('${olayId}');`, { rol: "authenticated", kullanici: KURUCU, hataBekle: true });
kontrol("Aynı olay ikinci kez yeniden işlenemez", /event_not_reprocessable/.test(ikinci.hata ?? ""));
const r6 = await callback("OID-PROVA-1");
kontrol("Yeniden işlemeden sonra PayTR tekrarı → duplicate, sayılar aynı, yan iş yok", r6.sonuc === "duplicate" && sayac() === s5 && yanIs === 0, `${r6.sonuc} ${sayac()} yanİş ${yanIs}`);

// ---------- Rapor ----------
const genislik = Math.max(...sonuclar.map((s) => s[1].length));
for (const [d, ad, ay] of sonuclar) console.log(`${d.padEnd(6)} ${ad.padEnd(genislik)}  ${ay}`);
console.log(`\n${sonuclar.filter((s) => s[0] === "GEÇTİ").length}/${sonuclar.length} geçti`);
fs.writeFileSync(`${P}/gunluk.txt`, gunluk.join("\n"));
if (sonuclar.some((s) => s[0] !== "GEÇTİ")) process.exit(1);
