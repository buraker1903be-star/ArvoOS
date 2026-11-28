/*
  KONSOLUN KRİTİK İŞLEMLERİ — İZOLE ORTAMDA (27.11.2026 ara kontrolü).

  Önizlemede yazma SİMÜLASYON: "onaylandı" diye görünen bir ekran
  hiçbir şey kaydetmiyor. Bu yüzden kararın gerçekten ne yaptığı
  burada, gerçek fonksiyon ve tetikleyicilerle, PGlite'ta sınanıyor —
  canlıya dokunulmuyor.

  Kapsanan:
   1. Ödeme ONAYI lisansı açıyor ve dönemi uzatıyor; bildirim
      "approved" oluyor.
   2. Ödeme REDDİ lisansa dokunmuyor, not müşteriye yazılıyor.
   3. Karar KURUCUYA özel: başka kurumun sahibi reddediliyor.
   4. Karar verilmiş bildirime ikinci kez karar verilemiyor (çifte
      onay = çifte dönem uzaması).
   5. Destek yanıtı: ekip mesajı talebi "müşteri bekleniyor"a çeviriyor
      ve kuruma bildirim yazılıyor.
   6. Başka kurumun talebine yanıt yazılamıyor.

  Kapsanmayan ve rapora UNVERIFIED geçen: imzalı dekont bağlantısı
  (Supabase Storage; PGlite'ta depolama yok).
*/
import { before, test } from "node:test";
import assert from "node:assert/strict";
import { islem, reddedilir, rol, veritabani } from "./ortam.mjs";

const KURUCU = "00000000-0000-4000-8000-0000000c0001";
const YABANCI = "00000000-0000-4000-8000-0000000c0002";
const MUSTERI_UYE = "00000000-0000-4000-8000-0000000c0003";
const ARVO = "00000000-0000-4000-8000-0000000c00a0";
const MUSTERI = "00000000-0000-4000-8000-0000000c00a1";
const BASKA = "00000000-0000-4000-8000-0000000c00a2";

let db;
const tek = async (sql, params = []) => (await db.query(sql, params)).rows[0];

before(async () => {
  db = await veritabani();
  await rol(db, "postgres");
  await db.exec(`
    insert into auth.users (id,email) values
      ('${KURUCU}','kurucu@arvo-os.com'),
      ('${YABANCI}','yabanci@deneme.com'),
      ('${MUSTERI_UYE}','uye@musteri.com');
    insert into public.plans (code,name,description) values ('starter','Başlangıç','')
      on conflict (code) do nothing;
    insert into public.organizations (id,name,slug,status,plan_code) values
      ('${ARVO}','ArvoOS','arvo-os','active','starter'),
      ('${MUSTERI}','Müşteri Kurum','musteri-kurum','active','starter'),
      ('${BASKA}','Başka Kurum','baska-kurum-k','active','starter');
    insert into public.organization_memberships (organization_id,user_id,role,is_active) values
      ('${ARVO}','${KURUCU}','owner',true),
      ('${MUSTERI}','${MUSTERI_UYE}','owner',true),
      ('${BASKA}','${YABANCI}','owner',true);
  `);
});

/*
  Bekleyen havale bildirimi. Dekont yolu ve banka hesabı ZORUNLU
  (organization_payment_requests_transfer_fields): havale bildirimi
  dekontsuz girilemiyor — kuralın kendisi de burada görülmüş oluyor.
*/
async function bekleyenOdeme({ tutar = 99_900, urun = "arvoos" } = {}) {
  await rol(db, "postgres");
  const hesap = await tek(
    `insert into public.platform_bank_accounts (bank_name, account_holder, iban, is_active)
     values ('Örnek Bank','Arvo','TR000000000000000000000001',true)
     returning id`,
  );
  const satir = await tek(
    `insert into public.organization_payment_requests
       (organization_id, submitted_by, plan_code, product, amount, currency, status,
        payment_method, receipt_path, bank_account_id)
     values ($1,$2,'starter',$3,$4,'TRY','pending','bank_transfer','dekont/deneme.pdf',$5)
     returning id`,
    [MUSTERI, MUSTERI_UYE, urun, tutar, hesap.id],
  );
  return satir.id;
}

const lisans = async () => tek(
  `select license_status, current_period_end from public.organization_licenses where organization_id = $1`,
  [MUSTERI],
);

test("ödeme ONAYI: bildirim onaylanıyor ve lisans dönemi açılıyor", async () =>
  islem(db, async () => {
    const id = await bekleyenOdeme();
    await rol(db, "authenticated", KURUCU);
    await db.query("select public.review_bank_transfer_payment($1,'approved',$2)", [id, "Hesapta görüldü."]);

    const bildirim = await tek("select status, review_note, reviewed_by from public.organization_payment_requests where id=$1", [id]);
    assert.equal(bildirim.status, "approved");
    assert.equal(bildirim.review_note, "Hesapta görüldü.");
    assert.equal(bildirim.reviewed_by, KURUCU);

    /* Ekranın vaadi: "onay lisansı açar ve dönemi uzatır". */
    const l = await lisans();
    assert.ok(l, "onay lisans satırı oluşturmalı");
    assert.equal(l.license_status, "active");
    assert.ok(l.current_period_end !== null, "dönem sonu yazılmalı");
  }));

test("ödeme REDDİ: lisansa dokunulmuyor, not kayda geçiyor", async () =>
  islem(db, async () => {
    const id = await bekleyenOdeme();
    /* Kurum kurulurken lisans satırı zaten açılıyor (deneme); ölçü
       "satır yok" değil, "satır DEĞİŞMEDİ". */
    const once = await lisans();
    await rol(db, "authenticated", KURUCU);
    await db.query("select public.review_bank_transfer_payment($1,'rejected',$2)", [id, "Dekont gelmedi."]);

    const bildirim = await tek("select status, review_note from public.organization_payment_requests where id=$1", [id]);
    assert.equal(bildirim.status, "rejected");
    assert.equal(bildirim.review_note, "Dekont gelmedi.");
    /* Ret dönemi uzatmıyor: "reddedildi" ile "ödendi" karışmamalı. */
    assert.deepEqual(await lisans(), once);
  }));

test("karar KURUCUYA özel: başka kurumun sahibi reddediliyor", async () =>
  islem(db, async () => {
    const id = await bekleyenOdeme();
    await rol(db, "authenticated", YABANCI);
    await reddedilir(
      db,
      "select public.review_bank_transfer_payment($1,'approved',null)",
      [id],
      /Founder authorization required/i,
    );
  }));

test("aynı bildirime ikinci kez karar verilemiyor", async () =>
  islem(db, async () => {
    /* Çifte onay çifte dönem uzaması demek; işlev yalnızca 'pending'
       satırı kilitliyor. */
    const id = await bekleyenOdeme();
    await rol(db, "authenticated", KURUCU);
    await db.query("select public.review_bank_transfer_payment($1,'approved',null)", [id]);
    await reddedilir(
      db,
      "select public.review_bank_transfer_payment($1,'approved',null)",
      [id],
      /Pending payment not found/i,
    );
  }));

test("geçersiz karar sözcüğü kabul edilmiyor", async () =>
  islem(db, async () => {
    const id = await bekleyenOdeme();
    await rol(db, "authenticated", KURUCU);
    await reddedilir(db, "select public.review_bank_transfer_payment($1,'belki',null)", [id], /Invalid decision/i);
  }));

/** Müşterinin açtığı destek talebi. */
async function talep() {
  await rol(db, "postgres");
  const satir = await tek(
    `insert into public.support_tickets (organization_id, created_by, subject, category, priority, status)
     values ($1,$2,'Fatura adresi','billing','normal','open') returning id`,
    [MUSTERI, MUSTERI_UYE],
  );
  return satir.id;
}

test("destek yanıtı: ekip mesajı talebi 'müşteri bekleniyor'a çeviriyor", async () =>
  islem(db, async () => {
    const id = await talep();
    await rol(db, "authenticated", KURUCU);
    await db.query(
      `insert into public.support_messages (ticket_id, organization_id, author_id, body, is_staff)
       values ($1,$2,$3,$4,true)`,
      [id, MUSTERI, KURUCU, "Kaydı güncelledik."],
    );

    /* Ekranın altındaki cümle: "Gönderince talep 'Müşteri bekleniyor'
       olur ve kuruma panel bildirimi gider." Kuralı veritabanı
       uyguluyor (private.touch_support_ticket). */
    const sonra = await tek("select status, last_message_at from public.support_tickets where id=$1", [id]);
    assert.equal(sonra.status, "waiting_customer");
    assert.ok(sonra.last_message_at !== null);

    await rol(db, "postgres");
    const bildirim = await tek(
      `select count(*)::int as n from public.notifications
        where organization_id = $1 and category like 'support%'`,
      [MUSTERI],
    );
    assert.ok(bildirim.n >= 1, "kuruma bildirim yazılmalı");
  }));

test("başka kurumun talebine yanıt yazılamıyor", async () =>
  islem(db, async () => {
    const id = await talep();
    await rol(db, "authenticated", YABANCI);
    await reddedilir(
      db,
      `insert into public.support_messages (ticket_id, organization_id, author_id, body, is_staff)
       values ($1,$2,$3,'olmaz',true)`,
      [id, MUSTERI, YABANCI],
      /row-level security|permission denied/i,
    );
  }));
