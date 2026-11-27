import { test } from "node:test";
import assert from "node:assert/strict";
import { listeAdresi, secimHali } from "../../lib/konsol/liste-secimi";

const TABAN = "/panel/platform/musteriler";

test("seçim yoksa hâl 'yok'", () => {
  assert.deepEqual(secimHali(null, ["a"], ["a"]), { hal: "yok" });
  assert.deepEqual(secimHali("   ", ["a"], ["a"]), { hal: "yok" });
});

test("çözülen ve listede görünen kayıt", () => {
  assert.deepEqual(secimHali("a", ["a", "b"], ["a", "b"]), { hal: "listede" });
});

test("kayıt duruyor ama süzgeçte yok — sessiz boş panel DEĞİL", () => {
  /*
    Kullanıcı bir kayıt seçip sonra süzgeci daraltınca kayıt listeden
    düşüyor. Panelin sessizce boşalması yanlış: kullanıcı solda
    bulamadığı bir kaydın detayına bakıyor ve nedenini bilmeli.
  */
  assert.deepEqual(secimHali("a", ["a", "b"], ["b"]), { hal: "suzgec_disinda" });
});

test("anahtar hiçbir kayda çözülmüyor: silinmiş ya da erişilemez", () => {
  /* Paylaşılan bir adres açılmış olabilir; "kayıt yok" ile
     "bu süzgeçte yok" aynı şey değil. */
  assert.deepEqual(secimHali("yok-boyle", ["a"], ["a"]), { hal: "bulunamadi" });
});

test("adres süzgeçleri korur, verilen alanı değiştirir", () => {
  const mevcut = { tur: "kurumsal", ara: "akademi", secili: "kurum:1" };
  assert.equal(
    listeAdresi(TABAN, mevcut, { tur: "bireysel" }),
    `${TABAN}?tur=bireysel&ara=akademi&secili=kurum%3A1`,
  );
});

test("null bir alanı siler: 'Listeye dön' süzgeçleri korur", () => {
  const mevcut = { tur: "kurumsal", ara: "akademi", secili: "kurum:1" };
  assert.equal(listeAdresi(TABAN, mevcut, { secili: null }), `${TABAN}?tur=kurumsal&ara=akademi`);
});

test("süzgeç değiştiren bağlantı SEÇİMİ taşır", () => {
  /* Kullanıcı süzgeci daraltırken seçtiği kaydı kaybetmemeli. */
  const adres = listeAdresi(TABAN, { tur: null, secili: "kurum:1" }, { tur: "kurumsal" });
  assert.match(adres, /secili=kurum%3A1/);
  assert.match(adres, /tur=kurumsal/);
});

test("varsayılan değer adrese yazılmaz", () => {
  /*
    `?sira=ad` ile çıplak adres aynı ekran demek; ikisini ayrı adres
    yapmak geri tuşunda iki ayrı giriş üretiyordu.
  */
  assert.equal(listeAdresi(TABAN, { sira: "ad" }, {}, { sira: "ad" }), TABAN);
  assert.equal(listeAdresi(TABAN, { sira: "ucret" }, {}, { sira: "ad" }), `${TABAN}?sira=ucret`);
});

test("boş ve yalnızca boşluk olan değerler yazılmaz", () => {
  assert.equal(listeAdresi(TABAN, { ara: "", tur: "   ", secili: undefined }), TABAN);
});
