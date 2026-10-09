/*
  OKUNMAMIŞ POSTA ROZETİ HER ZAMAN GÖRÜNÜR KALMALI.

  Rozetin tek işi hiçbir şey açmadan görünmek. Sessiz bozulma yolları
  ekranda "hata" gibi durmuyor, yalnızca rozet yokmuş gibi duruyor:

   1. Posta girdisi "Diğer Arvo ürünleri" listesine (digerUygulamalar)
      taşınırsa. Eski menüde öyle başlamıştı; rozet pencerenin içindeyken
      görmek için pencereyi açmak gerekiyordu, yani hiçbir işe yaramıyordu.
   2. Rozeti gizleyen bir kural. Eski kenar menüsünde daraltılınca
      kayboluyordu; 2026-10'dan beri posta dock'un kendi uygulaması ve
      dock daraltılmıyor (app/panel/os). Rozeti gizleyen bir CSS kuralı
      eklenirse bu test yakalar.

  Sayım da burada sabitleniyor: rozetin gösterdiği sayı, rozete basınca
  açılan listeyle aynı olmalı (/panel/posta süzgeçsiz açılıyor).
*/
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { osUygulamalari } from "@/app/panel/os/os-apps";

const oku = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");
const LAYOUT = oku("app/panel/layout.tsx");
const DOCK = oku("app/panel/os/os-dock.tsx");
const SHELL_CSS = oku("app/panel/os-shell.css");
const ACTIONS = oku("app/panel/posta/actions.ts");

describe("posta okunmamış rozeti", () => {
  test("Posta dock'un kendi uygulaması, rozetiyle; diğer ürünler listesinde değil", () => {
    const apps = osUygulamalari({ modules: [], posta: { okunmamis: 7 } });
    assert.equal(apps.find((u) => u.key === "posta")?.rozet, 7);
    assert.match(LAYOUT, /posta:\s*postaGorunur\s*\?\s*\{\s*okunmamis:\s*postaOkunmamis\s*\}/, "kabuk posta sayısını dock'a vermiyor");
    assert.doesNotMatch(
      LAYOUT,
      /digerUygulamalar\s*=\s*\[[\s\S]{0,400}?posta/,
      "posta digerUygulamalar listesine geri konmuş: rozet pencerenin içinde kalır",
    );
  });

  test("dock rozeti gizlenmiyor", () => {
    const kurallar = [...SHELL_CSS.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/([^{}]+)\{([^{}]*)\}/g)];
    const gizleyen = kurallar.find(([, secici, govde]) => /os-dock-badge/.test(secici) && /display\s*:\s*none|visibility\s*:\s*hidden|opacity\s*:\s*0\b/.test(govde));
    assert.equal(gizleyen, undefined, `rozeti gizleyen kural: ${gizleyen?.[1]?.trim()}`);
    assert.match(DOCK, /className="os-dock-badge"/, "dock rozeti çizmiyor");
  });

  test("sayı 99+ ile sınırlanıyor (dock ikonuna sığmayan rakam yok)", () => {
    assert.match(DOCK, /rozet\s*>\s*99\s*\?\s*"99\+"/, "dock: 99+ sınırı yok");
  });

  test("sayım, rozete basınca açılan listeyle aynı kümeyi sayıyor", () => {
    // İfadenin TAMAMI alınıyor (atamadan noktalı virgüle): sonuna eklenen
    // bir süzgeç, tembel eşleşmede metnin dışında kalıyordu.
    // Sorgu yerleşimin paralel adımından önce kendi adıyla kuruluyor (2026-10).
    const bas = LAYOUT.indexOf("const postaSayimSorgusu");
    assert.notEqual(bas, -1, "layout okunmamış konuşmaları saymıyor");
    const sayim = LAYOUT.slice(bas, LAYOUT.indexOf(";", bas) + 1);
    assert.match(sayim, /from\("mail_threads"\)/);
    assert.match(sayim, /\.eq\("okunmamis", true\)/);
    assert.match(sayim, /count:\s*"exact",\s*head:\s*true/, "satırları çekmeden saymalı");
    assert.deepEqual(
      [...sayim.matchAll(/\.eq\("(\w+)"/g)].map((m) => m[1]).sort(),
      ["okunmamis", "organization_id"],
      "sayıma fazladan süzgeç girmiş: /panel/posta süzgeçsiz açılıyor, sayı tutmaz",
    );
  });

  test("okundu yapınca panel kabuğu da yenileniyor", () => {
    // Rozet kabukta; yalnızca posta yollarını yenilemek, kişi başka
    // bir modüle geçtiğinde eski sayıyı bırakırdı.
    const govde = ACTIONS.slice(ACTIONS.indexOf("konusmayiOkundu__impl"));
    assert.match(govde, /revalidatePath\("\/panel",\s*"layout"\)/);
  });
});
