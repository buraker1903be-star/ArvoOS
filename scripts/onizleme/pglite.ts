/*
  ÖNİZLEMENİN GERÇEK VERİTABANI (28.11.2026).

  Sahte istemci okumaları örnek veriden cevaplıyor ve YAZMALARI
  simüle ediyordu: "onaylandı" diye görünen bir ekran hiçbir şey
  kaydetmiyordu. Arayüzden başlatılan bir işlemin gerçekten kayda
  geçtiğini, yenileyince doğru durumun göründüğünü ve YETKİSİZ bir
  hesabın reddedildiğini göstermenin tek yolu, altta gerçek bir
  veritabanı olması.

  Burada PGlite var: canlı şemanın tamamı (supabase/schema/canli-sema.sql)
  — tablolar, görünümler, işlevler, tetikleyiciler ve RLS politikaları.
  tests/db ile AYNI kurulum; o yüzden kurulum kodu da oradan geliyor,
  ikinci bir kopya tutulmuyor.

  OTURUM: her sorgudan önce rol ve JWT iddiası ayarlanıyor
  (`set role authenticated` + `request.jwt.claims`), yani RLS gerçekten
  işliyor. Hangi hesabın oturumu olduğu çerezden geliyor
  (`onizleme_oturum`), böylece tarayıcıda hesap değiştirip yetkisiz
  erişimi aynı turda sınayabiliyoruz.

  ÜRETİMDE YOK: yalnızca ARVOOS_ONIZLEME=1 + ARVOOS_ONIZLEME_DB=1 ile
  kuruluyor ve önizleme bayrağı üretim derlemesini durduruyor.
*/
import { SOZLESME_SURUMU } from "@/lib/sozlesme/kullanim-sozlesmesi";

export const KURUCU = "99999999-9999-4999-8999-999999999999";
export const YETKISIZ = "88888888-8888-4888-8888-888888888888";
export const ARVO = "00000000-0000-4000-8000-000000000001";
export const MUSTERI = "11111111-1111-4111-8111-111111111111";
export const MUSTERI2 = "22222222-2222-4222-8222-222222222222";

type Pg = {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;
  exec: (sql: string) => Promise<unknown>;
};

/* HMR'de yeniden kurulmasın: şema yüklemesi saniyeler sürüyor ve her
   derlemede sıfırlanırsa tarayıcıdaki akış ortasında veri kaybolur. */
const KUTU = globalThis as unknown as { __onizlemeDb?: Promise<Pg> };

async function kur(): Promise<Pg> {
  /*
    tests/db/ortam.mjs: canlı şema + Supabase kabuğu + yetkiler. İKİNCİ
    BİR KOPYA TUTULMUYOR — kurulum tek yerde kalmalı, yoksa önizleme
    ile testler farklı bir şemada koşar.

    `turbopackIgnore` ve çalışma anında kurulan yol: paketleyici bu
    dosyayı İÇERİ ALMAMALI. Aldığında `import.meta.dirname` tanımsız
    kalıyor ve şema okuması "paths[0] must be of type string" ile
    düşüyordu.
  */
  const { pathToFileURL } = await import("node:url");
  const { join } = await import("node:path");
  const yol = pathToFileURL(join(process.cwd(), "tests/db/ortam.mjs")).href;
  const ortam = (await import(/* turbopackIgnore: true */ yol)) as { veritabani: () => Promise<Pg> };
  const db = await ortam.veritabani();
  await db.exec(TOHUM);
  console.warn("[onizleme] PGlite hazır: canlı şema + örnek veri, RLS açık.");
  return db;
}

export function veritabani(): Promise<Pg> {
  KUTU.__onizlemeDb ??= kur();
  return KUTU.__onizlemeDb;
}

/**
 * Akışı baştan koşturmak için veriyi tohuma döndürür.
 *
 * Kabul betiği ödemeyi onaylıyor, talebi yanıtlıyor ve fiyatı
 * yayımlıyor; ikinci koşuda o kayıtlar artık "bekleyen" değil ve
 * betik hiçbir şey bulamıyordu. Sıfırlama YALNIZCA önizlemede var.
 */
export async function sifirla() {
  const db = await veritabani();
  await oturumAc(db, null);
  await db.exec(`
    delete from public.support_messages;
    delete from public.support_tickets;
    delete from public.organization_payment_requests;
    delete from public.platform_fiyat_listesi where kod in ('arvoos-baslangic', 'arvolab-arastirmaci');
  `);
  await db.exec(TOHUM);
}

/**
 * Oturumu kurar: rol ve JWT iddiası. `postgres` veritabanı sahibi
 * (tohum ve doğrulama için); `authenticated` gerçek kullanıcı, RLS
 * onun üzerinden işliyor.
 */
export async function oturumAc(db: Pg, kullaniciId: string | null) {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claims', $1, false)", [
    kullaniciId ? JSON.stringify({ sub: kullaniciId, role: "authenticated" }) : "",
  ]);
  if (kullaniciId) await db.exec("set role authenticated");
}

/*
  TOHUM. tests/db'deki senaryo verisinin arayüz karşılığı: kurucunun
  kendi kurumu, iki müşteri, bekleyen ödeme bildirimleri, açık bir
  destek talebi ve taslak bekleyen iki fiyat basamağı. Tutarlar ve
  adlar uydurma.
*/
const TOHUM = `

insert into auth.users (id, email) values
  ('${KURUCU}', 'kurucu@ornek.test'),
  ('${YETKISIZ}', 'yetkisiz@ornek.test'),
  ('aaaa0000-0000-4000-8000-000000000001', 'uye@akademi.test')
on conflict do nothing;

insert into public.plans (code, name, description, is_active, created_at) values
  ('starter', 'Başlangıç', 'Başlangıç paketi', true, now()),
  ('enterprise', 'Kurumsal', 'Kurumsal paket', true, now())
on conflict (code) do nothing;

insert into public.organizations
  (id, name, slug, sector, status, plan_code, created_at, updated_at,
   provisioning_state, primary_color, kind, tracking_show_phases, grup_markasi)
values
  ('${ARVO}', 'Arvo', 'arvo-os', 'yazilim', 'active', 'enterprise', now(), now(), 'active', '#1b3050', 'internal', true, false),
  ('${MUSTERI}', 'Akademi Yayıncılık', 'akademi', 'yayincilik', 'active', 'enterprise', now() - interval '300 days', now(), 'active', '#1b3050', 'customer', true, false),
  ('${MUSTERI2}', 'Ege Danışmanlık', 'ege', 'danismanlik', 'active', 'starter', now() - interval '200 days', now(), 'active', '#1b3050', 'customer', true, false)
on conflict (id) do nothing;

insert into public.organization_memberships
  (organization_id, user_id, role, permissions, is_active, joined_at, role_from_management)
values
  ('${ARVO}', '${KURUCU}', 'owner', '{}'::jsonb, true, now(), false),
  ('${MUSTERI2}', '${YETKISIZ}', 'owner', '{}'::jsonb, true, now(), false),
  ('${MUSTERI}', 'aaaa0000-0000-4000-8000-000000000001', 'owner', '{}'::jsonb, true, now(), false)
on conflict do nothing;

insert into public.organization_licenses
  (organization_id, plan_code, license_status, trial_started_at, current_period_start, current_period_end,
   user_limit, storage_limit_mb, ai_credit_limit, ai_credits_used, module_limits,
   created_at, updated_at, monthly_fee, extra_user_fee, extra_user_cap)
values
  ('${ARVO}', 'enterprise', 'active', now() - interval '900 days', now() - interval '10 days', now() + interval '20 days',
   50, 10240, 0, 0, '{}'::jsonb, now(), now(), null, 0, 0),
  ('${MUSTERI}', 'enterprise', 'active', now() - interval '300 days', now() - interval '10 days', now() + interval '20 days',
   25, 10240, 0, 0, '{}'::jsonb, now(), now(), 450000, 0, 0),
  ('${MUSTERI2}', 'starter', 'past_due', now() - interval '200 days', now() - interval '40 days', now() - interval '10 days',
   10, 2048, 0, 0, '{}'::jsonb, now(), now(), 240000, 0, 0)
on conflict (organization_id) do nothing;

/*
  Aylık ücret INSERT'te yazılmıyor: tetikleyici lisans satırını paket
  varsayılanlarıyla dolduruyor ve monthly_fee null kalıyor (ölçüldü).
  Beklenen tutar bu alandan okunduğu için ekran "Beklenen tutar
  doğrulanamadı" diyordu. Ücret ayrı bir UPDATE ile yazılıyor.
*/
update public.organization_licenses set monthly_fee = 450000, user_limit = 25
 where organization_id = '${MUSTERI}';
update public.organization_licenses set monthly_fee = 240000, user_limit = 10
 where organization_id = '${MUSTERI2}';

insert into public.platform_bank_accounts
  (id, bank_name, account_holder, iban, currency, is_active, sort_order, created_at, updated_at)
values ('dddd0000-0000-4000-8000-000000000001', 'Örnek Bank', 'Arvo', 'TR000000000000000000000001', 'TRY', true, 1, now(), now())
on conflict (id) do nothing;

/* İki bekleyen bildirim: biri beklenenle UYUŞMUYOR (240.000 beklenirken
   180.000 bildirildi), biri tam tutarında. */
insert into public.organization_payment_requests
  (id, organization_id, plan_code, amount, currency, payment_method, status, submitted_by,
   created_at, updated_at, product, receipt_path, bank_account_id, reference_no, customer_note)
values
  ('bbbb0000-0000-4000-8000-000000000001', '${MUSTERI2}', 'starter', 180000, 'TRY', 'bank_transfer', 'pending', '${YETKISIZ}',
   now() - interval '1 day', now(), 'arvoos', 'dekont/ege.pdf',
   'dddd0000-0000-4000-8000-000000000001', 'ARV-2026-0143', 'Bu ay indirimli konuşmuştuk.'),
  ('bbbb0000-0000-4000-8000-000000000002', '${MUSTERI}', 'enterprise', 450000, 'TRY', 'bank_transfer', 'pending', 'aaaa0000-0000-4000-8000-000000000001',
   now() - interval '2 days', now(), 'arvoos', 'dekont/akademi.pdf',
   'dddd0000-0000-4000-8000-000000000001', 'ARV-2026-0144', null)
on conflict (id) do nothing;

insert into public.support_tickets
  (id, organization_id, created_by, subject, category, priority, status, last_message_at, created_at, updated_at)
values ('cccc0000-0000-4000-8000-000000000001', '${MUSTERI}', 'aaaa0000-0000-4000-8000-000000000001',
        'Fatura adresi güncellenmiyor', 'billing', 'high', 'open', now() - interval '1 day', now() - interval '2 days', now())
on conflict (id) do nothing;

insert into public.support_messages (id, ticket_id, organization_id, author_id, body, is_staff, created_at)
select gen_random_uuid(), 'cccc0000-0000-4000-8000-000000000001', '${MUSTERI}', 'aaaa0000-0000-4000-8000-000000000001',
       'Fatura adresimizi değiştirdik ama proformada eski adres görünüyor.', false, now() - interval '1 day'
where not exists (select 1 from public.support_messages where ticket_id = 'cccc0000-0000-4000-8000-000000000001');

/* İKİ ÜRÜNDE taslak: yayım kapsamının iki ürünü birden kapsadığı
   ekranda görülebilsin. */
insert into public.platform_fiyat_listesi (kod, tur, aylik_kurus, taslak_kurus, taslak_bekliyor, yayimlandi_at, updated_at)
values
  ('arvoos-baslangic', 'plan', 239000, 259000, true, now(), now()),
  ('arvolab-arastirmaci', 'plan', 49900, 54900, true, now(), now())
on conflict (kod) do update set
  aylik_kurus = excluded.aylik_kurus, taslak_kurus = excluded.taslak_kurus,
  taslak_bekliyor = excluded.taslak_bekliyor, yayimlandi_at = excluded.yayimlandi_at;

/* Kullanım Sözleşmesi ONAYLI: yoksa her panel sayfası tam ekran onay
   penceresiyle açılıyor ve altındaki ekrana tıklanamıyor. Sürüm
   gerçek sabitten (lib/sozlesme/kullanim-sozlesmesi). */
insert into public.sozlesme_onaylari
  (user_id, belge, surum, dil, metin_ozeti, kaydirma_tamamlandi, onaylandi)
values ('${KURUCU}', 'kullanim_sozlesmesi', '${SOZLESME_SURUMU}', 'tr',
        repeat('a', 64), true, now())
on conflict do nothing;
`;
