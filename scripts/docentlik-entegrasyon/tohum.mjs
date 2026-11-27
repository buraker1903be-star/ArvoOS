/*
  PR7 ENTEGRASYON — SENTETİK TOHUM (yalnızca yerel; gerçek kişi/kurum yok).

  Aktörler ve yetki dağılımı tests/db/docentlik-ortak.mjs ile AYNI (aynı
  kimlikler): PGlite'ta sınanan kuralların gerçek yığında da aynı aktörle
  sınandığı görülsün. Fark: kullanıcılar GERÇEK GoTrue yönetici API'siyle
  açılıyor (parolayla giriş yapabilsinler), satırlar gerçek PostgreSQL'e.

  "Büyük kurum" (AM): sahibe 1500 faaliyet ve 1100 profilli sentetik kişi —
  sayfalama ve satır tavanı (1000/300) bunun üzerinde ölçülüyor. Sentetik
  kişiler giriş yapmadığı için doğrudan auth.users'a yazılıyor.

  Bağlantı yalnızca 127.0.0.1: canlıya ya da paylaşılan Test'e gitmesin.
*/
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { AM, AM2, K, R } from "../../tests/db/docentlik-ortak.mjs";
import { SOZLESME_SURUMU } from "../../lib/sozlesme/kullanim-sozlesmesi.ts";

const PG = process.env.PR7_PG_URL ?? "postgres://postgres:pr7-yerel@127.0.0.1:55433/postgres";
const GECIT = process.env.PR7_GECIT ?? "http://127.0.0.1:54400";
const SERVIS = process.env.PR7_SERVICE_KEY;
if (!SERVIS) throw new Error("PR7_SERVICE_KEY gerekli (yerel, sentetik anahtar).");
if (!/@127\.0\.0\.1:\d+\//.test(PG) || !GECIT.startsWith("http://127.0.0.1:")) throw new Error("PR7 yalnızca 127.0.0.1'e bağlanır.");

export const PAROLA = "pr7-Sentetik-1";
export const KISILER = {
  sahip: ["sahip@am.test", "Ayşe Sentetik"], uye: ["uye@am.test", "Ulaş Sentetik"], gozetim: ["gozetim@am.test", "Gözde Sentetik"],
  yonetici: ["yonetici@am.test", "Yaman Sentetik"], kurumSahibi: ["kurum@am.test", "Kurum Sahibi Sentetik"],
  yabanci: ["sahip@am2.test", "Yabancı Sentetik"], iptal: ["iptal@am.test", "İptal Sentetik"], gozetimKapali: ["gozkapali@am.test", "Kapalı Sentetik"],
};
export const BUYUK = { faaliyet: 1500, kisi: 1100 };

async function kullaniciAc(id, email) {
  const yanit = await fetch(`${GECIT}/auth/v1/admin/users`, {
    method: "POST",
    headers: { apikey: SERVIS, Authorization: `Bearer ${SERVIS}`, "content-type": "application/json" },
    body: JSON.stringify({ id, email, password: PAROLA, email_confirm: true }),
  });
  if (!yanit.ok && yanit.status !== 422) throw new Error(`${email}: ${yanit.status} ${await yanit.text()}`);
}

const psql = (sql) => {
  const dosya = path.join(process.env.TMPDIR ?? "/tmp", "pr7-tohum.sql");
  fs.writeFileSync(dosya, sql);
  execFileSync("psql", [PG, "-v", "ON_ERROR_STOP=1", "-q", "-f", dosya], { stdio: "inherit" });
};

if (import.meta.url === `file://${process.argv[1]}`) {
  for (const [ad, [email]] of Object.entries(KISILER)) await kullaniciAc(K[ad], email);
  const adlar = Object.entries(KISILER).map(([ad, [, isim]]) => `('${K[ad]}', '${isim}')`).join(",");
  psql(`
    insert into public.profiles (id, full_name) values ${adlar} on conflict (id) do update set full_name = excluded.full_name;
    -- Kullanım sözleşmesi: sentetik aktörler onaylamış sayılır (yoksa panel önce onay penceresini açar).
    insert into public.sozlesme_onaylari (user_id, belge, surum, dil, metin_ozeti, kaydirma_tamamlandi)
    select u, 'kullanim_sozlesmesi', '${SOZLESME_SURUMU}', 'tr', repeat('a', 64), true
    from unnest(array[${Object.keys(KISILER).map((ad) => `'${K[ad]}'::uuid`).join(",")}]) u
    where not exists (select 1 from public.sozlesme_onaylari o where o.user_id = u and o.surum = '${SOZLESME_SURUMU}');
    insert into public.plans (code, name, description) values ('starter','Başlangıç','') on conflict do nothing;
    insert into public.organizations (id, name, slug, status, plan_code) values
      ('${AM}','AkademikMerkez Deneme','am-deneme','active','starter'),
      ('${AM2}','İkinci Kurum','ikinci-kurum','active','starter') on conflict do nothing;
    insert into public.organization_memberships (organization_id, user_id, role, is_active) values
      ('${AM}','${K.sahip}','member',true),('${AM}','${K.uye}','member',true),
      ('${AM}','${K.gozetim}','admin',true),('${AM}','${K.yonetici}','manager',true),
      ('${AM}','${K.kurumSahibi}','owner',true),('${AM}','${K.iptal}','member',false),
      ('${AM}','${K.gozetimKapali}','admin',true),
      ('${AM2}','${K.yabanci}','owner',true) on conflict do nothing;
    insert into public.role_capability_permissions (organization_id, role, capability_key, allowed, updated_at) values
      ('${AM}','admin','docentlik.tumunu_gor',true,now()) on conflict do nothing;
    insert into public.member_capability_permissions (organization_id, user_id, capability_key, allowed, updated_at) values
      ('${AM}','${K.yonetici}','docentlik.kriter_yonet',true,now()),
      ('${AM}','${K.yonetici}','docentlik.uak_yonet',true,now()),
      ('${AM}','${K.gozetimKapali}','docentlik.tumunu_gor',false,now()) on conflict do nothing;
    insert into public.ozel_modul_kurumlari (module_code, organization_id) values ('docentlik','${AM}'),('docentlik','${AM2}') on conflict do nothing;
    insert into public.organization_modules (organization_id, module_code, is_enabled) values
      ('${AM}','docentlik',true),('${AM2}','docentlik',true) on conflict do nothing;
    insert into public.docentlik_kriterleri (id, organization_id, code, label, category_group, points_per_unit, baslica_yazar_katsayisi, diger_yazar_katsayisi) values
      ('${R.kriter}','${AM}','A1','Uluslararası makale','Makaleler',20,0.8,0.5),
      ('${R.kriterSil}','${AM}','Z9','Silinecek kriter',null,1,null,null),
      ('${R.kriterAm2}','${AM2}','A1','Öteki kurumun kriteri','Makaleler',99,null,null) on conflict do nothing;
    insert into public.docentlik_hedefleri (id, organization_id, grup, asgari_puan) values ('${R.hedef}','${AM}',null,100) on conflict do nothing;
    insert into public.docentlik_profilleri (organization_id, owner_id, doktora_tarihi, temel_alan) values
      ('${AM}','${K.sahip}','2020-06-15','Eğitim Bilimleri') on conflict do nothing;
    insert into public.docentlik_faaliyetleri (id, organization_id, owner_id, criteria_id, title, unit_count, yazar_sayisi, baslica_yazar, faaliyet_tarihi) values
      ('${R.faaliyet}','${AM}','${K.sahip}','${R.kriter}','Makale',2,3,false,'2022-01-10'),
      ('${R.faaliyetIptal}','${AM}','${K.iptal}','${R.kriter}','Eski üyenin makalesi',1,1,true,null),
      ('${R.faaliyetAm2}','${AM2}','${K.yabanci}','${R.kriterAm2}','Öteki kurumun faaliyeti',1,1,true,null) on conflict do nothing;

    -- Personel kaydı: adı gözetime yalnızca hr_employees taşıyor (profiles RLS'i kişinin kendisine açık).
    insert into public.hr_employees (organization_id, user_id, full_name)
    select '${AM}', '${K.sahip}', 'Ayşe Sentetik' where not exists (select 1 from public.hr_employees where user_id = '${K.sahip}');
    -- Büyük kurum: sahibe ${BUYUK.faaliyet - 1} ek faaliyet (doktora sonrası), ${BUYUK.kisi} profilli sentetik kişi.
    insert into public.docentlik_faaliyetleri (organization_id, owner_id, criteria_id, title, unit_count, yazar_sayisi, baslica_yazar, faaliyet_tarihi)
    select '${AM}', '${K.sahip}', '${R.kriter}', 'Sentetik ' || g, 1, 1, true, date '2023-01-01' + g
    from generate_series(1, ${BUYUK.faaliyet - 1}) g
    where not exists (select 1 from public.docentlik_faaliyetleri where title = 'Sentetik 1');
    insert into auth.users (id, aud, role, email, created_at, updated_at)
    select ('00000000-0000-4000-9000-' || lpad(g::text, 12, '0'))::uuid, 'authenticated', 'authenticated', 'k' || g || '@sentetik.test', now(), now()
    from generate_series(1, ${BUYUK.kisi}) g on conflict do nothing;
    insert into public.profiles (id, full_name)
    select ('00000000-0000-4000-9000-' || lpad(g::text, 12, '0'))::uuid, 'Sentetik Kişi ' || g from generate_series(1, ${BUYUK.kisi}) g on conflict do nothing;
    insert into public.organization_memberships (organization_id, user_id, role, is_active)
    select '${AM}', ('00000000-0000-4000-9000-' || lpad(g::text, 12, '0'))::uuid, 'member', true from generate_series(1, ${BUYUK.kisi}) g on conflict do nothing;
    insert into public.docentlik_profilleri (organization_id, owner_id, doktora_tarihi, temel_alan)
    select '${AM}', ('00000000-0000-4000-9000-' || lpad(g::text, 12, '0'))::uuid, case when g % 2 = 0 then date '2019-01-01' end, 'Alan ' || (g % 7)
    from generate_series(1, ${BUYUK.kisi}) g on conflict do nothing;
  `);
  console.log("tohum tamam");
}
