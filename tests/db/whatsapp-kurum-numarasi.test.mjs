// WhatsApp: kurumun kendi numarası ve mesaj kaydı. Kurumun erişim anahtarı
// (access_token_enc) tarayıcıdan okunamamalı; mesaj kaydını yetkili üye
// görebilmeli ama yazamamalı — yazma yalnızca gönderim kapısından
// (service_role) olur. 20260921111009 canlı şema dökümünden yeni olduğu için
// burada ayrıca uygulanır (döküm yenilenince zararsız: "if not exists").
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { islem, reddedilir, rol, veritabani } from "./ortam.mjs";

const MIGRATION = path.resolve(import.meta.dirname, "../../supabase/migrations/20260921111009_whatsapp_kurum_numaralari_ve_mesaj_kaydi.sql");

const SAHIP = "00000000-0000-4000-8000-000000000001";
const YABANCI = "00000000-0000-4000-8000-000000000002";
const KURUM = "00000000-0000-4000-8000-0000000000a1";
const BASKA_KURUM = "00000000-0000-4000-8000-0000000000a2";

let db;
before(async () => {
  db = await veritabani();
  await db.exec(fs.readFileSync(MIGRATION, "utf8"));
  // Supabase yeni tabloyu varsayılan yetkiyle bu rollere açar; döküm bunu
  // taşımadığı için burada taklit ediyoruz. Asıl kapıyı RLS ve migration'daki
  // revoke tutar — test tam olarak onları sınasın.
  await db.exec("grant all on public.whatsapp_accounts, public.whatsapp_messages to anon, authenticated, service_role");
  await db.exec("revoke all on table public.whatsapp_accounts from anon, authenticated");
});

const say = async (tablo) => (await db.query(`select count(*)::int as n from public.${tablo}`)).rows[0].n;

async function tohum() {
  await rol(db, "postgres");
  await db.exec(`
    insert into auth.users (id, email) values
      ('${SAHIP}', 'sahip@example.com'), ('${YABANCI}', 'yabanci@example.com');
    insert into public.plans (code, name, description) values ('starter', 'Başlangıç', '');
    insert into public.organizations (id, name, slug, status, plan_code) values
      ('${KURUM}', 'AkademikMerkez', 'akademikmerkez', 'active', 'starter'),
      ('${BASKA_KURUM}', 'Başka Kurum', 'baska-kurum', 'active', 'starter');
    insert into public.organization_memberships (organization_id, user_id, role) values
      ('${KURUM}', '${SAHIP}', 'owner'), ('${BASKA_KURUM}', '${YABANCI}', 'owner');
    insert into public.whatsapp_accounts
      (organization_id, waba_id, phone_number_id, access_token_enc, display_phone, verified_name)
      values ('${KURUM}', 'waba-1', 'phone-1', 'v1:sifreli', '+90 532 000 00 00', 'AkademikMerkez');
    insert into public.whatsapp_messages
      (organization_id, product, sender, direction, counterpart_phone, template, status, phone_number_id)
      values ('${KURUM}', 'arvoos', 'organization', 'outbound', '905320000000', 'teklif_gonderildi', 'sent', 'phone-1');
  `);
}

describe("WhatsApp kurum numarası", () => {
  test("erişim anahtarı tablosu kimseye açılmaz", () =>
    islem(db, async () => {
      await tohum();
      for (const [kim, kullanici] of [["authenticated", SAHIP], ["anon", null]]) {
        await rol(db, kim, kullanici);
        await reddedilir(db, `select * from public.whatsapp_accounts`, [], /permission denied/);
      }
      // Sunucu (kapı) okuyabilir: token'ı çözüp Meta'ya o gider.
      await rol(db, "postgres");
      assert.equal(await say("whatsapp_accounts"), 1);
    }));

  test("yetkili üye kendi kurumunun mesajlarını görür, başkasınınkini görmez", () =>
    islem(db, async () => {
      await tohum();
      await rol(db, "authenticated", SAHIP);
      assert.equal(await say("whatsapp_messages"), 1);

      await rol(db, "authenticated", YABANCI);
      assert.equal(await say("whatsapp_messages"), 0);

      await rol(db, "anon");
      assert.equal(await say("whatsapp_messages"), 0);
    }));

  test("mesaj kaydını kullanıcı yazamaz: 'gönderildi' damgası kapıdan gelir", () =>
    islem(db, async () => {
      await tohum();
      await rol(db, "authenticated", SAHIP);
      await reddedilir(
        db,
        `insert into public.whatsapp_messages (organization_id, product, sender, direction, counterpart_phone)
         values ('${KURUM}', 'arvoos', 'organization', 'outbound', '905321112233')`,
        [],
        /row-level security/,
      );
    }));

  test("ürün ve gönderen alanları serbest metin değil", () =>
    islem(db, async () => {
      await tohum();
      await rol(db, "postgres");
      for (const [alan, deger] of [["product", "bilinmeyen"], ["sender", "musteri"], ["direction", "yatay"]]) {
        await reddedilir(
          db,
          `insert into public.whatsapp_messages (organization_id, product, sender, direction, counterpart_phone)
           values ('${KURUM}',
                   ${alan === "product" ? `'${deger}'` : "'arvoos'"},
                   ${alan === "sender" ? `'${deger}'` : "'organization'"},
                   ${alan === "direction" ? `'${deger}'` : "'outbound'"},
                   '905321112233')`,
          [],
          /check constraint/,
        );
      }
    }));

  test("kurum silinince numarası ve mesajları da gider", () =>
    islem(db, async () => {
      await tohum();
      await rol(db, "postgres");
      await db.query(`delete from public.organizations where id = $1`, [KURUM]);
      assert.equal(await say("whatsapp_accounts"), 0);
      assert.equal(await say("whatsapp_messages"), 0);
    }));
});
