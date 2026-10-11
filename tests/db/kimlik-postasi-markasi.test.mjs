/*
  KİMLİK POSTASININ MARKASI (davet, şifre yenileme, giriş bağlantısı).

  Kanca kurumu eskiden kullanıcının user_metadata'sından okuyordu; o
  alanı kullanıcı kendisi yazabiliyor (auth.updateUser). Yani başka bir
  kurumun kimliğini yazıp posta isteyen biri o kurumun adı, logosu ve
  İLETİŞİM BİLGİSİYLE hazırlanmış bir e-posta alıyordu.

  Sınananlar:
  1. Doğrulanmamış iddia reddediliyor, kullanıcının kendi kurumuna
     düşülüyor (asıl açık).
  2. Üyelik ya da BEKLEYEN DAVET varsa iddia kabul ediliyor — davet
     şartı olmazsa yeni davet edilen kişi Arvo markasıyla postalanırdı.
  3. Hiç kurumu olmayan kullanıcı için null (kanca Arvo markasına düşer).
  4. İşlev yalnızca service_role'a açık: parametresi kullanıcı kimliği,
     tarayıcıya açık olsaydı herkes herkesin kurumunu sorabilirdi.
*/
import { before, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { islem, reddedilir, rol, veritabani } from "./ortam.mjs";

const migration = (ad) => path.resolve(import.meta.dirname, "../../supabase/migrations/", ad);
const MIGRATIONLAR = ["20261011170211_kimlik_postasi_markasi.sql"];

const KURUM = "00000000-0000-4000-8000-00000000e1a1";
const BASKA = "00000000-0000-4000-8000-00000000e1a2";
const UYE = "00000000-0000-4000-8000-00000000e1b1";
const UYE_POSTA = "uye@kurum.com";
const DAVETLI = "00000000-0000-4000-8000-00000000e1b2";
const DAVETLI_POSTA = "davetli@kurum.com";
const KURUMSUZ = "00000000-0000-4000-8000-00000000e1b3";

let db;
const tek = async (sql, p = []) => (await db.query(sql, p)).rows[0];
const marka = async (kullanici, posta, iddia = null) =>
  (await tek(`select public.arvo_kimlik_postasi_markasi($1,$2,$3) as m`, [kullanici, posta, iddia])).m;

before(async () => {
  db = await veritabani();
  for (const ad of MIGRATIONLAR) await db.exec(fs.readFileSync(migration(ad), "utf8"));
  await rol(db, "postgres");
  await db.exec(`
    insert into auth.users (id, email) values
      ('${UYE}','${UYE_POSTA}'),('${DAVETLI}','${DAVETLI_POSTA}'),('${KURUMSUZ}','kimsesiz@x.com');
    insert into public.plans (code, name, description) values ('starter','B','');
    insert into public.organizations (id,name,slug,status,plan_code,logo_url,primary_color,contact_email,contact_phone,website_url) values
      ('${KURUM}','Akademik Merkez','am','active','starter','https://am.com/logo.png','#1f6feb','bilgi@am.com','02121112233','https://am.com'),
      ('${BASKA}','Öteki Kurum','oteki','active','starter','https://oteki.com/logo.png','#aa0000','gizli@oteki.com','05550001122','https://oteki.com');
    insert into public.organization_memberships (organization_id,user_id,role,is_active,joined_at) values
      ('${KURUM}','${UYE}','owner',true, now() - interval '10 days');
    /* Davetli: henüz ÜYELİĞİ yok, bekleyen daveti var. */
    insert into public.organization_invitations (id,organization_id,email,role,invited_by,status,expires_at,created_at,updated_at)
      values (gen_random_uuid(),'${BASKA}','${DAVETLI_POSTA}','member','${UYE}','sent', now() + interval '7 days', now(), now());
  `);
});

test("doğrulanmamış iddia reddediliyor, kendi kurumuna düşülüyor", async () => {
  await islem(db, async () => {
    await rol(db, "service_role");
    /* Üye, user_metadata'sına ÖTEKİ kurumun kimliğini yazmış olsaydı
       eskiden o kurumun markasıyla postalanırdı. */
    const m = await marka(UYE, UYE_POSTA, BASKA);
    assert.equal(m.id, KURUM, "iddia değil, kendi kurumu");
    assert.equal(m.name, "Akademik Merkez");
    assert.notEqual(m.contact_email, "gizli@oteki.com", "öteki kurumun iletişim bilgisi sızmıyor");
  });
});

test("üyelikle doğrulanan iddia kabul ediliyor", async () => {
  await islem(db, async () => {
    await rol(db, "service_role");
    const m = await marka(UYE, UYE_POSTA, KURUM);
    assert.equal(m.id, KURUM);
    assert.equal(m.logo_url, "https://am.com/logo.png");
    assert.equal(m.primary_color, "#1f6feb");
    assert.equal(m.contact_email, "bilgi@am.com");
  });
});

test("bekleyen davet de iddiayı doğruluyor (üyelik yoktur henüz)", async () => {
  await islem(db, async () => {
    await rol(db, "service_role");
    const m = await marka(DAVETLI, DAVETLI_POSTA, BASKA);
    assert.equal(m.id, BASKA, "davet edilen kişi davet eden kurumun markasıyla postalanır");
    assert.equal(m.name, "Öteki Kurum");
  });
});

test("davet BAŞKA kurumdansa iddia yine reddediliyor", async () => {
  await islem(db, async () => {
    await rol(db, "service_role");
    /* Davetlinin daveti ÖTEKİ kuruma ait; Akademik Merkez'i iddia
       etmesi kabul edilmemeli ve üyeliği de olmadığı için null. */
    assert.equal(await marka(DAVETLI, DAVETLI_POSTA, KURUM), null);
  });
});

test("iddia yoksa kendi kurumu; hiç kurumu yoksa null", async () => {
  await islem(db, async () => {
    await rol(db, "service_role");
    assert.equal((await marka(UYE, UYE_POSTA)).id, KURUM);
    assert.equal(await marka(KURUMSUZ, "kimsesiz@x.com"), null, "kanca Arvo markasına düşer");
    /* Pasif üyelik sayılmaz: işten ayrılan kişinin postası eski
       kurumun markasıyla gitmemeli. Kurum Sahibi'nin üyeliği
       tetikleyiciyle korunuyor (yalnızca bir sahip kaldırabilir), o
       yüzden sıradan bir üyeyle sınanıyor. */
    await rol(db, "postgres");
    await db.query(
      `insert into public.organization_memberships (organization_id,user_id,role,is_active,joined_at)
       values ($1,$2,'member',false, now())`, [KURUM, KURUMSUZ],
    );
    await rol(db, "service_role");
    assert.equal(await marka(KURUMSUZ, "kimsesiz@x.com"), null, "pasif üyelik markaya hak vermiyor");
  });
});

test("işlev tarayıcıdan çağrılamıyor", async () => {
  await islem(db, async () => {
    await rol(db, "authenticated", UYE);
    await reddedilir(db, `select public.arvo_kimlik_postasi_markasi($1,$2,$3)`, [UYE, UYE_POSTA, KURUM], /permission denied/i);
  });
  await islem(db, async () => {
    await rol(db, "anon");
    await reddedilir(db, `select public.arvo_kimlik_postasi_markasi($1,$2,$3)`, [UYE, UYE_POSTA, KURUM], /permission denied/i);
  });
});
