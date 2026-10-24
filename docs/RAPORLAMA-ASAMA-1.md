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

### 2.1 Hedefler yok
`hedef`, `target`, `kota`, `budget` adında **hiçbir tablo yok**.
"Hedef gerçekleşmeleri" hesaplanamaz. Şartname bunu koşullu yazmış
("hedefler tanımlanmışsa"); rapor o bölümü boş durum mesajıyla
göstermeli, uydurma bir hedef üretmemeli.

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
