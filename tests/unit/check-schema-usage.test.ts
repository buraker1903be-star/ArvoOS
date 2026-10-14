import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";

/*
  ŞEMA DENETİMİNİN KENDİSİNİN SINANMASI.

  Denetim sessizce kör kaldığında denetlediği hatadan farksız olur: yeşil
  bir çıktı "sorun yok" diye okunur. 27.09.2026'da denetimin iki kör
  noktası aynı gün, aynı dosyada ortaya çıktı ve ikisi de "zincir bitişik
  metindir" varsayımından geliyordu:

    1. KAÇIRMA — koşullu süzgeç. `let sorgu = supabase.from("…")` sonrası
       gelen `if (x) sorgu = sorgu.gte("yanlis_sutun", …)` satırı hiç
       denetlenmiyordu. Koşullu süzgeç yazmanın en doğal biçimi bu.
    2. YANLIŞ ALARM — sarmalanmış sorgu. `gecmisSorgusu().order("login_at")`
       ifadesi metinde bir SONRAKİ .from()'un zincirine düşüyor ve sütun
       yanlış tabloda aranıyordu.

  Yanlış alarm en az kaçırma kadar zararlı: denetime güven kalmazsa
  çıktısına bakılmaz. Bu yüzden aşağıda ikisi de sabitleniyor.

  Örnek ağaç: tests/fixtures/sema (tsconfig ve eslint dışarıda bırakır).
*/
function denetim(): { cikis: number; cikti: string } {
  const argumanlar = ["scripts/check-schema-usage.mjs", "tests/fixtures/sema", "tests/fixtures/sema/katalog.json"];
  try {
    return { cikis: 0, cikti: execFileSync("node", argumanlar, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }) };
  } catch (sorun) {
    const hata = sorun as { status?: number; stdout?: string; stderr?: string };
    return { cikis: hata.status ?? 1, cikti: `${hata.stdout ?? ""}${hata.stderr ?? ""}` };
  }
}

const sonuc = denetim();

test("şema denetimi · örnek ağaçtaki hataları bildiriyor", () => {
  assert.equal(sonuc.cikis, 1, "sorun varken çıkış kodu 1 olmalı, yoksa CI yeşil geçer");
});

test("KOŞULLU SÜZGEÇ denetleniyor (eskiden hiç görünmüyordu)", () => {
  /*
    `let sorgu = …from("oturum_kayitlari")` sonra `sorgu = sorgu.eq(…)`.
    Sorgu bir değişkene bağlandığında o ad da tablonun sahibi sayılıyor.
  */
  assert.match(sonuc.cikti, /kosullu-suzgec\.ts:5\s+oturum_kayitlari\.kullanici_id yok/);
  assert.match(sonuc.cikti, /kosullu-suzgec\.ts:6\s+oturum_kayitlari\.giris_zamani yok/);
});

test("SARMALANMIŞ SORGU doğru tabloda aranıyor (eskiden yanlış alarmdı)", () => {
  /*
    `gecmis()` oturum_kayitlari döndürüyor; çağrısındaki .order("login_at")
    o tabloya ait ve geçerli. Denetim bunu komşu .from("personel")
    zincirine yazıp "personel.login_at yok" diyordu.
  */
  assert.doesNotMatch(sonuc.cikti, /personel\.login_at/);
  assert.doesNotMatch(sonuc.cikti, /sarmalanmis-sorgu\.ts/);
});

/*
  SÜTUN DOĞRU AMA DEĞER İMKÂNSIZ. Yanlış sütun adı üretimde hata veriyor
  ve bir yerde yakalanıyor; yanlış DEĞER hiç iz bırakmıyor — sorgu
  çalışıyor, sessizce sıfır satır dönüyor, ekran "sorun yok" diyor.
  Konsolun "Kurulum hataları" kartı 14.10.2026'ya kadar result = 'error'
  arıyordu; sütunun kısıtı o değere hiç izin vermiyor, yani kart hiçbir
  koşulda dolamazdı.
*/
test("İMKÂNSIZ DEĞERLE süzen sorgu bildiriliyor", () => {
  assert.match(sonuc.cikti, /imkansiz-deger\.ts:4\s+oturum_kayitlari\.sonuc değeri "hata" imkânsız/);
  // İzinli küme de yazılıyor: kurucu doğrusunu aramak zorunda kalmasın.
  assert.match(sonuc.cikti, /izinli: basarili, basarisiz/);
});

/*
  ZİNCİRİN ORTASINDAKİ YORUM. Zincir ilk noktalı virgülde kesiliyor ve bu
  deponun üslubu sorgu zincirinin ortasına uzun Türkçe gerekçe yazmak:
  gerekçede noktalı virgül geçtiği anda select'ten sonraki bütün süzgeçler
  denetimin görüş alanından çıkıyordu. Sessiz bir kör nokta — denetim
  yeşil kalıyordu.
*/
test("noktalı virgüllü YORUM zinciri kesmiyor", () => {
  assert.match(sonuc.cikti, /yorumlu-zincir\.ts:5\s+oturum_kayitlari\.yok_boyle_sutun yok/);
});

test("doğru yazılmış dosya hiç bildirilmiyor", () => {
  // Yanlış alarm, kaçırılan hata kadar zararlı: denetime güven kalmaz.
  assert.doesNotMatch(sonuc.cikti, /temiz\.ts/);
});

test("ÇOK TABLOLU fonksiyon bağlanmıyor", () => {
  /*
    İki tabloya birden dokunan bir fonksiyonda hangi sütunun hangi tabloya
    ait olduğu belirsiz. Tahmin yürütmek yanlış alarm üretirdi; bilinçli
    sınır olarak hiç bağlanmıyor.
  */
  assert.doesNotMatch(sonuc.cikti, /cok-tablolu\.ts/);
});

test("denetimin en başından beri yakaladıkları hâlâ yakalanıyor", () => {
  // Sahiplik modeline geçerken eski kapsamın daralmadığının kanıtı.
  assert.match(sonuc.cikti, /klasik\.ts:3\s+tablo yok: olmayan_tablo/);
  assert.match(sonuc.cikti, /klasik\.ts:4\s+personel\.unvan yok \(select\)/);
  assert.match(sonuc.cikti, /klasik\.ts:5\s+personel\.yanlis_sutun yok \(insert\)/);
  assert.match(sonuc.cikti, /klasik\.ts:6\s+fonksiyon yok: olmayan_fonksiyon\(\)/);
});

test("örnek ağaçta yalnızca beklenen on sorun var", () => {
  /* Sayı sabit: yeni bir yanlış alarm sınıfı eklenirse burada görünür.
     Altıydı; sabit sütun listesi örneği (sabit-liste.ts) iki gerçek
     sorun ekledi, 14.10.2026'da imkânsız değer ve yorumlu zincir
     örnekleri iki tane daha. */
  assert.match(sonuc.cikti, /✗ Şema sözleşmesi: 10 sorun/);
});

test("SABİT sütun listesi denetleniyor (eskiden kör noktaydı)", () => {
  /*
    `.select(SUTUNLAR)` biçimi iki depoda birden vardı: ArvoARC'ın
    Garanti sanal pos ayarları (on sütun, ÖDEME kodu) ve ArvoOS'ta yan
    sorgudan kaçmak için sütunları sayan liste sayfaları. Liste düz
    metinken denetlenen sütunlar, sabite taşınınca görünmez oluyordu.
  */
  assert.match(sonuc.cikti, /sabit-liste\.ts:\d+\s+personel\.yanlis_sutun yok \(select\)/);
  assert.match(sonuc.cikti, /sabit-liste\.ts:\d+\s+oturum_kayitlari\.olmayan_alan yok \(select\)/);
});

test("çözülemeyen sabit biçimi YANLIŞ ALARM üretmiyor", () => {
  /*
    Koşullu ifade (`a > b ? "x" : "y"`) bilerek çözülmüyor: yanlış
    çözmek, var olmayan bir sütunu "var" sanmaktan daha kötü — ve
    yanlış alarm denetime olan güveni bitirir.
  */
  assert.doesNotMatch(sonuc.cikti, /KOSULLU/);
  assert.doesNotMatch(sonuc.cikti, /personel\.id yok/);
});

/*
  KATALOG GECİKMESİ İLE YAZIM HATASI AYRILIYOR (14.10.2026).

  Denetim iki ayrı şeyi aynı sesle söylüyordu: yanlış yazılmış bir sütun
  adı ve henüz kataloğa girmemiş YENİ bir sütun. İkincisi normal iş
  akışı (migration canlıya uygulanıyor, anlık görüntü sonra yenileniyor)
  ama arada CI kırmızı kalıyor ve her commit aynı yirmi küsur satırı
  yazıyordu. O gürültünün bedeli gerçek bir hatanın gözden kaçması.

  Ayrımın güvenilir olması şart: gevşek bir eşleşme yazım hatasını
  "gecikme" diye örterse denetim kör kalır — denetlediği hatadan
  farksız olur.
*/
test("gecikme ile hata ayrımı: fixture'daki personel.unvan hâlâ HATA", () => {
  /*
    "unvan" ve "personel" kelimeleri migration'ların Türkçe
    gerekçelerinde geçiyor. Yorum metnini tanım saymak bu sütunu
    "katalog gecikmesi" diye örtüyordu; yorumlar artık ayıklanıyor.
  */
  assert.match(sonuc.cikti, /personel\.unvan yok \(select\)/);
  assert.doesNotMatch(sonuc.cikti, /Katalog .*personel\.unvan/);
});

test("gecikmede çıkış kodu 0, gerçek hatada 1", () => {
  /* Fixture ağacında gerçek hatalar var: çıkış kodu 1 kalmalı, yoksa
     CI yeşil geçer ve denetim hiçbir şey korumuyor olur. */
  assert.equal(sonuc.cikis, 1);
});
