# Doçentlik puan çekirdeği (F6 PR1)

ArvoLab'ın Doçentlik puan hesabının ArvoOS'a taşınan saf TypeScript çekirdeği.
Bu PR yalnızca çekirdeği, tiplerini ve testlerini ekler. Ekran, sunucu işlemi,
migration, RLS ve Storage bu PR'ın kapsamında değil: hiçbir mevcut modül
çekirdeği çağırmıyor.

## Kaynak

| | |
|---|---|
| Depo | ArvoLab, `main` |
| Commit | `b62bfcf698e680b73810cf747cc7355020f95b72` |
| `lib/docentlik-puan.ts` | blob `e24bc7ab818734c528779abe0469fde5a3207f58` |
| `lib/docentlik-ozeti.ts` | blob `4f758858617bf6ee59ca3cbf1b29b6bc37312a72` |
| `app/actions/scoring.ts` | blob `d51e7a22cceeec428ab99e2617d99bc812ae29a0` (yalnızca hesap ve doğrulama satırları) |

## Dosyalar

| Dosya | İçerik |
|---|---|
| `lib/docentlik/kural-surumu.ts` | Kural sürümleri (`KURAL_SURUMLERI`), varsayılan sürüm, `yuvarla` |
| `lib/docentlik/dogrulama.ts` | Form girdisi doğrulama: `ondalikOku`, `birimSayisiOku`, `katsayiOku`, `kriterPuaniOku`, `faaliyetAyrintisiOku`, `hedefPuanlariOku` |
| `lib/docentlik/puan.ts` | `korunanBirimPuan`, `paylasimKatsayisi`, `paylasimTanimli`, `puanHesapla` ve cephe fonksiyonları `faaliyetPuani` (ekleme), `duzenlemePuani` (düzenleme) |
| `lib/docentlik/ozet.ts` | `puanGruplari`, `kriterGruplari`, `puanYazisi`, `etkinHedefler`, `tavanUygula`, `hedefDurumlari`, `faaliyetDonemi`, `kriterUygun`, `TEMEL_ALAN_ONERILERI`, `GRUPSUZ` |
| `lib/docentlik/index.ts` | Hepsinin dışa açılımı |

Next, Supabase, oturum ya da veritabanı bağımlılığı yok. Tek ortam bağımlılığı
`puanYazisi` (`toLocaleString`, ICU verisi): yalnızca gösterim için.

## Hesabın kendisi

Kural (kategori, birim puan, yazar katsayısı, eşit bölüşüm, asgari ve azami
puan, temel alan ve alt alan) **veridir**, kriter ve hedef satırlarında durur.
Kodda duran, o verinin nasıl uygulandığıdır:

- **Faaliyet puanı** = birim sayısı × birim puan × paylaşım katsayısı, 1e-6'ya
  yuvarlanır.
- **Paylaşım katsayısı:**
  - Tek yazar ya da kuralı girilmemiş kriter: 1.
  - Eşit bölüşüm: 1/⌊n⌋. Başlıca/diğer katsayılarının önüne geçer.
  - Başlıca/diğer katsayısı: (0, 1] dışındaki bozuk değerler 1 sayılır.
- **Düzenleme:** kriter ve yazar bilgisi aynıysa kaydın kendi birim puanı ve
  katsayısı korunur; kriter tablosu sonradan değişse de eski kayıt yeniden
  fiyatlanmaz. Kriter değiştiyse birim puan, yazar bilgisi değiştiyse katsayı
  kriterden yeniden alınır.
- **Grup özeti:** kayıtlar kategori grubuna göre toplanır (grupsuzlar
  "Diğer"e); yüzde payı tam sayıya yuvarlanır.
- **Hedef seçimi:**
  - Başka kurumun, başka temel alanın ve başka alt alanın hedefi elenir.
  - Aynı grup ve dönem şartında en özel hedef kazanır: kurum 4, temel alan 2,
    alt alan 1.
- **Tavan:** grubun sayılan puanı azami puanı aşamaz. Tavan yalnızca doktora
  sonrası olmayan satırdan okunur.
- **Eksik puan:** max(0, hedef − mevcut). Doktora tarihi bilinmiyorsa doktora
  sonrası şartı ölçülmez.
- **Dönem:** gün anahtarı karşılaştırması; aynı gün "sonra" sayılmaz, tarihsiz
  faaliyet "bilinmiyor"dur.

## Kural sürümü

Hesaplanmış puan kayda yazıldığı için uygulama kuralı sessizce değişirse
eski ve yeni kayıtlar karışır. Uygulama kuralı değişecekse
`KURAL_SURUMLERI`'ne **yeni bir sürüm eklenir**; mevcut sürüm düzenlenmez.

- Tek sürüm var: `arvolab-2026-10-27`, yani ArvoLab b62bfcf'in davranışı.
- Cephe fonksiyonlarının çıktısı `kuralSurumu` taşır.
- Bilinmeyen sürüm kodu için `kuralSeti()` null döner; tahminle başka bir
  sürüme düşülmez.

## Eşdeğerlik

`tests/unit/docentlik-esdegerlik.test.ts` ArvoOS çekirdeğini kaynağın
kendisine karşı koşar:

- **Kaynağın kopyası:** `tests/unit/kaynak/arvolab/docentlik-puan.ts` ve
  `docentlik-ozeti.ts`, ArvoLab'dan bayt bayt alındı. Test, kopyaların git
  blob kimliğini yukarıdaki değerlerle karşılaştırır; ArvoLab'a ağ erişimi
  gerekmez.
- **Sunucu işleminin aktarımı:** `tests/unit/kaynak/arvolab/scoring-mantigi.ts`
  hesap ve doğrulama satırlarını satır aralıklarıyla aktarır. Okuma ve yazma
  çıkarıldı, gerisi satırı satırına aynı.
- **Karşılaştırma:** sayılar `Object.is`, nesneler `deepStrictEqual` ile
  karşılaştırılır; fırlatma da bir sonuçtur. Fonksiyon başına senaryo ve fark
  sayısı test çıktısına yazılır, tek fark testi düşürür.
- **Senaryolar:** sınır değeri ızgaraları (NaN, ±Infinity, −0, 0, negatifler,
  bozuk metinler dahil) ve tohumlu sözde rastgele üretim. Veriler yapay.
- **İlk koşu:** 20 karşılaştırmada 244 864 senaryo, 0 fark.
- **Mutasyon denetimi:** testin farkı gerçekten yakaladığı, çekirdekte tek
  tek bozulan kurallarla sınandı:
  - Yakalananlar: eşit bölüşümün yuvarlaması, eski satırda başlıca yazar
    varsayılanı, hedef özgüllüğünde eşitlik, tavanın doktora satırından
    okunması, dönemde aynı gün, katsayının alt sınırı, yazar sayısının üst
    sınırı, hata metni, yuvarlama çarpanı.
  - Yakalanmayan iki değişiklik sonucu zaten değiştirmiyor: `sayi > 1` →
    `sayi >= 1` (1 her iki dalda 1 döner) ve `replace` → `replaceAll` (iki
    virgüllü her metin iki noktayla NaN olur).

ArvoLab tarafındaki iki test dosyası, yalnızca içe aktarma yolu değiştirilerek
`tests/unit/docentlik-puan.test.ts` ve `docentlik-ozet.test.ts`'in başına
aynen alındı. Sonraki bölümler taşımada eklendi.

## Değiştirilmeden taşınan, karar bekleyen davranışlar

Bunlar kaynakta böyle. Taşımada **bilerek değiştirilmedi**: değiştirmek
kayıtlı puanlarla yeni hesaplar arasında fark açar. Her biri testte
"kaynak davranışı" diye sabitli.

1. **Ondalık okuma:**
   - Yalnızca ilk virgül noktaya çevrilir ve nokta ondalık sayılır:
     `"1.500"` → 1,5.
   - Bu, ArvoOS'un para kuralının (`parseTurkishAmount`) tersi.
   - Birim sayısında ve hedef puanında kullanıcıyı binde bire indirebilir.
2. **Kriter düzenlemede boş birim puan 0 kabul edilir** (`Number("") = 0`).
   Eklemede aynı alan zorunlu.
3. **Tarih yalnızca biçimle denetlenir:** `"2024-13-45"` geçer. Dönem
   karşılaştırması metinle yapılır.
4. **Eşit bölüşüm başlıca/diğer katsayısının önüne geçer**, yazar sayısı
   Math.floor ile indirilir. Form tam sayı istediği için olağan akışta etkisi
   yok.
5. **Başlıca katsayısı girilip diğer yazarınki boş bırakılırsa** diğer yazar
   tam puan alır.
6. **Hedef özgüllüğünde eşitlik:** aynı kurum, alan ve alt alanda aynı grup
   için iki satır varsa girdi sırasında önce gelen kazanır. Sonuç veritabanının
   satır sırasına bağlı.
7. **Tavan yalnızca doktora sonrası olmayan satırdan okunur.** Doktora sonrası
   satıra yazılmış azami puan yok sayılır.
8. **Yüzde payları ayrı ayrı yuvarlanır;** toplamları 100 etmeyebilir (üç eşit
   grup %33 + %33 + %33).
9. **Yazar sırası yalnızca "başlıca mı" olarak modelli.** Birinci, ikinci veya
   sorumlu yazar gibi sıra bilgisi yok.
10. **Asgari şartlar yalnızca** toplam, grup ve doktora sonrası toplamı
    içindir. Başka türde bir şart (ör. "en az bir tek yazarlı yayın") kodda
    yok.
11. **ÜAK kategori ve puan tabloları kodda değil.** Yönetici kriter ve hedef
    satırlarına elle giriyor. Doğruluğu veri girişine bağlı, çekirdek
    denetlemez.
12. **Veritabanı kısıtları** (asgari/azami ≤ 100000, katsayı aralığı, yazar
    1..500) ArvoLab şemasında. Formdaki doğrulama 100000 üst sınırını
    denetlemiyor; çekirdek de denetlemiyor.
