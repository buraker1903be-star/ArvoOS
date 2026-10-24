import assert from "node:assert/strict";
import test from "node:test";
import { TALEP_ADIMLARI, kazanildi, nitelikliAday, talepAdimi, teklifeGecti, temasKuruldu } from "@/lib/talep-asamalari";

/* Talep detayındaki aşama çizgisi: genel ve akademik kurum kodları aynı beş adıma. */

test("beş adım", () => {
  assert.deepEqual([...TALEP_ADIMLARI], ["Yeni", "İnceleme", "Teklif", "Sözleşme", "İş"]);
});

test("genel kurum aşamaları", () => {
  assert.deepEqual(["lead", "qualified", "proposal", "contract", "won"].map(talepAdimi), [0, 1, 2, 3, 4]);
});

test("akademik kurum aşamaları aynı adımlara düşer", () => {
  assert.equal(talepAdimi("academic_review"), 1);
  assert.equal(talepAdimi("proposal_approved"), 2);
  assert.equal(talepAdimi("payment_pending"), 3);
  assert.equal(talepAdimi("expert_assigned"), 4);
});

test("arşivlenmiş ya da bilinmeyen aşama çizgide yok", () => {
  assert.equal(talepAdimi("lost"), null);
  assert.equal(talepAdimi("tanimsiz"), null);
});

test("çizgi bağlı kayıtlarla ilerler, geri gitmez", async () => {
  const { talepAdimiZincirle } = await import("@/lib/talep-asamalari");
  // Teklif aşamasında kalmış ama sözleşmesi imzalı ve işi açık talep: İş.
  assert.equal(talepAdimiZincirle("proposal", { sozlesmeVar: true, isVar: true }), 4);
  // Yalnızca sözleşme: Sözleşme.
  assert.equal(talepAdimiZincirle("proposal", { sozlesmeVar: true, isVar: false }), 3);
  // Zincir yoksa kendi aşaması.
  assert.equal(talepAdimiZincirle("qualified", { sozlesmeVar: false, isVar: false }), 1);
  // Kendi aşaması ilerideyse geri gitmez.
  assert.equal(talepAdimiZincirle("won", { sozlesmeVar: false, isVar: false }), 4);
  // Arşivlenmiş talep arşivde kalır.
  assert.equal(talepAdimiZincirle("lost", { sozlesmeVar: true, isVar: true }), null);
});

/* ---------- Huni yüklemleri ---------- */

test("akademik aşamaları da tanır", () => {
  /*
    Raporlardaki huni koda yazılı altı aşamayla karar veriyordu;
    akademik kurumların ayrıntılı aşamaları listede olmadığı için
    ilerlemiş talepler "ulaşılamamış" sayılıyor ve dönüşüm oranı
    olduğundan küçük çıkıyordu (24.10.2026'da düzeltildi).
  */
  for (const asama of ["pre_review", "academic_review", "proposal_ready", "proposal_approved",
                       "contract_ready", "payment_pending", "payment_approved",
                       "work_opened", "expert_assigned", "delivery", "completed"]) {
    assert.equal(temasKuruldu(asama), true, `${asama} temas sayılmalı`);
    assert.equal(nitelikliAday(asama), true, `${asama} nitelikli sayılmalı`);
  }
});

test("klasik aşamalarda eski davranışı korur", () => {
  assert.equal(temasKuruldu("lead"), false);
  assert.equal(nitelikliAday("lead"), false);
  for (const asama of ["qualified", "proposal", "contract", "payment", "won"]) {
    assert.equal(temasKuruldu(asama), true);
    assert.equal(nitelikliAday(asama), true);
  }
});

test("arşivlenmiş talep temas sayılır, nitelikli sayılmaz", () => {
  /* Müşteriyle görüşülmemiş olsa kaybedildi diye işaretlenmezdi,
     ama artık aday değil. */
  assert.equal(temasKuruldu("lost"), true);
  assert.equal(nitelikliAday("lost"), false);
  assert.equal(teklifeGecti("lost"), false);
  assert.equal(kazanildi("lost"), false);
});

test("teklife geçiş ikinci adımdan başlar", () => {
  assert.equal(teklifeGecti("qualified"), false);
  assert.equal(teklifeGecti("academic_review"), false);
  assert.equal(teklifeGecti("proposal"), true);
  assert.equal(teklifeGecti("proposal_ready"), true);
  assert.equal(teklifeGecti("contract_ready"), true);
  assert.equal(teklifeGecti("completed"), true);
});

test("kazanılan yalnızca son adım", () => {
  assert.equal(kazanildi("won"), true);
  assert.equal(kazanildi("work_opened"), true);
  assert.equal(kazanildi("delivery"), true);
  assert.equal(kazanildi("completed"), true);
  assert.equal(kazanildi("payment"), false);
  assert.equal(kazanildi("contract_ready"), false);
});

test("bilinmeyen aşama hiçbir kümeye girmez", () => {
  for (const asama of ["__proto__", "", "bilinmeyen"]) {
    assert.equal(temasKuruldu(asama), false);
    assert.equal(nitelikliAday(asama), false);
    assert.equal(teklifeGecti(asama), false);
    assert.equal(kazanildi(asama), false);
  }
});

/*
  EŞLEME, KISITIN TAMAMINI KAPSAMALI (24.10.2026).

  `crm_opportunities.stage` kısıtı on sekiz değere izin veriyor;
  eşlemede olmayan bir aşama `talepAdimi`'nden null dönüyor ve
  "arşivlenmiş" gibi davranıyor — aşama çizgisinde boş, huni
  yüklemlerinde yok. Tam bu oldu: `payment` eşlemede hiç yoktu ve
  sözleşmesi imzalanıp ödeme bekleyen talep arşivlenmiş sayılıyordu.

  Bu test izinli aşamaları ŞEMA DÖKÜMÜNDEN okuyor: yeni bir aşama
  migration'la eklenip döküm yenilendiğinde test düşer ve eşlemenin
  güncellenmesi gerektiğini söyler. Tek bilinçli istisna "lost".
*/
test("kısıttaki her aşama bir adıma eşleniyor ('lost' hariç)", async () => {
  const { readFileSync } = await import("node:fs");
  const sema = readFileSync(new URL("../../supabase/schema/canli-sema.sql", import.meta.url), "utf8");
  const eslesme = sema.match(
    /alter table public\.crm_opportunities add constraint crm_opportunities_stage_check CHECK \(\(stage = ANY \(ARRAY\[(.*?)\]\)\)\)/,
  );
  assert.ok(eslesme, "stage kısıtı dökümde bulunamadı");
  const asamalar = [...eslesme[1].matchAll(/'([^']+)'::text/g)].map((m) => m[1]);
  assert.ok(asamalar.length >= 18, `kısıtta ${asamalar.length} aşama — beklenenden az`);
  for (const asama of asamalar) {
    if (asama === "lost") {
      assert.equal(talepAdimi(asama), null, "arşivlenmiş talep bilerek adımsız");
      continue;
    }
    assert.notEqual(talepAdimi(asama), null, `${asama} aşaması eşlemede yok — çizgide ve hunide kaybolur`);
  }
});
