/*
  Doçentlik testlerinin ortak tohumu (F6 PR3). Test dosyası değil: glob
  yalnızca *.test.mjs'i koşuyor.

  İki kurum da izin listesinde ve modül ikisinde de açık. İkinci kurumun
  açık olması bilerek: kurumlar arası yalıtımı sınayan bir test, öteki
  kurumun modülü zaten kapalıysa hiçbir şey ölçmez (kapı her şeyi
  reddeder). Yabancı kurumun sahibi orada her yetkiye sahip.

  Aktörler (8): anon, sahip (akademisyen, verinin sahibi), üye (aynı kurum,
  yetkisiz), gözetim (docentlik.tumunu_gor, ROL düzeyinde verildi),
  yönetici (kriter_yonet + uak_yonet, KİŞİ düzeyinde verildi), Kurum Sahibi
  (owner), yabancı (başka kurumun sahibi), service_role.
*/
import { rol } from "./ortam.mjs";

export const AM = "00000000-0000-4000-8000-00000000d0a1";
export const AM2 = "00000000-0000-4000-8000-00000000d0a2";

export const K = {
  sahip: "00000000-0000-4000-8000-00000000d011",
  uye: "00000000-0000-4000-8000-00000000d012",
  gozetim: "00000000-0000-4000-8000-00000000d013",
  yonetici: "00000000-0000-4000-8000-00000000d014",
  kurumSahibi: "00000000-0000-4000-8000-00000000d015",
  yabanci: "00000000-0000-4000-8000-00000000d016",
  iptal: "00000000-0000-4000-8000-00000000d017",
  /* Rolü (admin) tumunu_gor taşıyor ama kişi kuralı onu KAPATIYOR. */
  gozetimKapali: "00000000-0000-4000-8000-00000000d018",
};

export const R = {
  kriter: "00000000-0000-4000-8000-00000000d101",
  kriterSil: "00000000-0000-4000-8000-00000000d102",
  kriterAm2: "00000000-0000-4000-8000-00000000d103",
  hedef: "00000000-0000-4000-8000-00000000d201",
  faaliyet: "00000000-0000-4000-8000-00000000d301",
  faaliyetIptal: "00000000-0000-4000-8000-00000000d302",
  faaliyetAm2: "00000000-0000-4000-8000-00000000d303",
  uak: "00000000-0000-4000-8000-00000000d401",
};

export async function tohumla(db) {
  await rol(db, "postgres");
  await db.exec(`
    insert into auth.users (id, email) values
      ('${K.sahip}','sahip@am.test'),('${K.uye}','uye@am.test'),('${K.gozetim}','gozetim@am.test'),
      ('${K.yonetici}','yonetici@am.test'),('${K.kurumSahibi}','kurum@am.test'),('${K.yabanci}','sahip@am2.test'),
      ('${K.iptal}','iptal@am.test'),('${K.gozetimKapali}','gozkapali@am.test');
    insert into public.plans (code, name, description) values ('starter','Başlangıç','') on conflict do nothing;
    insert into public.organizations (id, name, slug, status, plan_code) values
      ('${AM}','AkademikMerkez Deneme','am-deneme','active','starter'),
      ('${AM2}','İkinci Kurum','ikinci-kurum','active','starter');
    insert into public.organization_memberships (organization_id, user_id, role, is_active) values
      ('${AM}','${K.sahip}','member',true),('${AM}','${K.uye}','member',true),
      ('${AM}','${K.gozetim}','admin',true),('${AM}','${K.yonetici}','manager',true),
      ('${AM}','${K.kurumSahibi}','owner',true),('${AM}','${K.iptal}','member',false),
      ('${AM}','${K.gozetimKapali}','admin',true),
      ('${AM2}','${K.yabanci}','owner',true);
    insert into public.role_capability_permissions (organization_id, role, capability_key, allowed, updated_at) values
      ('${AM}','admin','docentlik.tumunu_gor',true,now());
    insert into public.member_capability_permissions (organization_id, user_id, capability_key, allowed, updated_at) values
      ('${AM}','${K.yonetici}','docentlik.kriter_yonet',true,now()),
      ('${AM}','${K.yonetici}','docentlik.uak_yonet',true,now()),
      ('${AM}','${K.gozetimKapali}','docentlik.tumunu_gor',false,now());
    insert into public.ozel_modul_kurumlari (module_code, organization_id) values ('docentlik','${AM}'),('docentlik','${AM2}');
    insert into public.organization_modules (organization_id, module_code, is_enabled) values
      ('${AM}','docentlik',true),('${AM2}','docentlik',true);

    insert into public.docentlik_kriterleri (id, organization_id, code, label, category_group, points_per_unit, baslica_yazar_katsayisi, diger_yazar_katsayisi) values
      ('${R.kriter}','${AM}','A1','Uluslararası makale','Makaleler',20,0.8,0.5),
      ('${R.kriterSil}','${AM}','Z9','Silinecek kriter',null,1,null,null),
      ('${R.kriterAm2}','${AM2}','A1','Öteki kurumun kriteri','Makaleler',99,null,null);
    insert into public.docentlik_hedefleri (id, organization_id, grup, asgari_puan) values
      ('${R.hedef}','${AM}',null,100);
    insert into public.docentlik_profilleri (organization_id, owner_id, doktora_tarihi, temel_alan) values
      ('${AM}','${K.sahip}','2020-06-15','Eğitim Bilimleri');
    insert into public.docentlik_faaliyetleri (id, organization_id, owner_id, criteria_id, title, unit_count, yazar_sayisi, baslica_yazar, faaliyet_tarihi) values
      ('${R.faaliyet}','${AM}','${K.sahip}','${R.kriter}','Makale',2,3,false,'2022-01-10'),
      ('${R.faaliyetIptal}','${AM}','${K.iptal}','${R.kriter}','Eski üyenin makalesi',1,1,true,null),
      ('${R.faaliyetAm2}','${AM2}','${K.yabanci}','${R.kriterAm2}','Öteki kurumun faaliyeti',1,1,true,null);
    insert into public.docentlik_uak_tablolari (id, organization_id, temel_alan, donem, depo_yolu) values
      ('${R.uak}','${AM}','Eğitim Bilimleri','2026 Ekim','${AM}/uak/00000000-0000-4000-8000-00000000d501/tablo.pdf');
  `);
}

/** Sorguyu kayıt noktası içinde dener: hata işlemi bozmaz, sonuç ya satırlar ya hata. */
export async function dene(db, sql, params = []) {
  await db.exec("savepoint dene");
  try {
    const sonuc = await db.query(sql, params);
    await db.exec("release savepoint dene");
    return { ok: true, rows: sonuc.rows };
  } catch (hata) {
    await db.exec("rollback to savepoint dene");
    return { ok: false, rows: [], hata: hata.message };
  }
}

/** Aktör → (veritabanı rolü, kullanıcı). */
export const AKTORLER = {
  anon: ["anon", null],
  sahip: ["authenticated", K.sahip],
  uye: ["authenticated", K.uye],
  gozetim: ["authenticated", K.gozetim],
  yonetici: ["authenticated", K.yonetici],
  kurumSahibi: ["authenticated", K.kurumSahibi],
  yabanci: ["authenticated", K.yabanci],
  service_role: ["service_role", null],
};

export const aktorOl = (db, ad) => rol(db, AKTORLER[ad][0], AKTORLER[ad][1]);

/*
  ÜAK DOSYASI (F6 PR8 ad kilidi, 20261115154855). ÜAK kaydı kullanıcı
  oturumuyla ancak çağıranın SON 1 SAATTE yüklediği, temizlikte olmayan bir
  nesneye yazılabiliyor — gerçek akış "önce yükle, sonra kaydet". PGlite'ta
  storage şeması yok: gerçek Supabase'deki sütun adlarıyla (owner, owner_id,
  created_at, metadata) küçük bir taklit. Rol postgres'te bırakılır; çağıran
  aktörüne geri döner. İşlem (islem) içinde çağrılır, sonunda geri alınır.
*/
export async function depoNesnesi(db, yol, sahip) {
  await rol(db, "postgres");
  await db.exec(`create schema if not exists storage;
    create table if not exists storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid, metadata jsonb, unique (bucket_id, name));
    alter table storage.objects add column if not exists owner_id text;
    alter table storage.objects add column if not exists created_at timestamptz default now();
    grant usage on schema storage to anon, authenticated, service_role;`);
  await db.query(`insert into storage.objects (bucket_id, name, owner, owner_id, metadata)
    values ('docentlik-belgeleri', $1, $2::uuid, $3::text, '{"mimetype":"application/pdf","size":10}')`, [yol, sahip, sahip]);
}
