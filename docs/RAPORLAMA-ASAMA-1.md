# Raporlama alt sistemi — Aşama 1 bulguları

24.10.2026. Kurum sahibinin sekiz raporluk şartnamesi için **önce mevcut
şema incelendi**; bu belge neyin gerçek veriyle hesaplanabildiğini, neyin
hesaplanamadığını ve hangi tuzakların kurulu olduğunu kayda geçiriyor.

Şartnamenin kendi kuralı: "Gerçek veritabanı alanlarını incelemeden
varsayımsal tablo veya sütun isimleri üzerinden geliştirme yapma."

---

## 1. Sekiz raporun veri karşılığı

| Rapor | Ana kaynak | Durum |
|---|---|---|
| Satış Analitiği | `crm_contracts` (amount, signed_at, status) | **Hesaplanabilir** |
| CRM ve Müşteri | `crm_opportunities` (source, stage, lost_reason) + `account_parties` | **Hesaplanabilir** |
| Tahsilat ve Alacak | `account_entries` + `payment_plans` / `payment_installments` | **Hesaplanabilir** |
| Finansal Performans | `finance_transactions` (transaction_type) + `contract_cost_items` | **Hesaplanabilir** |
| Personel Performansı | `hr_employees` + atama alanları + `hr_*_commissions` | **Kısmen** (hedef yok) |
| Operasyon ve İş Akışı | `operation_workflows` + `operation_steps` | **Hesaplanabilir** |
| Teklif ve Sözleşme | `crm_proposals` + `crm_contracts` | **Hesaplanabilir** (revizyon tuzağı var) |
| Yönetici Kokpiti | Yukarıdakilerin özeti | **Hesaplanabilir** |

Drill-down için gereken ilişkilerin **hepsi şemada var**:
`crm_contracts` → `opportunity_id`, `proposal_id`, `workflow_id`,
`party_id`, `payment_plan_id`. Yani "satıştan teklife, sözleşmeye,
tahsilata, operasyona" geçişler isim/tutar benzerliğiyle değil gerçek
yabancı anahtarlarla kurulabiliyor.

---

## 2. EKSİK VERİ — bunlar uydurulamaz

### 2.1 Hedefler yok — **YAPILDI (29.10.2026)**
Bu maddenin yazıldığı gün `hedef`, `target`, `kota`, `budget` adında
hiçbir tablo yoktu ve rapor "hedef verisi yok" diyordu; hedefi girecek
bir yer de yoktu, yani program eksiği söyleyip kapatmanın yolunu
vermiyordu.

Kurulan: `hr_personel_hedefleri` (kurum, personel, ay, tutar — kuruş;
migration 20261029181748), giriş ekranı **İK → Hedefler**
(`/panel/hr/hedefler`, yetki `hr.hedef.yonet`) ve raporun hedef
bölümü.

Uydurma hedef yine yok, üç kural kodda sabit:
- Hedefi konmamış kişinin hücresi **boş**, sıfır değil — sıfır yazmak
  o kişiyi %0 gerçekleşmeyle gösterirdi.
- Dönem **tam aylara oturmuyorsa** hedef hiç hesaplanmaz: aylık hedefi
  güne bölmek kimsenin koymadığı bir günlük hedef üretir
  (`lib/personel-hedefi.ts`).
- Gerçekleşme paydası yalnızca **hedefi olanların** hedefi, payı da
  yalnızca onların satışı.

**Gerekirse:** `hr_employee_targets` (organization_id, employee_id,
donem, tutar) gibi küçük bir tablo + panelde giriş ekranı. Ayrı iş.

### 2.2 Hizmet türü JSON içinde, boyut tablosu değil
Ürün/hizmet bazlı satış ve kârlılık isteniyor. Hizmet türü
`crm_opportunities.request_details ->> 'service_type'` içinde **serbest
metin**. `organization_service_types` yalnızca kurumun tür LİSTESİNİ
(`turler` dizisi) tutuyor; satır başına yabancı anahtar yok.

Sonuç: gruplama yapılabilir ama **yazım farkı ayrı grup üretir**
("Tez Yazımı" / "tez yazımı"). Raporda normalleştirme (küçült + boşluk
sadeleştir) uygulanmalı ve bu belgede yazılı olmalı.

---

## 3. TUZAKLAR — çift sayımın bilinen kaynakları

### 3.1 Teklif revizyonları
`crm_proposals` revizyon zinciri tutuyor: `root_proposal_id`,
`revision_no`, `superseded_by`, `superseded_at`. Ham satır saymak **aynı
ticari süreci birden çok teklif** gibi gösterir. Teklif sayısı
`distinct root_proposal_id` üzerinden hesaplanmalı; dönüşüm oranının
paydası da bu.

### 3.2 Tahsilat ≠ gelir ≠ satış
Üç ayrı kavram, üç ayrı tablo:
- **Satış**: `crm_contracts.amount` (imzalandığı an, nakit değil)
- **Tahsilat**: `account_entries` (kasaya giren)
- **Gelir**: `finance_transactions` (`transaction_type`)

Üçünü toplamak ya da birini diğerinin yerine koymak yanlış. Her KPI'ın
tanımı ekranda da görünmeli.

### 3.3 `billing_*` tabloları kurumun geliri DEĞİL
AGENTS.md'de yazılı: `billing_invoices` ve `billing_subscriptions`
Arvo'nun kendi tahsilatıyla ilgili; `billing_subscriptions` her kurum
ödemesinin aktivasyon ikizi ve onaylı ödeme isteğiyle toplanınca **her
ödeme iki kez sayılıyor**. Kiracı raporlarında kullanılmamalı.

### 3.4 `ai_credits_used` körelmiş
Hiç yazılmıyor; oradan okunan her sayı sıfır çıkar.

---

## 4. YETKİ — şartnamenin en çok etkilendiği yer

Bugün (24.10.2026) uygulanan kural: **operasyon departmanındaki hiç kimse
sözleşme tutarını, teklif tutarını, müşteri bakiyesini ya da müşterinin
telefonunu göremez** (migration 20261023183540 + 20261023184948).

Raporlama alt sistemi bunu DELMEMELİ. İki sonuç:

1. "Personel Performansı" raporu operasyon personelini satış rakamıyla
   değerlendiremez — şartname de bunu söylüyor.
2. Rapor sayfası bugün `/panel/finance/raporlar` altında ve kapısı
   `finance.gor` yeteneği (varsayılanı **yalnızca admin**). Sekiz rapor
   arasında operasyon ve personel raporları da var; bunlar finans
   kapısının arkasında kalırsa operasyon müdürü kendi ekibinin iş yükünü
   göremez.

**Karar gerekiyor:** raporlar finans altında admin'e mi kalacak, yoksa
`reports` modülü kendi kapısıyla mı açılacak (modül anahtarı zaten var:
`"/panel/finance/raporlar": "reports"`). Her raporun kendi yetenek
anahtarı olması en temizi; tutar içeren raporlar `finance.gor` istemeye
devam eder.

---

## 4a. Tahsilat raporuna ek istek — beklenen tahsilat takvimi

Kurum sahibinin eki (24.10.2026): "Taksitlerden önümüzdeki ay ne kadar
tahsilatımız olacak, aylara göre beklenen tahsilatlar da görmemiz
lazım."

**Hesaplanabilir.** `payment_installments` (amount, due_date,
payment_plan_id) + `payment_plans` (contract_id, party_id) yeterli.

### Hesaplama kuralı — dikkat

Beklenen tahsilat, taksitin TUTARI değil **KALANI**. Ve kalan,
taksitin kendi `status` sütunundan okunamaz:

> `payment_installments.status` cari tahsilatıyla GÜNCELLENMİYOR.
> Ödenmişlik `lib/taksit-dagitimi.ts` ile türetiliyor: cari dökümündeki
> net tahsilat, en eski vadeden başlayarak taksitlere dağıtılıyor.

Naif bir `status <> 'paid'` sorgusu, ödenmiş ama durumu güncellenmemiş
taksitleri de "beklenen" sayar ve rakamı **olduğundan büyük** gösterir.
Bu tuzak bu depoda bir kez yaşandı: müşteri 31.500 TL ödemişken tek
taksit hâlâ "ödenmedi" görünüyordu (lib/taksit-dagitimi.ts başlığı).

Doğru akış, sözleşme/cari başına:
1. Cari dökümünden net tahsilatı al (tahsilat − iade).
2. `taksitleriDagit` ile taksitlere dağıt.
3. Her taksitin `kalan` değerini vade AYINA topla.

### Rapor içeriği

- **Önümüzdeki ay beklenen tahsilat** (tek rakam, kokpitte de görünür)
- **Aylara göre beklenen tahsilat**: gelecek 6–12 ay, çubuk + tablo
- **Vadesi geçmiş kalan**: ayrı gösterilir, geleceğe karıştırılmaz
- Müşteri ve sözleşme kırılımı, ilgili kayda geçiş

### Sınırı

Bu bir TAKVİM, tahmin değil: yalnızca ödeme planı olan sözleşmelerin
taksitlerini sayar. Planı olmayan sözleşme ve plansız beklenen gelir
buraya girmez; rapor bunu açıkça yazmalı, yoksa "önümüzdeki ay şu kadar
tahsilat var" cümlesi eksik bir tabandan kurulmuş olur.

---

## 5. Altyapı

- **Grafik kütüphanesi yok ve gerekmiyor.** `MiniGrafik` beş tür biliyor
  (çubuk, halka, gösterge, yığın, şelale, durum). Yeni bağımlılık
  eklemeden genişletilebilir.
- **Modal kalıbı var**: `PanelDrawer` (portal, odak tuzağı, ESC,
  `genis` seçeneği). Şartnamenin istediği %90/%88'lik pencere için
  üçüncü bir boy eklemek yeterli.
- **Yazdırma var**: `PrintReportButton` + `@media print`. PDF için ayrı
  kütüphane gerekmiyor; tarayıcının "PDF olarak kaydet"i kullanılıyor.
- **Excel YOK.** Bağımlılık eklemeden sunucuda CSV üretmek mümkün
  (`text/csv`, Excel açıyor). Gerçek `.xlsx` isteniyorsa bağımlılık
  gerekir — karar gerekiyor.
- **Liste altyapısı var**: sayfalama (`lib/liste-sayfalama`), arama
  (`lib/liste-arama`), görünümler (`crm_*_liste`, `operasyon_is_liste`).
  Şartnamenin "sunucu tarafında sorgu, sayfalama, agregasyon" kuralı bu
  depoda zaten yürürlükte.

---

## 6. Önerilen sıra

Şartnamenin kendi sırası korunuyor:

1. **Ortak altyapı**: rapor merkezi, rapor kartı, geniş modal, filtre
   modeli, modal geçmişi (raporlar arası geçiş), KPI/grafik/tablo
   bileşenleri, yazdırma başlığı.
2. **Yönetici Kokpiti + Satış Analitiği** — ikisi birlikte altyapıyı
   gerçek veriyle sınar.
3. Tahsilat → Teklif/Sözleşme → Finans → CRM → Operasyon → Personel.
4. Raporlar arası drill-down.
5. Test: KPI'ları veritabanıyla karşılaştırma, yetki, yazdırma.

Her aşama ayrı ayrı canlıya çıkabilir; mevcut Raporlar sayfası
bozulmadan yanına eklenir.

---

## 6. Aşama 2 — kurulan ortak altyapı (24.10.2026)

Sayfa artık **raporun kendisi değil merkezi**. Eski içerik silinmedi,
"Yönetici Kokpiti" raporuna taşındı.

### Rapor adresten açılıyor

`?rapor=satis&aralik=bu_ay` — bu depodaki `?pencere=` kalıbının aynısı.
Üç kazanç: sorgular **sunucuda** kalıyor (RLS kendiliğinden uyguluyor),
**geri tuşu** çalışıyor, **dönem ve süzgeçler** raporlar arası geçişte
taşınıyor (`raporAdresi` / `kapatmaAdresi`, `lib/rapor-tanimlari.ts`).

### Dosyalar

| Dosya | İş |
|---|---|
| `lib/rapor-tanimlari.ts` | sekiz raporun kodu, başlığı, yetki anahtarı; adres yardımcıları |
| `lib/rapor-donemi.ts` | dönem çözümü, Türkiye günü, aralık yüklemi (saf, testli) |
| `lib/rapor-okuma.ts` | sayfalayan okuma + kimlikle okuma (saf arayüz, testli) |
| `lib/rapor-ikonlari.ts` | ikon adları — derleyici bağlıyor |
| `lib/rapor-satis.ts` | RPR-01'in kararı ve Excel sayfaları (saf, testli) |
| `lib/xlsx.ts` | bağımlılıksız .xlsx yazıcı; artık **hücre düzeyinde biçim** |
| `raporlar/page.tsx` | merkez: kapı, dönem çubuğu, kartlar, pencere |
| `raporlar/rapor-penceresi.tsx` | pencere çerçevesi: künye, dönem, indir, yazdır, geçiş |
| `raporlar/rapor-pencere-kabugu.tsx` | istemci: portal, Esc, odak tuzağı, kaydırma kilidi |
| `raporlar/rapor-parcalari.tsx` | ortak sunum: ikon, mini grafik, KPI kutusu, defter |
| `raporlar/kokpit-raporu.tsx` | RPR-00 (eski sayfa içeriği) |
| `raporlar/satis-raporu.tsx` | RPR-01: sorgular + ekran |
| `raporlar/indir/route.ts` | Excel; kapıyı **yeniden** soruyor |

### Aşama 2'de bulunan ve düzeltilen üç sessiz kusur

1. **`Icon` bilinmeyen adı boş SVG çiziyordu.** Pencereye `"download"`
   adıyla ikon kondu, haritada yoktu, düğme ikonsuz çıktı — hata yok,
   uyarı yok. Ad artık `IkonAdi` birliği ve harita
   `Record<IkonAdi, ReactNode>`: eksik çizim de, olmayan ad da
   **derleme hatası**.
2. **İç içe pencerede odak tuzağı bir sonraki pencereyi öldürüyordu.**
   `useOdakTuzagi` `.panel-root`'un çocuklarını inert yapıyor; rapor
   penceresi açılırken kokpitin kart pencereleri (`panel-drawer-root`,
   portalla aynı kökte) de inert alıyordu. Kart açılıyor ama hiçbir
   şeye tıklanamıyordu. Kancaya "kendi inert'ini yönetenler" listesi
   eklendi.
3. **Kaydırma kilidi iç pencere kapanınca kalkıyordu.** PanelDrawer
   `body.style.overflow`'u kapanışta `""` yapıyor ve raporun kilidini
   de siliyordu. Rapor penceresi kilidi artık `body.rapor-kilit`
   sınıfıyla kuruyor: satır içi biçimin altında kalıyor, iki katman
   birbirini bozmuyor.

### Değişmez: sayı tek yerden

Her rapor **modeli döndüren bir işlev** veriyor; ekran da Excel de aynı
işlevi çağırıyor (`satisVerisi` → ekran / `satisSayfalari` → dosya).
Çıktıyı ayrı hesaplamak, ekranda 23.500 ₺ yazarken dosyada başka bir
sayı olmasının en kısa yoluydu. Birim dönüşümü dosyada yapılıyor: para
kuruş tamsayı, Excel para biçimi **lira** bekliyor; yüzde biçimi **oran**
bekliyor (0,5 = %50).

### Durum

**SEKİZ RAPORUN HEPSİ HAZIR** (24.10.2026): RPR-00 Yönetici Kokpiti,
RPR-01 Satış Analitiği, RPR-02 CRM ve Müşteri Analitiği, RPR-03
Tahsilat ve Alacak, RPR-04 Finansal Performans, RPR-05 Personel
Performansı, RPR-06 Operasyon ve İş Akışı, RPR-07 Teklif ve Sözleşme.
Kokpit dışındakilerin hepsi Excel'e aktarılıyor.

`HAZIR` ve `INDIRILEBILIR` listeleri `page.tsx`'te duruyor: dokuzuncu
rapor eklendiğinde gövdesi yazılana kadar kartı tıklanamaz kalsın
diye. Boş pencere açmak, kusuru kullanıcının hatası gibi
gösterirdi.

---

## 7. RPR-03 Tahsilat ve Alacak (24.10.2026)

Kurum sahibinin eki (§4a) bu raporun içinde: **aylara göre beklenen
tahsilat**.

### Üç soru ayrı duruyor

| Soru | Kaynak | Niteliği |
|---|---|---|
| Dönemde ne kadar para girdi? | `account_entries` | **akış** (döneme bağlı) |
| Ne kadar alacağımız var? | cari bakiyesi (`cari_liste` + sözleşmeler) | **durum** (dönemsiz) |
| Önümüzdeki ay ne bekliyoruz? | `payment_installments` kalanı | **takvim** |

Birini diğerinin yerine koymak ya da toplamak yanlış; ekranda da
böyle yazıyor.

### Beklenen tutar taksitin KALANI

`payment_installments.status` cari tahsilatıyla güncellenmiyor. Naif
bir `status <> 'paid'` sorgusu beklenen tahsilatı **olduğundan büyük**
gösterir. Akış:

1. Carinin ömür boyu net tahsilatı (`netTahsilatToplamdan`),
2. `taksitleriDagit` ile en eski vadeden başlayarak dağıtım,
3. `bakiyeyeSigdir` ile açık bakiyeye sığdırma (plan sözleşmeden
   büyük olabiliyor: 09.10.2026'da 45.000'lik sözleşmenin planı
   2 × 27.500'dü),
4. her taksitin `kalan` değeri vade AYINA toplanıyor.

Örnek veriyle ölçüldü: 19.000 TL'lik sözleşmede 6.333 TL ödenmiş,
üç taksitin hepsi `status = "pending"`. Rapor ilk taksiti **beklenen
saymıyor** ve gecikmiş göstermiyor; naif sorgu 6.333 TL'yi "vadesi
geçmiş" yazardı.

### Bakiye kuralı kopyalanmadı

`buildAccountBalances` (finance/account-balances.ts) tek kaynak —
Cari Hesaplar sekmesi ve Finans genel bakış da onu çağırıyor. Raporun
kendi bakiye hesabını yazması, aynı müşteri için üç ekranda üç ayrı
rakam demekti.

### Takvimin sınırı raporda yazılı

Yalnızca **ödeme planı olan** sözleşmelerin taksitleri sayılıyor.
Planı olmayan açık bakiye "plansız" olarak ayrı gösteriliyor; vadesi
geçmiş kalan ayrı bir kovada (geleceğe karıştırılmıyor); vadesi
girilmemiş taksit bir aya uydurulmuyor; 12 ay ufkunun ötesindeki vade
takvimde yok ama "planlı kalan" ile farkı ekranda yazıyor.

### Bu turda bulunan iki kusur

1. **Takvim satırının türü anahtarından çıkarılıyordu.** Ay anahtarı
   `"2026-11"` yedi karakter — ama `"vadesiz"` de yedi karakter ve
   aynı kovaya düşüyordu. Satır artık `tur: "ay" | "gecmis" |
   "vadesiz"` taşıyor; biçime bakan her yer aynı hatayı yeniden
   kurardı.
2. **Excel'de tarihler METİN'di.** `"2026-09-01"` hücre olarak
   görünüyor ama Excel onu tarih bilmiyordu: tarih süzgeci
   çalışmıyor, gün farkı alınamıyor, ekranda "01.09.2026" yazarken
   dosyada ISO duruyordu. `lib/xlsx.ts`'e `"tarih"` biçimi eklendi
   (Excel gün sayısı + `dd.mm.yyyy`); çevrilemeyen değer metin olarak
   yazılıyor — hücreyi atlamak veriyi sessizce düşürmek olurdu.

---

## 8. TUZAK — teklifin durumu `status` sütununda DEĞİL (24.10.2026)

Şartnamenin kendi kuralı ("gerçek alanları incelemeden geliştirme
yapma") bu turda **kendi kodumda** bir hata yakaladı.

Canlıdaki tetikleyici:

```sql
CREATE TRIGGER archive_inactive_crm_proposal
  BEFORE INSERT OR UPDATE OF status, valid_until ON public.crm_proposals
```

kabul/ret/süresi geçmiş teklifi görünce satırı şöyle değiştiriyor:

```sql
archive_reason := status;
status         := 'archived';
```

Yani **veritabanında `status = 'accepted'` olan bir teklif hiç yok.**
Tetikleyici ayrıca `valid_until` geçmiş bir `sent` teklifi kendiliğinden
`expired` yapıyor.

**Sonucu:** RPR-01 Satış Analitiği'nin kabul sayımı
`teklif.status === "accepted"` yazıyordu. Bu koşul hiçbir satırda
doğru olmaz, hata da vermez — **teklif → satış dönüşümü her zaman %0
gösterecekti** ve rakam makul göründüğü için aylarca fark edilmeyebilirdi.

**Düzeltme:** kural `lib/teklif-durumu.ts`'te tek yerde
(`etkinTeklifDurumu`), veritabanındaki
`private.arvo_proposal_effective_status`'ın **ikizi** — biri değişirse
diğeri aynı gün değişir. Satış raporunun sorgusu artık
`archive_reason`'ı da seçiyor; birim testi eski kalıba dönüşü
yakalıyor.

**Ders:** sütun adı doğru, tip doğru, sorgu çalışıyor, hata yok — ve
sonuç her zaman sıfır. Bu deponun en sık kusur sınıfı bu
(§"Okunamayan sorgu denetimi", `check:schema`'nın "değer imkânsız"
dalı). Yeni bir rapor bir durum sütunuyla süzerken **o sütuna yazan
tetikleyici var mı** diye bakılmalı.

---

## 9. RPR-07 Teklif ve Sözleşme (24.10.2026)

### Süreç mi satır mı

Teklif **süreç** olarak sayılıyor: `root_proposal_id` zinciri bir
ticari süreç. Sürecin durumu, zincirin **herhangi bir** revizyonu
kabul edildiyse kabul — kabul edilen revizyon sonradan bir düzeltmeyle
"superseded" olabiliyor ve yalnızca son revizyona bakmak, kabul
edilmiş bir satışı "yanıt bekliyor" göstermek olurdu. Sürecin tutarı
**son gönderilen** revizyondan; sıra `revision_no` ile, çünkü
satırların geliş sırasına güvenilemez ve `sent_at` gönderilmemiş
revizyonda boş.

### Zincirin tamamı okunuyor

Dönemde gönderilen bir revizyonun önceki halkaları pencereden eski
olabilir. İki adım: pencere → kökler → zincirin kalanı
(`root_proposal_id in (...)` ve kökün kendisi `id in (...)`). Yalnızca
pencereyi okumak süreci yarım görmekti.

### Akış ile durum ayrı

| Ölçüt | Niteliği |
|---|---|
| Dönemde gönderilen / imzalanan sözleşme | **akış** |
| İmza bekleyen, devam eden sözleşme | **durum** (dönemsiz) |

İki ay önce gönderilip hâlâ imzalanmamış bir sözleşme bu ayın
raporunda da görünüyor; dönem süzgecinin arkasına saklamak raporun en
çok işe yarayan satırını gizlemek olurdu. Bu yüzden açık sözleşmeler
**ayrı bir sorgu** — durumu `or` zincirine gömmek yerine, çünkü
zincirin içindeki `in` yazımı bozulduğunda hata vermeyip sessizce
satır eksiltiyor.

### "Müşteri açtı mı" gerçek veri

`first_viewed_at` ve `view_count` tabloda var ve kararı değiştiriyor:
açılmamış bir sözleşme için hatırlatma, açılıp imzalanmamış için
telefon gerekir. Yanıt süresi de yanıtı **alan** revizyonun kendi
gönderiminden ölçülüyor — ilk gönderimden ölçmek, araya giren
revizyonların süresini müşterinin yanıt süresine yazmak olurdu.

---

## 10. RPR-04 Finansal Performans (24.10.2026)

### Üç kavramın üçüncüsü

| Soru | Kaynak | Rapor |
|---|---|---|
| Ne kadar sattık? | `crm_contracts.amount` | RPR-01 |
| Kasaya ne girdi? | `account_entries` | RPR-03 |
| Muhasebesel sonuç ne? | `finance_transactions` + `contract_cost_items` | **RPR-04** |

`billing_invoices` / `billing_subscriptions` **bu rapora girmez**:
Arvo'nun kendi tahsilatı, kiracının geliri değil
(`billing_subscriptions` her kurum ödemesinin aktivasyon ikizi ve
toplanınca her ödemeyi iki kez sayıyor).

### İki çıkış kalemi toplanmadan önce ayrı duruyor

- `finance_transactions` (expense): **genel gider**,
- `contract_cost_items`: **belirli bir işin maliyeti**.

"Gider" diye tek rakam göstermek, hangi işin kârsız olduğunu görünmez
yapardı. Üç ayrı kategori tablosu var: gelir, genel gider, iş maliyeti.

### Planlı kayıtlar pencereden muaf

Ödenmiş hareketler altı aylık pencereyle okunuyor (defter hiç
küçülmüyor; satır tavanına çarpmak geliri sessizce eksiltirdi) ama
**planlı kayıtlar tüm zamanlar**: vadesi geçmiş bir gider altı aydan
eski olabilir ve raporun aksiyon gerektiren tek satırı o. Vadesi
girilmemiş plan hiçbir döneme düşmüyor; gizlenmiyor, kendi satırında
sayılıyor ki toplamlar tutsun.

---

## 11. TUZAK — "iptal" iki tabloda iki ayrı yazımla

Canlı şemadan doğrulandı (24.10.2026):

```
finance_transactions.status → 'planned' | 'paid' | 'canceled'   (TEK L)
payment_installments.status → 'pending' | 'paid' | 'cancelled'   (ÇİFT L)
```

Aynı veritabanı, aynı anlam, iki yazım. Yanlışını kullanmak **hata
vermez**, sessizce sıfır satır eşleştirir: `canceled` yazılan bir
taksit sorgusu iptalleri hesaba katar, `cancelled` yazılan bir finans
sorgusu iptal edilmiş geliri gelir sayar.

`check:schema`'nın "değer imkânsız" dalı tam bu sınıfı arıyor
(`.eq/.neq/.in` süzgeçlerini kısıt listesiyle karşılaştırıyor) — ama
yalnızca sorgu zincirinde yazılan değerleri görüyor; TypeScript
içindeki `h.status === "cancelled"` gibi bir karşılaştırma onun görüş
alanında değil. Yeni bir durum süzgeci yazarken `canli-sema.sql`'deki
`*_status_check` kısıtına bakın.

---

## 12. TUZAK — huni aşama kümeleri koda yazılıydı (24.10.2026)

`crm_opportunities.stage` kısıtı **on sekiz** değere izin veriyor:

```
lead qualified proposal contract payment won lost
pre_review academic_review proposal_ready proposal_approved
contract_ready payment_pending payment_approved
work_opened expert_assigned delivery completed
```

Kokpitin (eski Raporlar sayfasının) huni kümeleri bunların **altısını**
tanıyordu:

```ts
reachedStages   = ["qualified","proposal","contract","payment","won","lost"]
qualifiedStages = ["qualified","proposal","contract","payment","won"]
```

Akademik kurumlar ayrıntılı aşamaları kullanıyor. Listede olmayan bir
aşamadaki talep huniye **hiç girmiyordu**: teklifi hazırlanmış
(`proposal_ready`), sözleşmesi imzalanmış (`contract_ready`), işi
açılmış (`work_opened`) talepler "ulaşılamamış" sayılıyor ve dönüşüm
oranı olduğundan **küçük** çıkıyordu. Hata görünmüyordu çünkü eksik
sayılan talep yalnızca eksik sayılıyordu.

Aynı kusur `stage === "won"` karşılaştırmasında da vardı: akademik
kurumda kazanılan talep `won` değil `work_opened` / `delivery` /
`completed` oluyor.

### Eşlemenin kendisinde de bir boşluk vardı

`lib/talep-asamalari.ts`'teki aşama→adım eşlemesinde **`payment`
aşaması hiç yoktu**. `talepAdimi("payment")` null dönüyordu, yani
genel kurumların akışında sözleşmesi imzalanıp ödeme bekleyen bir
talep, talep detayındaki **aşama çizgisinde arşivlenmiş talep gibi
davranıyordu** — boş. Eklendi (`payment: 3`, ayrıntılı ikizleriyle
aynı adım).

### Düzeltme

Karar tek yerde: `lib/talep-asamalari.ts` → `temasKuruldu`,
`nitelikliAday`, `teklifeGecti`, `kazanildi`. Kokpit ve RPR-02 bunları
çağırıyor. Yeni bir test izinli aşamaları **şema dökümünden** okuyup
eşlemede karşılığı olmayan aşama kalmadığını doğruluyor: aşama
migration'la eklenip döküm yenilendiğinde test düşer.

---

## 13. TUZAK — Türkçe küçültme gruplamayı bölüyor (24.10.2026)

Serbest metin alanları (hizmet türü, talep kaynağı, kayıp sebebi,
cari kaydı olmayan müşterinin adı) gruplanırken anahtar
`toLocaleLowerCase("tr")` ile üretiliyordu. Türkçe küçültme büyük
`I`'yi **noktasız ı** yapıyor:

```js
"Instagram".toLocaleLowerCase("tr")  // → "ınstagram"
"instagram".toLocaleLowerCase("tr")  // → "instagram"
```

Yani "Instagram" ile "instagram" **ayrı gruplara** düşüyordu: rapor
aynı kaynağı iki satırda gösterir, paylar bölünür. Varsayılan
küçültme ise ters yönde yanılıyor (`İ` → `i̇`, i + birleşen nokta).
Hangi kural seçilse büyük harfle yazılmış Türkçe metin ötekiyle
ayrışıyordu ("TEZ YAZIMI" / "Tez Yazımı").

**Çözüm** `lib/metin-anahtari.ts`: Türkçe küçültmeden sonra ı ve i tek
harfe indiriliyor. Bedeli bilinçli — yalnızca ı/i ile ayrılan iki
gerçekten farklı kelime ("sıra" / "sira") aynı gruba düşer;
karşılığında kullanıcının Türkçe klavye kullanmadan yazdığı kayıt
doğru kalemle birleşiyor. Anahtar hiçbir yerde GÖSTERİLMİYOR; ekranda
ilk görülen yazım duruyor.

Bu kusuru ürün değil **test** yakaladı: "kaynak yazım farkını tek grup
yapar" testi iki satır bulunca düştü.

---

## 14. RPR-02 CRM ve Müşteri Analitiği (24.10.2026)

### Müşteri kimliği

`account_parties.id` (sözleşmedeki `party_id`) gerçek kimlik;
`crm_opportunities.customer_name` **serbest metin**. Tekrar satış
analizi `party_id` üzerinden; cari kaydı olmayan sözleşme adından
türetilmiş bir anahtara düşüyor ve **bu kaydın sayısı raporda
yazıyor**. Sessizce ada güvenmek, aynı müşteriyi iki müşteri gibi
gösterip "tekrar eden müşteri" oranını olduğundan küçük yazardı.
Cari kaydı olmayan müşterinin satırında bağlantı da yok — tıklanıp
boş sayfa açmak, kaydın olmamasını hata gibi göstermek olurdu.

### Tekrar eden müşteri ömür boyu bakılarak

İmzalı sözleşmeler **tüm zamanlar** okunuyor (sayfalanarak): dönemde
imzalayan bir müşterinin daha önce de sözleşmesi varsa tekrar eden.
Yalnızca dönem içine bakmak iki yıllık bir müşteriyi "yeni" göstermek
olurdu. AGENTS.md'nin izin verdiği sınırsız okumalardan biri —
gerekçesi dosyada yazılı.

### Kayıp kararın anına göre

Kayıp `updated_at` ile sayılıyor, `created_at` ile değil: talep temmuzda
açılmış olabilir, kaybedildi kararı bu ay verilmiş olabilir.

---

## 15. RPR-06 Operasyon ve İş Akışı (24.10.2026)

### Bu raporda TUTAR YOK — tasarım kararı

Operasyon departmanı üyeleri sözleşme tutarını, teklif tutarını ve
müşteri bakiyesini hiçbir şekilde göremiyor (migration
20261023183540 + 20261023184948). Rapor tutar okumuyor bile; bir
birim testi **bütün Excel sayfalarında para sütunu olmadığını**
sabitliyor ve örnek dosyada para stili (`s="2"`) sıfır kez geçiyor.
Buraya "iş değeri" eklemek, üç katmanlı yetki kuralını rapor
üzerinden atlatmak olurdu.

### Gecikme TERMİNE göre, duruma göre değil

Durumu `in_progress` olan bir işin termini geçmiş olabilir ve durum
bunu söylemiyor. Kapanmış iş (`completed` / `cancelled` / `archived`)
gecikmiş sayılmıyor: kapanmış bir işin termini artık bir şey ifade
etmiyor. Örnek veriyle ölçüldü — termini 1 Eylül olan tamamlanmış iş
gecikme listesine girmedi.

### Akış ile durum ayrı

| Ölçüt | Niteliği |
|---|---|
| Dönemde açılan / tamamlanan iş | **akış** |
| Devam eden, termini geçmiş, bekleyen taraf, öncelik | **durum** (dönemsiz) |

Açık işler **tüm zamanlar** okunuyor (sayfalanarak); kapanmış işler
altı aylık pencereyle. İki okuma kimlikle birleştiriliyor.

### Öncelik ve "kim bekleniyor" yalnızca AÇIK işlerden

Kapanmış işin önceliği artık bir karar gerektirmiyor; dahil etmek
"acil iş sayısı"nı geçmişle şişirirdi. `waiting_party`
(`us` / `customer` / `third_party`) gerçek bir alan ve kararı
değiştiriyor: bizde bekleyen iş için plan, müşteride bekleyen iş için
hatırlatma gerekir.

### Ekip yükü ASIL sorumluya

22.10.2026'dan beri bir işte **ek sorumlular** olabiliyor
(`operation_workflow_assignees`) ama o migration'ın kendi kararı
şöyle: *"'Sorumluya göre aktif iş' istatistiği ve ekip yükü işi bir
kişiye sayıyor; iki kişiye saymak toplamı şişirirdi."* Rapor o kararı
izliyor (`assigned_employee_id`); sorumlusu girilmemiş işler
"Atanmamış" satırında toplanıyor, gizlenmiyor — kişi yüklerinin
toplamı devam eden iş sayısına eşit olmalı.

### Görevler yalnızca açık işlerden

`operation_steps` iş tablosunun katı; kapanmış işin görevleri bir
karar gerektirmiyor. Görevler **kimlikle** okunuyor (pencereyle
değil): açık bir iş pencereden eski olabilir. Tamamlanmışlık iki
alandan birinden gelebiliyor (`is_completed` ya da `status = 'done'`),
ikisi de sayılıyor.

---

## 16. RPR-05 Personel Performansı (24.10.2026)

### Hedef verisi YOK ve uydurulmuyor

`hedef`, `target`, `kota`, `budget` adında hiçbir tablo yok (§2.1).
Rapor "Hedef gerçekleşmesi" bölümünü **boş durum mesajıyla**
gösteriyor ve nedenini yazıyor; Excel'de de hücreye "Hedef tablosu
tanımlı değil" yazıyor. Ortalamayı hedef yerine koymak en kolay yoldu
ve en yanıltıcısı: kimsenin koymadığı bir hedefe göre "hedefin %60'ı"
yazmak, yöneticiye **var olmayan bir karar zemini** verirdi.

Hedef takibi istenirse ayrı bir iş: kişi ve döneme bağlı bir hedef
kaydı (`hr_employee_targets` gibi) + panelde giriş ekranı. Rapor o
veriyi gördüğü anda bölümü doldurur.

### Satış ve operasyon AYRI tablolar

Kişi yalnızca **kendisine atanan** kayıtlarla görünüyor: satış
tablosunda üzerine talep atanmış kişiler, operasyon tablosunda üzerine
iş atanmış kişiler. İki tarafı tek bir "performans puanı"nda toplamak,
farklı iş yapan iki insanı aynı cetvelle ölçmek olurdu — şartnamenin
kuralı da operasyon personelini satış rakamıyla değerlendirmemek.
İki işi de yapan kişi iki tabloda da görünüyor; bu bir çelişki değil,
olgu.

Not: bu rapor yönetime açık (`rapor.personel` varsayılanı yönetim).
Operasyon departmanının tutar görememesi kuralı (migration
20261023183540) **izleyici** hakkındadır, ölçülen kişi hakkında değil.

### Sözleşme personele TALEP ÜZERİNDEN bağlanıyor

`crm_contracts`'ta personel alanı **yok**. `created_by` sözleşmeyi
YAZAN kullanıcı — yöneticiler de yazıyor, yani satışı yapan kişi
olmak zorunda değil. Bağlantı: sözleşme → `opportunity_id` → talebin
`assigned_employee_id`'si. Eşleme ayrı bir saf işlev
(`sozlesmeleriBagla`) ve kendi testleri var; talebi atanmamış sözleşme
kimseye yazılmıyor.

### Prim: tahakkuk ile ödenen ayrı

`status` dört değer alıyor (`accrued` | `approved` | `paid` |
`cancelled`). İptal edilmiş prim hiçbir toplama girmiyor. Tahakkuk
`accrued_at`, ödeme `paid_at` ile dönemlenir — aynı prim bir ayda
tahakkuk edip başka ayda ödenebiliyor, ikisini toplamak aynı primi
iki kez saymak olurdu.

### Kadro tam okunuyor

"Üzerine kayıt atanmamış aktif personel" sayısı ancak tam kadroyla
bilinir, o yüzden `hr_employees` tamamı okunuyor (sayfalanarak; tablo
kurum ölçeğinde küçük). Ayrılmış personel (`terminated`) aktif
sayılmıyor ama üzerine kayıt varsa tablolarda görünmeye devam ediyor —
geçmiş dönemin raporu o kişiyi yok saymamalı.

---

## 17. Tutarlılık katmanı (24.10.2026)

Bu alt sistemde bulunan kusurların **hepsi** aynı sınıftandı ve
hiçbiri hata vermiyordu — yalnızca yanlış sayıyorlardı:

| Kusur | Belirti |
|---|---|
| Personel kutusunda iki işi de yapan kişi iki dilimde | dilim toplamı kutudaki sayıyı aşıyor |
| Teklif kutusunda süresi geçen süreçler hiçbir dilimde | toplam, süreç sayısını tutmuyor |
| Huni kümeleri aşamaların üçte birini tanımıyor | dönüşüm olduğundan küçük |
| Kabul `status` sütununda aranıyor | dönüşüm her zaman %0 |
| `payment` aşaması eşlemede yok | talep çizgide arşiv gibi |

Ortak nokta: **bir toplam, olması gereken başka bir toplamla
tutmuyordu.** Ekranda bu görünmez; rakam makul durur.

### `lib/rapor-tutarlilik.ts`

Her raporun modelini alıp tutmayan ilişkileri listeliyor. İki yerde
kullanılıyor:

1. **Rastgele girdili testlerde** (`tests/unit/rapor-tutarlilik.test.ts`):
   yedi model, her biri 300 tur, tohumlu üreteçle. Örnek tabanlı test
   yazanın aklına geleni sınar; bu alt sistemdeki kusurların hepsi
   akla gelmeyen birleşimlerde çıktı (iki işi de yapan personel,
   süresi geçmiş süreç, akademik aşama, yıl içinde ikinci imza).
2. **Ekranda** (`TutarlilikUyarisi`): tutarsızlık varsa rapor bunu
   YAZIYOR. Sessizce yanlış sayı göstermektense "şu toplam tutmuyor"
   demek yeğdir.

**Kural:** buraya yalnızca gerçekten değişmez ilişkiler yazılır.
Yanlış bir değişmez, olmayan bir hatayı her gün bildirir ve kullanıcı
uyarıyı okumamayı öğrenir — denetim o gün ölür. Kırpılmış listeler
(ilk 20, ilk 25) bu yüzden eşitlikle değil **≤** ile sınanıyor.

Bu kural daha yazılırken işe yaradı: "ödenen prim ≤ tahakkuk eden
prim" ölçütünü koydum, rastgele test ilk turda düşürdü. İkisi farklı
tarihlerle dönemleniyor (tahakkuk `accrued_at`, ödeme `paid_at`);
eylülde tahakkuk edip ekimde ödenen prim ekim raporunda "tahakkuk 0,
ödenen X" verir ve bu **doğru** davranıştır. Ölçüt kaldırıldı.

### `tests/unit/raporlar-arasi.test.ts`

Aynı ham veri iki ayrı modele verilip ortak büyüklüklerin eşitliği
sınanıyor: Satış ↔ Teklif (imzalı tutar/adet, teklif süreci, kabul),
Tahsilat ↔ Finans (dönem net tahsilatı). Aynı gerçeği iki rapor
farklı söylerse kullanıcı hangisine güveneceğini bilemez.

Ölçütler bilerek dar: yalnızca **tanımı aynı** büyüklükler
karşılaştırılıyor. CRM kazanımı ile satış adedi eşit olmak zorunda
değil (biri aşamadan, öteki sözleşmeden gelir) ve test bunu da
sabitliyor — ilişkinin yönünü, eşitliği değil.

---

## 18. Sistem oturdu — kontrol katmanlarının özeti (24.10.2026)

Sekiz raporun hepsi aynı iskelete oturdu:

```
ham satırlar → saf MODEL → tutarlılık denetimi → ekran
                   ↓                                ↓
              Excel sayfaları              uyarı (tutmuyorsa)
```

| Katman | Dosya | Neyi yakalar |
|---|---|---|
| Model | `lib/rapor-*.ts` | — (karar burada, saf ve testli) |
| Değişmezler | `lib/rapor-tutarlilik.ts` | bir toplam, olması gereken başka toplamla tutmuyorsa |
| Rastgele tur | `tests/unit/rapor-tutarlilik.test.ts` | akla gelmeyen girdi birleşimleri (8 model × 300 tur) |
| Raporlar arası | `tests/unit/raporlar-arasi.test.ts` | iki raporun aynı gerçeği farklı söylemesi |
| Excel paritesi | `tests/unit/rapor-excel-parite.test.ts` | birim dönüşümü kayması (kuruş/lira, yüzde/oran) |
| Bağlantı | `tests/unit/rapor-baglanti.test.ts` | rapor eklerken unutulan/yanlış bağlanan uç |
| Şema sözleşmesi | `tests/unit/durum-yazimlari.test.ts` | durum değerlerinin yazımı, tetikleyici varlığı |
| Ekran | `TutarlilikUyarisi` | canlıda tutmayan toplam (normalde hiç görünmez) |

### Kokpit artık istisna değil

Kokpitin hesabı bileşenin içindeydi, yani üstteki katmanların
hiçbirine giremiyordu — kullanıcının ilk açtığı rapor, ayrıntı
raporlarından bağımsız hesap yapıyordu. Saf modele taşındı
(`lib/rapor-kokpit.ts`), matematiğe dokunulmadan. İki test taşımanın
doğruluğunu ve bundan sonra ayrışmayacağını birlikte sabitliyor:
`kokpit.salesValue == satış.toplam`, `kokpit.collections ==
tahsilat.donemTahsilat`.

### Bu katmanlar ne yakalayamaz

Dürüst olmak gerekirse: **verinin kendisinin doğru olup olmadığını.**
Raporlar `finance_transactions`'ta ödenmiş gelir kaydı yoksa "gelir
₺0" der ve bu doğrudur — ama kurumun gerçekten geliri yok mu, yoksa
kayıtlar "ödendi" işaretlenmemiş mi, bunu ancak veriye bakarak
anlarız (§"Finansal Performans" notuna bakın). Rapor artık bu ikisini
AYIRIP söylüyor; ama hangisinin doğru olduğuna karar vermek
kullanıcının işi.

İkincisi: **canlıda sayfanın açıldığını.** tsc, lint, testler ve
derleme sayfanın derlendiğini söylüyor, çalıştığını değil
(AGENTS.md "Canlı duman testi"). Dağıtımdan sonra `npm run duman`
oturum çereziyle elle koşturulmalı.
