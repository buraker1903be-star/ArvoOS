<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
# ArvoOS

Çok kiracılı kurumsal panel + Arvo pazarlama sitesi. Next.js 16 · React 19 ·
Supabase. Genel tanıtım ve komutlar için `README.md`.

## Dil

Arayüz metinleri, hata mesajları ve kod yorumları **Türkçe**. Yorumlar "ne
yaptığını" değil **neden öyle olduğunu** anlatır; bir hata düzeltiliyorsa
eski davranış da yazılır ("Eskiden … oluyordu"). Yeni kod bu üsluba uyar.

## Değişmezler

Bunlar geçmişte gerçek hatalara yol açtı; birim testleri bunları sabitliyor
(`npm run test:unit`).

- **Yetki üç yerdedir, üçü de gerekir.** RLS + sunucu (`assertModuleAccess` /
  `assertModuleKeyAccess` / `assertYetki`) + menüde gizleme. Yeni bir server
  action yazarken yetki kontrolünü çağırmayı unutmayın: yalnızca sayfada
  kontrol etmek işlemi açıkta bırakır.
- **Yetki kararı rol listesiyle verilmez.** `["owner","admin"].includes(role)`
  yazmak kararı koda gömer ve kiracı onu değiştiremez; seksen kadar yerde
  böyleydi. Karar `lib/yetkiler.ts`teki yetenek anahtarlarında: sayfada
  `izin("crm.teklif.sil")`, sunucu işleminde `assertYetki(yetkiler, "…")`.
  Kurum bunları Ayarlar → Yetkilendirme'de rol ve kişi düzeyinde değiştirir.
  Birim testi (`yetkiler.test.ts`) eski kalıba dönüşü yakalar.
- **RLS de uyguluyorsa yetki gevşetilemez.** Katalogdaki `rlsBagli` işareti
  "yalnızca kısıtlanabilir" demek. Silme politikası owner/admin'e açık olan
  bir işlemi panelden manager'a açmak düğmeyi gösterir, RLS satırı sessizce
  eler, kullanıcı "sildim ama silinmedi" ile kalır — bu bir kez yaşandı.
  RLS'i de gevşetmek gerekiyorsa politikayı migration'la değiştirin.
- **Kurum Sahibi (`owner`) hiçbir zaman kısıtlanamaz.** Kendi panelinden
  kilitlenip dışarıda kalmasını önlemek için.
- **Para kuruş cinsinden tamsayıdır.** Form alanındaki tutar
  `kurusOku` ile okunur (`lib/turkish-amount.ts`; altında
  `parseTurkishAmount` var — "1.500" bin ayırıcılıdır, 1,5 değil).
  `Math.round(Number(formData.get("amount")) * 100)` yazmak Türkçe'de
  doğal olan yazımı BİNDE BİRE indiriyor ve bunu `input type="number"`
  de engellemiyor: 15.10.2026'da cari hesabın tahsilat kutusunda ölçüldü
  (Chrome, tr-TR) — kutuya 5.000 yazılınca value "5.000",
  valueAsNumber 5, checkValidity() true, kütüğe ₺5,00. On üç yerde
  böyleydi, sözleşme ve teklif tutarları dahil; `npm run check:rakamlar`
  artık bu kalıbı da arıyor (yüzde hesapları, yani bölmeden sonra gelen
  `* 100`, kuralın dışında). **Para kutusu `type="number"` DEĞİL**, metin
  + `inputMode="decimal"`: sayı kutusu iki ayırıcılı bir tutarı
  ("1.234.567") geçerli saymıyor, kutuyu boşaltıyor ve kullanıcı doğru
  yazdığı hâlde "bu alanı doldurun" uyarısı alıyor. Varsayılan değer
  `liraYazisi()` ile Türkçe yazılır ("30.000,00"), kutunun altındaki
  canlı önizleme de `parseTurkishAmount`'tan geçer — yoksa önizleme NaN
  alıp "girilmemiş" der. Denetim bu kutuları da arıyor. Bölüştürmede
  artan kuruş baştaki taksitlere eklenir; toplam her zaman birebir tutar.
- **Tarih Türkiye saatiyle.** Sunucu UTC'de çalışıyor; gün anahtarı için
  `todayInIstanbul`, karşılaştırma için `istanbulMidnight`.
  `new Date().toISOString().slice(0,10)` gece 00:00–03:00 arasında bir önceki
  günü verir.
- **RLS "kim yazabilir"i söyler, "neyi"yi söylemez.** Oturum jetonu
  tarayıcıda; bir tabloya UPDATE yetkisi olan kullanıcı her sütunu API'den
  doğrudan yazabilir. Durum ve kanıt sütunları tetikleyiciyle korunur:
  sözleşmenin `status = 'signed'` ve `signed_*` alanları yalnızca imza
  fonksiyonlarıyla yazılır, imzalı sözleşme geri alınamaz
  (`private.arvo_guard_contract_signature`). Bu koruma çağıranın rolüne
  (`current_user`) baktığı için security **invoker**'dır.
- **`service_role` istemcisi RLS'i atlar.** `createAdminClient` kullanan her
  yol yetkiyi kendisi doğrulamalıdır.
- **Sırlar `NEXT_PUBLIC_` ile başlamaz.** Eksik ortam değişkeni uygulamayı
  düşürmez, ilgili özelliği kapalı gösterir ve nedenini kullanıcıya yazar.
  Supabase anahtarları bu kuralı 15.10.2026'ya kadar çiğniyordu: ara katman
  onları `process.env.…!` ile okuyup `createServerClient`'a veriyor, eksik
  olduklarında istemci fırlatıyor ve ara katman eşleştiği HER yolda 500
  dönüyordu — pazarlama sayfaları, SEO dosyaları ve /login dahil. Tek bir
  eksik değişken bütün siteyi kapatıyordu; üretimde değişkenler dolu olduğu
  için yalnızca yeni bir makinede `npm run dev` çalıştırınca görünüyordu.
  Anahtarın varlığı artık tek yerde sorulur (`lib/supabase/yapilandirma.ts`):
  dört çağıran aynı cevabı almalı, yoksa biri "ayarlı" deyip istemci kurmaya
  kalkarken öteki atlar. Oturum çözülemediğinde doğru davranış "oturum
  yok"tur — korumalı yollar /login'e iner, geri kalan her şey açılır.
- **WhatsApp'a doğrudan çağrı yapılmaz.** Dört ürün de kapıdan geçer
  (`app/api/bridge/whatsapp` → `lib/whatsapp-gateway.ts`): tek yerde erişim
  anahtarı, tek yerde mesaj kaydı, tek yerde hata haritası. Gönderen kararı
  (kurumun kendi numarası mı Arvo'nunki mi) kapıdadır; ürün seçmez. Meta'nın
  kuralı gereği iş tarafının başlattığı mesaj onaylı şablonla gider, serbest
  metin yalnızca müşterinin son mesajından sonraki 24 saat içinde.
- **Silme engeli, kaskat yüzeyi kadar geniş olmalı.** Bir kaydı silmeden
  önce "bağlı kayıt var mı" diye bakan kontrol, veritabanının o silmeyle
  BİRLİKTE götürdüğü her şeyi kapsamalı. Sözleşmede engel yalnızca işe ve
  ödeme planına bakıyordu; oysa kaskat maliyet kalemlerini, ek sözleşmeyi
  ve müşteri yazışmasını da siliyordu (10.10.2026). Yeni bir yabancı
  anahtar eklerken silme engelini de gözden geçirin;
  `tests/db/sozlesme-silme-bagimliliklari.test.mjs` kaskatın hâlâ var
  olduğunu sabitliyor.
- **Engelin sorgusu hata yutmaz.** `if (bagli?.length)` kalıbında sorgu
  düştüğünde `data` undefined kalıyor ve koşul yanlış çıkıyor: engel AÇIK
  GEÇİYOR. Bir engelin okunamaması "engel yok" demek değil; hatayı okuyup
  fırlatın. Teklif ve sözleşme silmede iki kez böyleydi.
- **Müşteri yazışması olan sözleşme silinmez.** Kurum sahibinin kararı
  (10.10.2026): yazışma kurumun müşteriyle arasındaki kayıt, bir sözleşme
  kaydından daha kalıcı. Panelde mesaj silme olmadığı için engel bir
  çıkmaz değil, yönlendirme: yanlış açılan sözleşme silinmek yerine
  "İptal" durumuna alınıyor.
- **Giden postanın HTML'i varsa düz metni de olmalı.** Mesaj
  `multipart/alternative` ile iki biçimde birden gidiyor
  (`lib/posta-gonderim.ts`): HTML'i göstermeyen kutuda (kurumsal Outlook
  kuralları, otomatik işleyen sistemler) yalnızca HTML göndermek boş
  mesaj demek. HTML'e giren her metin `htmlKacis`'tan geçer — gövdeyi
  personel yazıyor ve kaçırılmayan bir "<" cümlenin kalanını yutuyor.
  İki biçimin sırası da aynı olmalı: yanıt → imza → alıntı.
- **Sunucunun indireceği adres kullanıcıdan geliyorsa genel olmalı.**
  İmza logosu kurum ayarlarından gelen bir adresten iniyor ve postaya
  gömülüyor; `logoAdresiUygunMu` yalnızca https ve genel alan adlarına
  izin veriyor (IP, localhost, iç alan adları ve yönlendirmeler kapalı).
  Yoksa kurumu yöneten biri sunucunun ağındaki bir şeyi kendi postasına
  çektirebilir.
- **Sayfa, kullandığı sınıfın CSS'ini kendi import etmeli.** Next rotanın
  CSS'ini o rotanın modül ağacından topluyor: sayfa (ya da içindeki bir
  bileşen/layout) dosyayı import etmiyorsa o rotada stil YOK — hata da
  yok. Posta konuşma ekranı `talep-*` düzen sınıflarını kullanıp
  `kayit-detay.css`'i import etmiyordu: listeden tıklayınca doğru
  görünüyor (önceki sayfanın CSS'i yüklü), sayfa YENİLENİNCE düzen
  dağılıyordu (10.10.2026). Bir bileşen her yerde kullanılıyorsa CSS'ini
  kendisi import etsin. `npm run check:css` bunu CI'da denetliyor.
- **Bulanık (`backdrop-filter`) bir kutunun içindeki `position:fixed`
  çocuk EKRANA göre konumlanmaz.** `backdrop-filter` (ve `transform`,
  `filter`, `perspective`, `contain`, `will-change`) kutuyu fixed
  çocukları için bir KAPSAYICI BLOK yapar. Pazarlama sitesinin mobil
  menüsü bu yüzden 13.09.2026'daki yeniden tasarımdan 13.10.2026'ya
  kadar hiç açılmadı: yaprak `position:fixed; inset:var(--header-h) 0 0`
  ile yazılmıştı, açık cam başlığın içinde çözülüyordu ve üstten 52,
  alttan 0 — yüksekliği SIFIR bir kutu. React tarafı kusursuz
  çalışıyordu (hidden kalkıyor, burger çarpıya dönüyor), hata da yoktu;
  ekranda hiçbir şey yoktu. Bulanık bir kabuğun içine kaplama
  yazarken konumu açıkça kabuğa göre kurun (`position:absolute;
  top:100%`), ya da kaplamayı kabuğun DIŞINA taşıyın.
- **CSS'i toplu düzenledikten sonra `npm run build` alın.** Denetimlerin
  hiçbiri CSS'in AYRIŞTIRILABİLDİĞİNİ söylemiyor: `check:css` sınıfların
  rotaya girip girmediğine ve token'lara bakıyor, PostCSS hoşgörülü
  olduğu için bozuk bir seçiciyi sessizce okuyup geçiyor, derleme de
  CI'da yapılmıyor. 14.10.2026'da ölü CSS temizleyen bir betik
  `:is(...)` listesini virgülden bölerken parantezi hesaba katmadı,
  `.panel-root :is(` öneki düştü ve üretim derlemesi dört saat düştü —
  o süre boyunca hiçbir değişiklik canlıya çıkmadı. Denetime seçici
  parantez dengesi eklendi (`check-css-tokens.mjs`), ama o yalnızca bu
  hatayı tutuyor: toplu düzenlemenin karşılığı derleme almaktır.
- **Zamanlanmış iş koştuğunu kaydeder; beklenen aralığı `vercel.json`
  söyler.** Her cron rotası `cronRotasi` ile sarılır
  (`lib/cron-kaydi.ts`): gövdesi `Response` değil `CronKosusu`
  döndürdüğü için sonucunu söylemeyen bir erken dönüş derlemede hata
  verir — altı çıkışı olan bir rotada bir kaydı atlamak işi "durmuş"
  göstermenin en kolay yoluydu. Beklenen aralık yoruma ya da ikinci bir
  listeye YAZILMAZ, `vercel.json`'dan türetilir (`lib/cron-isleri.ts`):
  posta eşitlemesinin rotasındaki yorum "on dakikada bir" diyordu,
  zamanlayıcı 13.10.2026'dan beri iki dakikada bir çağırıyor. Yeni bir
  cron eklerken `lib/cron-isleri.ts`'teki tanıma "durursa ne olur"
  cümlesini yazın; birim testi bunu ve zamanlamanın
  ayrıştırılabildiğini sabitliyor. Gecikme SON BAŞARILI koşmaya göre
  ölçülür — her tur düşen bir iş "son koşma"ya bakıldığında yeni koşmuş
  görünür.
- **Müşteriye giden sayfalarda `ad-` öneki yasak.** Teklif ve sözleşme
  belgelerinin sınıfları `doc-` ile başlar. `ad-root`, `ad-sheet` gibi adlar
  reklam engelleyicilerin kozmetik filtresine takılıyor ve belge, hiçbir hata
  vermeden bomboş görünüyordu — imzaya gönderilen sözleşme dahil.
- **Pazarlama sayfaları yalnızca `arvo-os.com`'da.** Host kararları
  `lib/site/host-rules.ts` içinde saf fonksiyonlardadır; proxy ve `robots.ts`
  oradan okur, kopya mantık yazılmaz.

## Liste sayfaları

Dört büyük liste (talepler, teklifler, sözleşmeler, işler) 11.10.2026'da
aynı yapıya geçti. Yeni bir liste yazarken ya da bunlara dokunurken:

- **Süzme, sayma ve sayfalama SUNUCUDA.** Kurumun bütün kayıtlarını
  çekip bellekte süzmek, kayıt sayısı büyüdükçe yavaşlamakla kalmıyor;
  PostgREST'in satır tavanına çarptığı gün sayılar sessizce eksiliyor
  (`npm run check:rakamlar` bu sınıfı arıyor). Sayfa boyu ve son sayfa
  hesabı `lib/liste-sayfalama.ts`'te.
- **Arama için düz bir GÖRÜNÜM.** Müşteri adı, e-posta ve telefon
  fırsat kaydında, temsilci adı personel tablosunda; PostgREST tek bir
  `or` içinde ana tabloyla gömülü tabloyu birleştiremiyor. Görünümler:
  `crm_talep_liste`, `crm_teklif_liste`, `crm_sozlesme_liste`,
  `operasyon_is_liste`. Hepsi `security_invoker` — RLS çağıranın
  yetkisiyle işliyor; invoker OLMAYAN bir görünüm tablo RLS'ini atlar.
- **Telefon araması rakam anahtarıyla.** Veritabanı
  `arvo_search_digits` ile on haneli yerel numaraya iniyor; arama
  terimi de aynı indirgemeden geçmeli (`lib/liste-arama.ts`), yoksa
  telefonla arama hiçbir şey bulmaz.
- **Kartın sayıları ÖZET İŞLEVİNDEN**, listeden değil: sayfalanmış
  listeden hesaplanan "ortalama" sessizce "bu sayfanın ortalaması"
  olur. Şerit sayıları ise `head` sorgularından ve listeyle AYNI
  süzgeç kümesinden gelir — iki ayrı yerde kurulan süzgeç, listede bir
  şey gösterip rozette başka sayı yazmanın en kolay yolu.
- **Yan sorgu, kullanacağı dizinin BAŞ sütununu da bağlamalı.** Liste
  görünümlerindeki `lateral` sayaçları (adımlar, okunmamış mesaj, son
  yorum, cari hareketleri) sayfalamadan ÖNCE, süzgece uyan her satır
  için bir kez işliyor; dizine oturmayan biri listeyi tek başına
  yavaşlatıyor. Talep görünümünün yorum yan sorgusu yalnızca
  `opportunity_id` ile süzüyordu, dizin ise
  `(organization_id, opportunity_id, created_at DESC)`: baş sütun
  bağlanmadığı için `max()` her talebin bütün yorumlarını okuyordu
  (20 000 satırda 188 ms → 4 ms, `20261011141558`). Yeni bir yan sorgu
  yazarken `canli-sema.sql`'deki dizine bakıp sütun sırasını eşleyin.
- **Türetilmiş kural NEREDE yaşayacak, üç seçenek var ve üçü de
  kullanıldı.** Yalnızca kendi satırına bakıyorsa üretilmiş sütun
  (`crm_proposals.teklif_grubu` — indekslenebilir). Başka tabloya
  bakıyorsa görünümün ifadesi (`sozlesme_grubu`: iş akışının durumuna
  da bakıyor) — bu durumda TypeScript'teki ikiziyle arasına ORTAK BİR
  ÖRNEK TABLOSU konur (`tests/fixtures/*-gruplari.json`), iki test
  birden aynı tabloyu sınar. Kural bir listeyse (aşama kümeleri) işleve
  PARAMETRE olarak geçilir; SQL'e kopyalanmaz.

## Genel bakış sayfaları

Dört genel bakış (CRM, operasyon, finans, ana ekran) 11–12.10.2026'da
listelerle aynı yapıya geçti:

- **Kartın sayıları ÖZET İŞLEVİNDEN, listesi altı satırdan.**
  `crm_genel_bakis_ozeti`, `operasyon_genel_bakis_ozeti`,
  `cari_tahsilat_ozeti`. Eskiden kurumun bütün kayıtları çekilip her
  sayı bellekte hesaplanıyordu; satır tavanına çarpıldığı gün kartlar
  ve grafikler sessizce eksiliyordu.
- **Grafik dilimleri veritabanında, Türkiye gününe göre.** Ekran
  yalnızca boş günleri dolduruyor (`gunlukSeriDilimler`). İki taraf
  aynı gün sınırını kullanmazsa günün ilk ve son kaydı yanlış dilime
  düşer. Beklenen günü testte ELLE hesaplamayın, tohumun yazdığı
  satıra sorun: UTC'de 21:00'den sonra iki takvim ayrışıyor.
- **Görünümden okurken sütunları sayın.** Liste görünümlerinin yan
  sorguları (adım, mesaj, son yorum, cari hareketi) `select("*")` ile
  boşuna işliyor; sütun istenmeyince Postgres yan sorguyu tamamen
  atıyor. Kart adım yüzdesi gösteriyorsa görünümü, göstermiyorsa
  tabloyu okuyun.
- **Her sınırsız okuma hata değil.** Prim (ömür boyu biriken bakiye),
  cari bakiyesi ve taksit merdiveni bilerek tüm zamanları okuyor;
  pencereyle daraltmak para hesabını bozar. Böyle bir okumanın
  gerekçesi dosyada yazılı olmalı, yoksa bir sonraki "iyileştirme"
  onu sessizce kırar.

## Sunucu işlemleri

Panel işlemleri `runPanelAction` ile sarılır (`lib/panel-action.ts`): üretimde
Next hata mesajlarını gizlediği için Türkçe açıklamalar çereze yazılıp bildirim
olarak gösterilir. Mesajlar URL'ye yazılmaz — dışarıdan sahte mesaj
enjekte edilemesin diye.

## Veritabanı

Migration'lar `supabase/migrations/` altında. Yeni dosyayı **`npm run db:new -- <ad>`**
ile açın; sürümü son migration'ın ardına kendisi yerleştirir (elle yazılan
damgalarda "…250000" gibi geçersiz saatler oluştu). `npm run check:migrations`
CI'da çalışır. Mevcut bir migration düzenlenmez; yenisi eklenir. Yeni tablo eklerken RLS'i açıp
politikalarını aynı migration'da yazın.

**ArvoARC 19 Eylül 2026'dan beri ayrı Supabase projesinde** (`obaskcdxaaezjglayash`;
ArvoOS `oahshpkgdzrraqdzjqau`'da kaldı). Bu projedeki `arc_*` tabloları geçişten
kalma salt okunur yedek: onlara migration yazmayın, kod eklemeyin. ArvoARC'ın kurum,
lisans, modül ve personel kopyasını `lib/arc-bridge.ts` yazar (Platform sayfası
köprünün durumunu gösterir). Ayrıntı: ArvoARC/AYRILMA.md.

Bu deponun migration'ları şemanın tamamını kurmaz (`crm_contracts`, `crm_proposals`, `hr_employees`,
`organization_memberships` gibi çekirdek tabloların `CREATE`'i hiçbir
migration'da yok). Canlı şemanın tam anlık görüntüsü
`supabase/schema/canli-sema.sql`: ArvoARC'taki `scripts/sema-disa-aktar.sql`
bu projenin SQL Editor'ünde çalıştırılır, sonuç **"Download CSV"** ile
indirilir (hücreyi elle kopyalamayın: tırnak kaçışları bozuluyor) ve iki
betikle dosyaya çevrilir — ikisi de hedef depoyu ikinci argümandan alır:

```
node ../ArvoARC/scripts/sema-kaydet.mjs ~/Downloads/<indirilen>.csv .
node ../ArvoARC/scripts/sema-katalog.mjs .
```

Bir fonksiyonun canlıdaki gövdesini ya da bir tablonun
gerçek sütunlarını oradan okuyun — buradaki eski migration'dan değil.
Migration uyguladıktan sonra anlık görüntüyü yenileyin; akış testleri onu
kurar.

**Görünümün satır tipini döndüren fonksiyon dökümde SONRA gelir.**
`returns setof crm_talep_liste` yazan bir fonksiyon (liste süzgeçleri
böyle) görünümden önce yazılırsa dökümden kurulan veritabanı hiç ayağa
kalkmaz: 13.10.2026'da 423 akış testi tek hatayla düştü (`type
"crm_talep_liste" does not exist`). Dışa aktarma betiği bunu artık
katalogdan ayırıyor (ArvoARC/scripts/sema-disa-aktar.sql); yeni bir
döküm almadan önce betiğin güncel olduğundan emin olun.

**plpgsql gövdesi sütunları çalışma anında denetler.** Var olmayan bir sütuna
başvuran fonksiyon oluşurken hata vermez, ilk çağrıda düşer. Yeni ya da
değiştirilmiş her fonksiyonu gerçek tablo yapısıyla en az bir kez çalıştırın;
`submit_site_lead` bu yüzden 5 gün boyunca her geçerli başvuruyu düşürdü.

**security definer fonksiyonun yetkisini açıkça yazın.** Postgres yeni
fonksiyonu varsayılan olarak herkese (`public`) açar. Her security definer
fonksiyonun ardından `revoke all … from public, anon` ve yalnızca gereken
rollere `grant` yazın; anon'a açılan fonksiyon kendi yetki kontrolünü
yapmalıdır.

## Testler

`tests/unit/` yalnızca saf mantık modülleri içindir (Next/React/Supabase'e
dokunmayanlar). Bir hata düzeltince onu sabitleyen testi de ekleyin.

**`olarak()` bir `islem()` içinde çağrılmaz.** `olarak` kendi işlemini
açıp sonunda geri alıyor; bir `islem`'in içinde çağrıldığında DIŞ işlemi de
geri alıyor ve o noktadan sonraki her ifade kuralsız duruma bakıyor. Kuralı
kurup iki kez okuyan bir test ikinci okumada yanlış şeyi ölçüyor ve yeşil
kalıyor (06.10.2026'da üç dosyada vardı). `islem` içinde rol değiştirmek
için `rol(db, "authenticated", kullanici)` kullanın.

**`rol()` işlem dışında çağrılırsa test sessizce sahip olarak koşar.**
`set local role` yalnızca bir işlemin içinde geçerli; `islem()` olmadan
çağrılan `rol(db, "authenticated", kullanici)` hiçbir şey yapmıyor ve
sorgu veritabanı sahibiyle (RLS atlanarak) çalışıyor. Test yeşil
kalıyor ama ölçtüğü şey yok: 10.10.2026'da teklif liste görünümünün
"başka kurum göremez" senaryosu böyle yazıldı ve yabancı kullanıcı iki
satırı da gördü. `reddedilir()` de aynı sebeple işlem ister
(savepoint). Erişim sınayan her senaryo `islem()` içinde yazılır.

**Döküm GÖRÜNÜM yetkilerini taşımıyor.** Dışa aktarma betiği yalnızca
fonksiyon yetkilerini üretiyor; düzenek de Supabase varsayılanını taklit
edip her tabloyu/görünümü anon'a açıyor. Bir görünümü anon'a kapatan tek
şey migration'ın kendi `revoke` satırıdır: döküm yenilendi diye o
migration'ı test dosyasının `MIGRATIONLAR` listesinden çıkarmak,
"anon görünüme erişemiyor" senaryosunu hiçbir şey ölçmeyen bir teste
çevirir (11.10.2026, `crm_talep_liste`). Fonksiyonlar için bu geçerli
değil — onların `revoke`/`grant` satırları dökümde var.

**Eski bir migration'ı yeniden uygulamak yeni korumayı düşürebilir.**
`tests/db/` dosyalarındaki `MIGRATIONLAR` listesi anlık görüntünün
ÜSTÜNE uygulanıyor: listede `create or replace function` içeren eski bir
migration varsa, aynı işlevin anlık görüntüdeki yeni gövdesini eski
hâline döndürür. Test o korumayı hiç sınamamış olur ama yeşil kalır —
09.10.2026'da `20261006190207` konuşma koruma işlevini eski sütun
listesiyle yeniden yaratıp çöp kutusu sütunlarının korumasını
düşürüyordu. Bir işlevi değiştiren migration'ı listeye SONDAN ekleyin ya
da eski olanı listeden çıkarın; kuralın gerçekten yürürlükte olduğunu
reddedilme bekleyen bir senaryoyla kanıtlayın. **`npm run
check:db-testleri` bunu CI'da denetliyor** (09.10.2026'da eklendi);
bilerek eski gövdeyle koşan bir satırın sonuna `govde-tamam: <sebep>`
yazılır.

**Bir işlevi yeniden yazarken gövdeyi anlık görüntüden alın**, eski bir
migration dosyasından değil. Çöp kutusu migration'ı konuşma korumasını
20261006190207'deki gövdeden türetti ve arada eklenmiş `okunmamis`
satırını düşürdü: koruma canlıda iki gün yoktu ve düzenek eski dosyayı
yeniden uyguladığı için test bunu söylemedi.

`tests/db/` (`npm run test:db`) canlı şemayı PGlite'a kurar ve akışları gerçek
fonksiyon/tetikleyicilerle, Supabase rolleriyle (anon, authenticated) koşar.
Bir tabloya koruma (tetikleyici, RLS) eklerken o tabloya yazan **meşru** yolların
senaryosu burada yeşil kalmalı; 19.09.2026'da teklif dondurma kuralı yalnızca
saldırı senaryolarıyla sınandı ve müşterinin onayını canlıda kırdı. Yeni
kuralı önce anlık görüntüye uygulayıp testleri çalıştırın.

## Kontroller

`npx tsc --noEmit`, `npm run lint`, `npm run test:unit`, `npm run test:db`,
`npm run check:rakamlar` — hepsi CI'da
(`.github/workflows/ci.yml`) çalışır. Derleme CI'da yapılmaz.

**Rakam denetimi** (`npm run check:rakamlar`): ekrandaki sayıların üç
bilinen yanlış kaynağını arar. Birincisi `.limit()` ile sınırlı bir
sorgudan `.reduce()` ile toplam almak — 22.09.2026'da konsolun üç
sayfasında ayrı ayrı çıktı ("Tahsil edildi" son 50 kaydın toplamıydı) ve
sınıra ulaşılana kadar hiçbir belirti vermiyor. İkincisi adı doğru gelen
ama başka bir şey tutan tablodan okumak: `billing_invoices` kiracının
KENDİ müşterilerine kestiği faturalar, `billing_subscriptions` ne abonelik
kütüğü ne ayrı bir tahsilat kanalı — her kurum ödemesinin aktivasyon ikizi
(onaylı ödeme isteğiyle toplanınca her ödeme iki kez sayılıyordu), `ai_credits_used` hiç yazılmıyor — körelmiş bir sütun, oradan okunan her sayı sıfır çıkar. Bu, AI kredisinin ölçülmediği ya da uygulanmadığı anlamına GELMEZ: tüketim ArvoLab'dan canlı okunuyor (`lib/urun-kullanimi`) ve limiti ArvoLab kendi kredi kapısında uyguluyor. Buradaki not 14.10.2026'ya kadar yanlış okunup "limit uygulanmıyor" sanıldı. Bilerek
kullanıyorsanız satırın üstündeki yorum bloğuna `tuzak-tamam: <sebep>`
yazın — sebebi yazmak, denetimi susturmanın bedeli. Yeni bir tuzak
öğrenildiğinde betikteki listeye eklenir.

**Döküm tablo ve SÜTUN yetkilerini taşımıyor.** `user_presence`'ta
SELECT sütun düzeyinde kısıtlı (sayfa ve cihaz bilgisi herkese kapalı):
sonradan eklenen her sütun varsayılan olarak okunamaz geliyor ve hata
"permission denied for table …" diye çıkıyor — upsert'in ON CONFLICT
dalı excluded değerini okuduğu için UPDATE yetkisi olsa bile. Böyle bir
tabloya sütun eklerken `grant select (<sütun>) on … to authenticated`
yazın. Akış testleri bunu YAKALAMAZ: düzenek Supabase varsayılanını
taklit edip her tabloya tam yetki veriyor, sütun düzeyinde yetki
yalnızca canlıda var (10.10.2026'da görünürlük anahtarı bu yüzden
canlıda düştü).

**Okunamayan sorgu denetimi** (`npm run check:okunamayan`): Supabase
istemcisi hata **fırlatmıyor**, `error` alanına yazıyor. `const { data } =
await supabase…` yazan bir sayfa, sorgu düştüğünde `data` null alıyor ve
onu "kayıt yok" diye çiziyor — yani yanlış değil, EMİN EMİN yanlış.
15.10.2026'da beş özet ekranında on iki okuma böyleydi: Sistem Sağlığı
"Açık sorun 0 · Her şey yolunda" dedi (kiracı listesi okunamadığı için
kota, limit sapması ve bayat kopya bölümlerinin üçü birden boşalmıştı),
konsolun ana ekranı "Müşteri kurum 0/0 · Beklenen aylık ₺0,00" dedi,
Tahsilat rakamı ŞİŞTİ (`musteriMi(undefined)` "müşteri" döndüğü için
Arvo'nun kendi ödemeleri gelire karıştı), finans genel bakışta kâr oranı
yükseldi, İK genel bakışında herkes "gizlilik sözleşmesi imzalamamış"
göründü. Denetim DAR tutuldu: depoda bu kalıptan seksen küsur yer var ve
çoğu zararsız (ad eşlemesi düşerse ekranda "—" yazar), her yeri
işaretleyen bir denetim herkesin susturmayı öğrendiği bir denetim olur.
Bu yüzden yalnızca betiğin başındaki listede yazan **özet ekranları**
taranıyor — orada ekrandaki her şey bir sonuç. Liste de 15.10'da
konsolun on sekiz ekranından kiracı panelinin liste sayfalarını da
kapsayacak biçimde otuza çıkarıldı (talepler, teklifler, sözleşmeler,
işler, pano, arşiv, finans, İK, cari, posta): onların şerit sayıları da
birer sonuç. Yeni bir özet ekranı
açarken listeye ekleyin. Hata bilerek yutuluyorsa satırın üstüne gerekçe
yazılır: `// hata-tamam: <sebep>`. Denetim yakalanan hatanın
KULLANILDIĞINI da arıyor; alınıp bir kenara konan `error` gösteriştir.

**Saat dilimi denetimi** (`npm run check:saat-dilimi`): sunucu UTC'de
çalışıyor, kullanıcı Türkiye'de. `new Date(damga).toLocaleString("tr-TR")`
dilim verilmeden çağrıldığında sunucunun yerel saatini yazıyor, yani
**üç saat geriyi**. 15.10.2026'da iş detayında ölçüldü: aynı aşama
tamamlama olayı "Son hareketler" listesinde 18:09, hemen altındaki
"Alan değişiklikleri" listesinde 15:09 görünüyordu — aynı ekran, aynı
olay, iki saat. Aynı kalıp kurum içi notlarda, teklif revizyonlarında,
destek yazışmalarında, ödeme bildirimlerinde ve gizlilik sözleşmesinin
imza saatinde de vardı. Yalnızca saat değil GÜN de kayıyor: Türkiye'de
gece 00:00–03:00 arasında olan her şey bir önceki güne düşüyor, yani
"müşteri teklifi en son ne zaman açtı" yanlış günü gösteriyordu.
Gösterim için `lib/istanbul-date.ts` içindeki `istanbulDateTime()`
kullanılır; seçenek verilmezse yerel ayarın kendi biçimi korunur, o
yardımcı yalnızca dilimi düzeltir. Denetim `new Date(...).toLocale*`
VE `new Intl.DateTimeFormat(...)` çağrılarına bakar — ikisi aynı şeyi
yapıyor ve denetim önce yalnızca ilkini arıyordu, ikincisi cari hesap
ekranında gözden kaçtı ("Kayıt zamanı" ve sözleşmenin imza günü para
kütüğünde bir önceki güne düşebiliyordu). Formatlayıcı çağrıdan ayrı bir
satırda kurulabildiği için KURULUŞ yeri işaretlenir. Saati sabitlenmiş
kurgular (`T00:00:00`, `T12:00:00`) bir AN değil bir GÜN taşıdığı için
muaftır. Müşteri takip ekranı da Türkiye saatine sabittir: oradaki
biçimlendiriciler ziyaretçinin TARAYICISINDA çalışıyor ve dilimsizken
yurt dışındaki müşteri aynı mesajı personelden farklı bir saatle
görüyordu. Hazır bir Date değişkeni
üzerinden yapılan çağrılar taranmaz — değişkenin ne taşıdığı metinden
okunamıyor. **Gün anahtarı da aynı denetimde:** argümansız
`new Date().toISOString().slice(0,10)` saati UTC'ye çevirip gün aldığı
için gece 00:00–03:00 arasında DÜNÜ veriyor. 16.10.2026 gecesi canlıda
ölçüldü — iş maliyeti formunun tarih kutusu 15 Ekim ile açılıyordu;
varsayılanı kabul eden kullanıcı kalemi yanlış güne, ayın 1'inde önceki
AYA kaydediyordu ve kârlılık raporu o aya göre hesaplanıyor. Doğrusu
`todayInIstanbul()`. Bir gün anahtarından türetilen hesaplar
(`new Date(\`${gun}T00:00:00Z\`)`) zaten UTC'ye sabitli, taranmıyor.
Bilerek dilimsizse: `// dilim-tamam: <sebep>`.

**Canlı duman testi** (`npm run duman`, CI'DA DEĞİL): hangi sayfanın
AÇILDIĞINI sınar. tsc, lint, testler ve derleme sayfanın derlendiğini
söylüyor, çalıştığını değil: 16.10.2026'da başlangıç paketindeki bir
kurumda `/panel/finance/raporlar` "Bir sorun oluştu · Hata kodu:
3223241041" veriyordu ve hiçbir denetim bunu göremiyordu. Sayfanın
HTML'ini çekip hata metni aramak da yetmiyor — o ekran React'in hata
sınırında, yani İSTEMCİDE çiziliyor; ilk taramam bu yüzden "41 rota
temiz" deyip yanılmıştı. Çalışan yöntem sayfayı `RSC: 1` başlığıyla
istemek: dönen akışta hatalar `digest` ile işaretli ve üçü ayırt
edilebiliyor — `NEXT_HTTP_ERROR_FALLBACK;404` ile `NEXT_REDIRECT;…`
KASITLI, sayısal bir digest ise gerçek çökme (o sayı sunucu
günlüğündeki kaydın anahtarı). Rota listesi `app/` ağacından
türetiliyor. Dinamik rotaların örnek kimliği ELLE YAZILMIYOR: gezilen
sayfaların gövdesinde geçen `/panel/<üst>/<uuid>` çiftleri bir havuza
giriyor, durgun rotalar önce taranıp havuzu dolduruyor, sonra dinamikler
oradan örnekleniyor. İki tur koşuyor, çünkü bazı bağlantılar başka bir
dinamik sayfanın içinde (gizlilik sözleşmesine yalnızca personel
detayından gidiliyor). Örneği bulunamayan rota temiz SAYILMAZ, adıyla
"atlandı" diye yazılır — 16.10.2026'da 17 dinamik rotanın 13'ü
çözüldü, kalan dördü sorgu değişkeniyle açılıyor. **Sekmeler de
taranıyor:** panelin yarısı sekmeyi sorgu değişkeniyle açıyor (Ayarlar'ın
yedi bölümü, liste durum süzgeçleri, finansın maliyet görünümü) ve
betik bir süre yalnızca VARSAYILAN hâli görüyordu — adresler arayüzün
kendi bağlantılarından toplanıyor, yol başına bir tavanla (takvim tek
başına 74 adres üretiyor ve hepsi aynı kodu çalıştırıyor). **Bir de
bayat adres sınaması var:** toplanan her adres geçerli olduğu için
elle yazılan/yer imine kaydedilen adresi kimse sınamıyordu; her liste
`?sayfa=99999` ile de isteniyor. Bu sınama 16.10.2026'da sekiz listede
çökme buldu (aralık dışı sayfa, `lib/liste-sayfalama` → `aralikDisiMi`). Oturum çerezi ve gerçek veri gerektirdiği için CI'da
koşmuyor: dağıtımdan sonra elle çalıştırılır, çerez hangi ÇALIŞMA
ALANININ taranacağını da belirler (kurumun paketine göre sonuç değişir;
kapalı modül artık çökme değil yönlendirme üretir). Çerez eskiyip
sayfalar girişe düşerse betik "temiz" demez, uyarıp 2 ile çıkar.

**Şema sözleşmesi** (`npm run check:schema`): koddaki tablo, sütun ve RPC
adları canlı şemanın kataloğuyla (`supabase/schema/katalog.json`)
karşılaştırılır. **Sütun doğru ama DEĞER imkânsız** olabiliyor: kısıtı
`check (x = any (array[…]))` ile sabitlenmiş bir sütunu listede olmayan
bir değerle süzmek hata vermez, sessizce sıfır satır döndürür. Konsolun
"Kurulum hataları" kartı `result = 'error'` arıyordu; kısıt yalnızca
`started/success/failed`'e izin veriyor, yani kart hiçbir koşulda
dolamazdı (14.10.2026). Denetim izinli değerleri dökümden okuyup
`.eq/.neq/.in` süzgeçlerini karşılaştırıyor. **Zincirdeki yorumlar
boşaltılıyor:** zincir ilk noktalı virgülde kesiliyor ve bu deponun
üslubu sorgu zincirinin ortasına uzun gerekçe yazmak — gerekçedeki bir
noktalı virgül, select'ten sonraki bütün süzgeçleri denetimin görüş
alanından çıkarıyordu. Denetim KATALOG GECİKMESİNİ hatadan ayırır
(14.10.2026): adı yerel bir migration yaratıyorsa uyarı yazılır ve çıkış
kodu 0 kalır (kod kataloğun ilerisinde, olağan akış); hiçbir migration
yaratmıyorsa hata verir. Eşleşme tabloya bağlıdır ve migration
YORUMLARI ayıklanır — gevşek bir eşleşme yazım hatasını "gecikme" diye
örterse denetim denetlediği hatadan farksız olur. Supabase istemcisi tipsiz olduğu için yanlış sütun adı
derlemede görünmez; üretimde sorgu hata verir ve çoğu yerde hata yakalanıp
boş veri gösterilir (Platform → Ödemeler bu yüzden iki gün "sorun yok"
gösterdi). Yeni sütun/fonksiyon kullanan kodu, migration canlıya uygulanıp
katalog yenilendikten sonra birleştirin.
