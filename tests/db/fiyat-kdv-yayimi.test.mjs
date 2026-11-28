/*
  KDV DAHİL FİYAT YAYIMI (20261028152947).

  Sınananlar:
  1. Eski (KDV hariç) rakamla yayımlanmış satır yeni rakama iner; satırı
     hiç olmayan basamak da yayımlanır — site her iki durumda da yeni
     fiyatı okur (anon yalnızca yayımlıyı görür).
  2. Bekleyen eski taslak düşer: sonraki toplu yayım fiyatı geri
     indirmez.
  3. Satıştan kalkan arvolab-ekip koda döner ve sitede görünmez.
  4. Geçmişe 'yayim' satırı önceki tutarıyla yazılır.

  Migration bu dosyada uygulanıyor, ortam.mjs'nin ortak listesinde değil:
  orada olsaydı her akış testi yayımlı bir fiyat listesiyle başlardı ve
  fiyat-gecmisi.test.mjs'nin "yayımlanmadan site görmez" senaryosu
  anlamını yitirirdi.
*/
import { before, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { islem, rol, veritabani } from "./ortam.mjs";

const MIGRATION = fs.readFileSync(path.resolve(import.meta.dirname, "../../supabase/migrations/20261028152947_fiyatlar_kdv_dahil_yayim.sql"), "utf8");

let db;
before(async () => {
  db = await veritabani();
});

const yayimli = async () => Object.fromEntries((await db.query(
  `select kod, aylik_kurus from public.platform_fiyat_listesi order by kod`)).rows.map((r) => [r.kod, Number(r.aylik_kurus)]));

test("eski yayım ve taslak yeni KDV dahil listeye iner, Ekip koda döner", async () =>
  islem(db, async () => {
    await rol(db, "postgres");
    await db.exec(`
      insert into public.platform_fiyat_listesi (kod, tur, aylik_kurus, taslak_kurus, taslak_bekliyor, yayimlandi_at, updated_at) values
        ('arvoos-baslangic', 'plan', 199000, 219000, true, now(), now()),
        ('arvolab-ekip', 'plan', 149000, null, false, now(), now());
    `);
    /*
      28.10.2026'DAKİ ŞEMA GERİ KURULUYOR. Bu migration gerçek dosyadan
      okunuyor ve `on conflict (kod)` yazıyor — o gün birincil anahtar
      tek sütunluydu. 28.11.2026'da anahtar (kod, para_birimi) oldu;
      yani bu TARİHSEL migration bugünkü şemada yeniden ÇALIŞTIRILAMAZ
      ("no unique or exclusion constraint matching the ON CONFLICT
      specification"). Üretimde sorun değil (migration bir kez
      uygulandı), ama düzenek tarihi yeniden oynuyor: anahtar o günkü
      hâline alınıp sonrasında geri konuyor. Eski bir migration'ın
      yeniden uygulanamaz olması, yeni anahtarın ÇALIŞTIĞININ da
      kanıtı.
    */
    await db.exec(`
      alter table public.platform_fiyat_listesi drop constraint platform_fiyat_listesi_pkey;
      alter table public.platform_fiyat_listesi add constraint platform_fiyat_listesi_pkey primary key (kod);
    `);
    await db.exec(MIGRATION);
    await db.exec(`
      alter table public.platform_fiyat_listesi drop constraint platform_fiyat_listesi_pkey;
      alter table public.platform_fiyat_listesi add constraint platform_fiyat_listesi_pkey primary key (kod, para_birimi);
    `);

    await rol(db, "anon");
    const f = await yayimli();
    assert.equal(f["arvoos-baslangic"], 239000);
    assert.equal(f["arvoos-kurumsal"], 719000);
    assert.equal(f["arvolab-arastirmaci"], 499000);
    assert.equal(f["randevu-tek"], 89900);
    assert.equal(f["ek-kullanici"], 29900);
    assert.equal(f["arvolab-ekip"], undefined, "satıştan kalkan basamak sitede görünmemeli");

    await rol(db, "postgres");
    const { rows: [bekleyen] } = await db.query(`select count(*)::int as n from public.platform_fiyat_listesi where taslak_bekliyor`);
    assert.equal(bekleyen.n, 0, "eski taslak düşmeli");

    const { rows: g } = await db.query(
      `select islem, onceki_kurus, onceki_yayimli, yeni_kurus from public.platform_fiyat_gecmisi where kod = 'arvoos-baslangic' order by id desc limit 1`);
    assert.deepEqual([g[0].islem, Number(g[0].onceki_kurus), g[0].onceki_yayimli, Number(g[0].yeni_kurus)], ["yayim", 199000, true, 239000]);
    const { rows: e } = await db.query(`select islem from public.platform_fiyat_gecmisi where kod = 'arvolab-ekip' order by id desc limit 1`);
    assert.equal(e[0].islem, "koda_donus");
  }));
