/*
  MÜŞTERİYE GÖNDERME YETENEK ANAHTARINA BAĞLI.

  Teklifi müşteriye göndermek ve sözleşmeyi imzaya göndermek, ikisi de
  kurumun dışına çıkan ve geri alınamayan işlemler. Buna rağmen yetenek
  anahtarı hiçbir katmanda sorulmuyordu: kapı yalnızca RLS'teydi
  (sahip/yönetici/müdür her kaydı, fırsata atanmış satış personeli kendi
  kaydını). Sonuç tutarsızdı — aynı kullanıcı sözleşmeyi İMZAYA
  GÖNDEREBİLİYOR ama durumunu değiştiremiyordu (markContractStatus
  anahtarı istiyor), teklifi GÖNDEREBİLİYOR ama kabul işaretleyemiyordu.

  Ayarlar → Yetkilendirme ekranı da aksini söylüyordu: anahtarların
  açıklamasında "gönderir" ve "imzaya gönderir" yazıyor. Kurum anahtarı
  bir rolden alınca gönderme durmuyordu; ayar sessizce etkisizdi
  (15.10.2026).

  Bu test kaynağa bakıyor çünkü kapı bir sunucu işleminin içinde ve
  çağrı zinciri (cookie, Supabase, RLS) birim testinde kurulamıyor.
  Tutulan şey davranış değil KARAR: gönderme kardeş işlemlerle aynı
  anahtarı istesin ve düğme de o anahtara bağlı çizilsin.
*/
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const oku = (yol: string) => fs.readFileSync(path.join(process.cwd(), yol), "utf8");

/** Bir işlevin gövdesi (başından itibaren, kapıyı görecek kadar). */
function govde(kaynak: string, ad: string): string {
  const bas = kaynak.indexOf(`async function ${ad}(`);
  assert.ok(bas > -1, `${ad} bulunamadı`);
  return kaynak.slice(bas, bas + 900);
}

describe("müşteriye gönderme yetkisi", () => {
  const teklifIslemleri = oku("app/panel/crm/proposal-actions.ts");
  const sozlesmeIslemleri = oku("app/panel/crm/contract-actions.ts");

  test("teklif bağlantısı crm.teklif.yonet istiyor", () => {
    const g = govde(teklifIslemleri, "issueProposalLink__impl");
    assert.match(g, /yetkiler\.has\("crm\.teklif\.yonet"\)/);
    assert.match(g, /throw new Error/, "anahtar yoksa işlem durmalı");
  });

  test("sözleşme imza bağlantısı crm.sozlesme.yonet istiyor", () => {
    const g = govde(sozlesmeIslemleri, "issueContractLink__impl");
    assert.match(g, /yetkiler\.has\("crm\.sozlesme\.yonet"\)/);
    assert.match(g, /throw new Error/, "anahtar yoksa işlem durmalı");
  });

  /*
    Kardeşleriyle aynı anahtar: göndermeyi ayrı bir anahtara bağlamak,
    kurumun iki yerden yönettiği bir kural demek olurdu.
  */
  test("kardeş işlemler aynı anahtarı istemeye devam ediyor", () => {
    for (const ad of ["fastTrackProposalToContract__impl", "resolveProposal__impl"]) {
      assert.match(govde(teklifIslemleri, ad), /yetkiler\.has\("crm\.teklif\.yonet"\)/, ad);
    }
    assert.match(
      govde(sozlesmeIslemleri, "markContractStatus__impl"),
      /yetkiler\.has\("crm\.sozlesme\.yonet"\)/,
    );
  });

  /*
    ÜÇÜNCÜ KATMAN. Yetkisi olmayana düğmeyi gösterip sunucuda reddetmek,
    hatayı tıklamadan önce söylememek demek (AGENTS.md: yetki üç
    yerdedir, üçü de gerekir).
  */
  test("düğmeler de anahtara bağlı çiziliyor", () => {
    const teklifSayfasi = oku("app/panel/crm/proposals/[id]/page.tsx");
    assert.match(teklifSayfasi, /const teklifYonetir = izin\("crm\.teklif\.yonet"\)/);
    assert.match(teklifSayfasi, /!teklifYonetir \? null/, "gönder düğmesi yetkisize çizilmemeli");

    const sozlesmeSayfasi = oku("app/panel/crm/contracts/[id]/page.tsx");
    assert.match(sozlesmeSayfasi, /const imzayaGonderir = izin\("crm\.sozlesme\.yonet"\)/);
    assert.match(sozlesmeSayfasi, /imzayaGonderir \? imzayaGonder/, "imza düğmesi yetkisize çizilmemeli");
  });
});
