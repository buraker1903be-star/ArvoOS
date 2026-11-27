import { test } from "node:test";
import assert from "node:assert/strict";
import { kuyrukDurumu, kuyrukMetni } from "../../lib/konsol/karar-kuyrugu";

/*
  27.11.2026'daki bulgu: paylaşılan karede "Bekleyen karar yok" ile
  "Destek talepleri okunamadı" AYNI ANDA yazıyordu. İki bilgi birbirinden
  bağımsız çiziliyordu; yönetici "iş yok mu, bilmiyor muyuz?" diye
  soruyordu. Testler dört hâli ve metinlerini sabitliyor.
*/

test("her kaynak okundu, kayıt var: dolu", () => {
  const d = kuyrukDurumu({ kalemSayisi: 3, okunamayan: [] });
  assert.deepEqual(d, { tur: "dolu", okunamayan: [] });
  /* Dolu hâlde metin yok: kart kalemleri çiziyor. */
  assert.equal(kuyrukMetni(d), null);
});

test("her kaynak okundu, kayıt yok: gerçekten boş", () => {
  const d = kuyrukDurumu({ kalemSayisi: 0, okunamayan: [] });
  assert.equal(d.tur, "bos");
  const m = kuyrukMetni(d);
  assert.equal(m?.baslik, "Bekleyen karar yok.");
  assert.equal(m?.aciklama, undefined);
  /* İyi haber uyarı tonu almaz. */
  assert.equal(m?.ton, "notr");
});

test("kaynak okunamadı ve kayıt yok: 'yok' DEĞİL, 'eksik'", () => {
  const d = kuyrukDurumu({ kalemSayisi: 0, okunamayan: ["Destek talepleri"] });
  assert.equal(d.tur, "eksik_bos");
  const m = kuyrukMetni(d);
  assert.equal(m?.baslik, "Karar listesi eksik.");
  assert.match(m?.aciklama ?? "", /Destek talepleri okunamadı/);
  /* Asıl kural: bu hâlde "Bekleyen karar yok" YAZILMAZ. */
  assert.doesNotMatch(m?.baslik ?? "", /Bekleyen karar yok/);
  assert.equal(m?.ton, "uyari");
});

test("kaynak okunamadı ama kayıt var: kısmi", () => {
  const d = kuyrukDurumu({ kalemSayisi: 2, okunamayan: ["Yenilemeler", "Destek talepleri"] });
  assert.equal(d.tur, "kismi");
  const m = kuyrukMetni(d);
  assert.equal(m?.baslik, "Karar listesi eksik.");
  assert.match(m?.aciklama ?? "", /Yenilemeler, Destek talepleri okunamadı/);
  /* Bulunan işler gizlenmez; metin onların "ibaret" olduğunu söyler. */
  assert.match(m?.aciklama ?? "", /bulunanlardan ibaret/);
});

test("aynı kaynak iki kez bildirilirse bir kez yazılır, sıra korunur", () => {
  const d = kuyrukDurumu({ kalemSayisi: 0, okunamayan: ["Ödeme bildirimleri", "Destek talepleri", "Ödeme bildirimleri"] });
  assert.deepEqual(d.okunamayan, ["Ödeme bildirimleri", "Destek talepleri"]);
});

test("boş adlar kaynak sayılmaz", () => {
  /* Çağıran taraf listeyi filter(Boolean) ile kuruyor ama boş bir dize
     geçerse "okunamadı" hâline düşülmemeli: ortada bildirilmiş bir
     kaynak yok. */
  const d = kuyrukDurumu({ kalemSayisi: 0, okunamayan: ["", "   "] });
  assert.equal(d.tur, "bos");
});
