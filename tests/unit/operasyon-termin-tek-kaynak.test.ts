/*
  TERMİN DÖRT EKRANDA DA AYNI CÜMLEYİ KURAR.

  Aynı hesap dört yerde ayrı yazılıydı ve dördü farklı konuşuyordu:
    * genel bakış  → "3 gün kaldı"
    * işler tablosu → yalnızca "Gecikti"
    * iş detayı     → kendi dueInfo'su: "İş tamamlandı",
                      "Teslim tarihi girilmemiş", uzak termin YEŞİL
    * pano          → hiç yoktu; oradaki "0 gün" kalan günü değil
                      aşamada geçen günü sayıyordu

  Kurum haklı olarak "pano ile işler senkron değil" dedi. Kopyalar
  silindi, hepsi ops-shared/dueBadge'i çağırıyor. Bu test iki şeyi
  tutuyor: fonksiyonun yanıtları ve KOPYANIN GERİ GELMEMESİ.
*/
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { dueBadge } from "@/lib/operasyon-termin";

const BUGUN = "2026-10-01";
const kok = (...p: string[]) => path.resolve(import.meta.dirname, "../../", ...p);

describe("operasyon termini tek kaynakta", () => {
  test("her durum için tek bir yanıt", () => {
    assert.deepEqual(dueBadge("2026-09-29", BUGUN), { tone: "danger", label: "2 gün gecikti", late: true });
    assert.deepEqual(dueBadge(BUGUN, BUGUN), { tone: "warning", label: "Bugün teslim", late: false });
    assert.deepEqual(dueBadge("2026-10-03", BUGUN), { tone: "warning", label: "2 gün kaldı", late: false });
    // Uzak termin "info": 57 gün sonrası bir BAŞARI değil, bilgi.
    assert.deepEqual(dueBadge("2026-11-27", BUGUN), { tone: "info", label: "57 gün kaldı", late: false });
    assert.deepEqual(dueBadge(null, BUGUN), { tone: "neutral", label: "Tarih girilmedi", late: false });
    // Bitmiş işte tarih ne olursa olsun gecikme yok.
    assert.deepEqual(dueBadge("2026-09-01", BUGUN, "completed"), { tone: "success", label: "Tamamlandı", late: false });
    assert.deepEqual(dueBadge("2026-09-01", BUGUN, "archived"), { tone: "success", label: "Tamamlandı", late: false });
  });

  test("dört ekran da bu fonksiyonu çağırıyor", () => {
    const ekranlar = [
      "app/panel/operations/page.tsx",
      "app/panel/operations/isler/page.tsx",
      "app/panel/operations/[id]/page.tsx",
      "app/panel/operations/pano/pano-tahtasi.tsx",
    ];
    for (const ekran of ekranlar) {
      assert.match(fs.readFileSync(kok(ekran), "utf8"), /dueBadge\s*\(/, `${ekran} dueBadge çağırmalı`);
    }
  });

  test("kopya hesap geri gelmemiş", () => {
    /*
      Kopyayı yakalamanın yolu: operasyon ekranlarında "gün kaldı" /
      "gün gecikti" metni YALNIZCA ops-shared'da yazılı olmalı. Bir
      ekran kendi cümlesini kurmaya başlarsa senkron yine bozulur ve
      bu test kırmızıya döner.
    */
    const dizin = kok("app/panel/operations");
    const dosyalar = fs
      .readdirSync(dizin, { recursive: true })
      .filter((d): d is string => typeof d === "string" && /\.tsx?$/.test(d))
      .map((d) => path.join(dizin, d))
      .filter((d) => !d.endsWith("ops-shared.tsx"));
    /*
      Yorumlar ayıklanıyor: kararı ANLATAN yorumlar da aynı sözleri
      içeriyor ("… panoda hiç yoktu, detayda 'Bugün teslim' diyordu").
      Onları suçlu saymak, gerekçeyi yazmayı cezalandırmak olurdu.
    */
    const kodu = (metin: string) => metin.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    const suclular = dosyalar.filter((d) => /gün kaldı|gün gecikti|Bugün teslim/.test(kodu(fs.readFileSync(d, "utf8"))));
    assert.deepEqual(
      suclular.map((d) => path.relative(dizin, d)),
      [],
      "Termin metni ops-shared/dueBadge dışında yazılmamalı",
    );
  });
});
