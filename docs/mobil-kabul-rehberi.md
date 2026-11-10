# Mobil ve kısa ekran kabulü — çalıştırma rehberi

`scripts/mobil-kabul.mjs` ana ekranı, CRM genel bakışı ve Operasyon genel bakışı gerçek uygulamada ölçer.

- **Boyutlar:** 390×844, 768×600, 1440×900, 1440×600.
- **Temalar:** açık ve koyu.
- **Yakınlaştırma:** ayrıca %200, gerçek tarayıcı yakınlaştırmasıyla.

CI'da koşmaz. Preview'a erişebilen kendi bilgisayarınızda çalıştırılır.

## Ne yapar, ne yapmaz

- **Oturum:** görünür bir Chromium açılır. Vercel ve ArvoOS girişini **siz** yaparsınız. Betik panel açılana kadar bekler, sonra testi aynı tarayıcıda sürdürür.
  - Parola, belirteç ya da çerez terminale, rapora veya git'e yazılmaz.
  - Çerez kopyalama seçeneği bilerek kaldırıldı.
- **Salt okunur:** giriş tamamlandıktan sonra GET/HEAD dışındaki her istek (server action'lar dahil) kesilir.
  - Kayıt, görev, ayar, mesaj, davet ya da ödeme işlemi yapılamaz.
  - Betik yalnızca görünüm seçici, dock / Daha fazla / Uygulamalar, bölüm menüsü, "Adımları göster" ve "Tamamını göster" düğmelerine basar.
- **Kesilen istek ürün hatası sayılmaz:**
  - Bir adım sırasında yazma isteği kesildiyse ve adım başarısız olduysa, o adım **UNVERIFIED** yazılır. Raporda kesilen isteğin türü de yer alır: oturum yenileme, server action ya da diğer.
  - Kesilmesine rağmen geçen adım PASS kalır.
  - Oturum koşu sırasında düşerse kalan senaryolar UNVERIFIED olur.
- **Veri oluşturmaz.**
  - Ekranda kısaltılmış bir müşteri/talep adı yoksa "Tamamını göster" senaryosu UNVERIFIED kalır.
  - Kurulum penceresi o boyutta taşmıyorsa "yalnızca gövde kayar" kontrolü de UNVERIFIED kalır.
  - İzolasyonu doğrulanmamış bir ortamda fikstür oluşturmayın.
- **Yakınlaştırma:** küçük bir tarayıcı eklentisi `chrome.tabs.setZoom(2)` çağırır. Bu, Ctrl+Artı ile aynı yoldur: 1440×900 pencerede sayfa 720×450 CSS piksel görür. CSS transform ya da deviceScaleFactor değildir.
- **Sınanmayanlar:** gerçek cihazda dokunmatik kullanım ve sanal klavye. Bu yüzden betik hiçbir koşulda "tam kabul" yazmaz.

## Gereksinimler

| | Sürüm |
|---|---|
| Node | 24.x (depo `engines`). Betik Node 22.22 ile de denendi. |
| Playwright | 1.63.0 (denenen sürüm), Playwright'ın kendi Chromium'u |
| İşletim sistemi | macOS, Windows ya da masaüstü Linux (görünür tarayıcı gerekir) |

Google Chrome değil, Playwright'ın Chromium'u kullanılır: Chrome'un yeni sürümleri komut satırından eklenti yüklemeyi kapattı, yakınlaştırma eklentisi orada çalışmaz.

## Kurulum

```sh
cd ArvoOS
git fetch origin claude/ana-ekran-navigasyon && git checkout claude/ana-ekran-navigasyon
npm ci
npm install --no-save playwright@1.63.0   # package.json ve package-lock değişmez
npx playwright install chromium
```

`--no-save` ile kurulan Playwright, bir sonraki `npm ci`'da kaldırılır; gerekirse yeniden kurun.

## Çalıştırma

**Tam koşu:** görünür giriş, ardından dört boyut × iki tema ve %200 yakınlaştırma.

```sh
ARVO_URL=https://arvo-os-git-claude-ana-ekran-navigasyon-arvo-os.vercel.app \
node scripts/mobil-kabul.mjs
```

1. Bir Chromium penceresi açılır. Vercel girişini ve ardından ArvoOS girişini **test hesabıyla** yapın.
2. Panel açılınca terminalde "Oturum açık. Bundan sonra yazma istekleri kesiliyor" yazar.
   - Bundan sonra tarayıcıya dokunmayın; pencere kendiliğinden boyut değiştirir.
   - Giriş için varsayılan süre 10 dakikadır; `GIRIS_DAKIKA=20` ile uzatılır.
3. Koşu bitince terminalde senaryo tablosu, hüküm ve çıktı dizini yazar.

Windows PowerShell'de değişkeni ayrı satırda verin: `$env:ARVO_URL="https://…"` ve ardından `node scripts/mobil-kabul.mjs`.

**Seçenekler:**

| Değişken / bayrak | Ne yapar |
|---|---|
| `BOYUTLAR=390x844,768x600` | Yalnızca bu boyutlar (varsayılan dördü) |
| `TEMALAR=dark` | Yalnızca bu tema (varsayılan `light,dark`) |
| `SAYFALAR=ops` | Yalnızca bu sayfalar: `ana`, `crm`, `ops` (varsayılan üçü). Operasyonda masaüstü kart hizası da denetlenir. |
| `--zoom-yok` | %200 yakınlaştırma senaryosunu atla |
| `KABUL_CIKTI=~/arvo-kabul-ciktisi` | Çıktı dizini (depo içi reddedilir) |
| `KABUL_PROFIL=~/…` | Tarayıcı profili dizini (depo içi reddedilir) |
| `--oturumu-sakla` | Koşu sonunda profili SİLME: sonraki koşu girişsiz başlar |
| `--gorunmez` | Saklanmış oturumla görünmez koşu. Oturum geçersizse betik durur, giriş istemez. |

**Yalnızca %200 yakınlaştırma doğrulaması:** boyut listesinde var olmayan bir boyut verilemediği için en kısa yol, tek boyutla koşmaktır. Yakınlaştırma senaryosu her zaman 1440×900 pencerede, iki temada koşar.

```sh
ARVO_URL=… BOYUTLAR=1440x900 node scripts/mobil-kabul.mjs
```

## Sonuçlar

- Çıktı dizini terminalin son satırlarında yazar. `KABUL_CIKTI` verilmezse işletim sisteminin geçici dizininde `arvo-mobil-kabul-XXXX` adıyla açılır.
- `sonuc.json` şunları içerir:
  - hüküm ve özet sayılar;
  - kesilen isteklerin listesi (yalnızca yöntem + adres yolu, sorgu dizesi yazılmaz);
  - her senaryonun adımları;
  - her adımda viewport, `scrollWidth/clientWidth`, `scrollHeight/clientHeight`, gerçek kaydırma girişiminden sonraki sayfa konumu, kart ve menü yatay taşmaları, dock'un örttüğü eylemler, son kayıt ve alt bağlantı erişimi, pencere açılış/Esc/odak dönüşü.
- Ekran görüntüleri her adım için `NNN-<boyut>_<tema>_<sayfa>_<adım>.png` adıyla alınır.
- **Çıkış kodu:**
  - `0`: bütün senaryolar PASS;
  - `1`: FAIL var (ürün hatası);
  - `2`: oturum ya da erişim yok;
  - `3`: FAIL yok ama UNVERIFIED var.
- **Hüküm satırı:** `0` dönse bile "TAM KABUL DEĞİL" yazar, çünkü dokunmatik ve sanal klavye sınanmadı. UNVERIFIED satırları kabul raporuna olduğu gibi taşınmalıdır.

Ekran görüntüleri gerçek kurum verisi gösterir. Paylaşmadan önce içeriğe bakın ve depoya eklemeyin; betik depo içine yazmayı zaten reddeder.

## Temizlik

Varsayılan koşuda profil, betik bitince silinir. `--oturumu-sakla` kullandıysanız ya da koşu yarıda kesildiyse elle silin:

```sh
# macOS / Linux
rm -rf ~/.arvo-mobil-kabul            # tarayıcı profili (oturum çerezleri)
rm -rf "${TMPDIR:-/tmp}"/arvo-mobil-kabul-*  "${TMPDIR:-/tmp}"/arvo-zoom-*   # çıktı ve eklenti
```

```powershell
# Windows PowerShell
Remove-Item -Recurse -Force "$HOME\.arvo-mobil-kabul"
Get-ChildItem $env:TEMP -Filter "arvo-*" | Remove-Item -Recurse -Force
```

`KABUL_CIKTI` ya da `KABUL_PROFIL` ile başka bir dizin verdiyseniz o dizini silin. Test oturumunu Preview'da ayrıca kapatmak isterseniz panelden çıkış yapın; bu, profil silindikten sonra gerekmez.
