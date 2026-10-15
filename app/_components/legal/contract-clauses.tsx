import { isValidElement, type ReactNode } from "react";
import { akademikMerkezTemplate, arvoOSGeneralTemplate, type ContractClause, type ContractTemplate } from "@/lib/contract-templates";
import type { WorkPlanItem } from "@/lib/work-plan";
import { birimleriYaz, etkinSira, kalinAyir, kurumMetniCoz, metniCoz, surumleriBirlestir, yerTutucuDoldur, type Birim, type MaddeMetni } from "@/lib/belge-metni";
import { BankAccountBox, PartyCard, PaymentPlanTable, TaxTotals, WorkPlanTable, customerRows, providerRows, providerTaxLine, type Customer, type Provider } from "./blocks";
import { LEGAL_TEXT_VERSION, amountInWords, formatDate, formatDateTime, formatMoney, numberToTurkishWords, type LegalTextVersion, type PartyKind, type ScheduleRow, type TaxBreakdown } from "./format";
import { formatIban } from "./identifiers";

/**
 * Hizmet Sözleşmesi'nin yapılandırılmış yasal iskeleti (metin sürümü 3.1).
 *
 * Sürüm farkları (imzalı sözleşme, onayladığı sürümle gösterilir):
 *  - 3.0: tebligat ve KVKK başvuru maddelerinde KEP geçer; havale/EFT
 *    hesabı "faturada bildirilir".
 *  - 3.1: KEP ifadeleri çıkarıldı (bildirim: adres + e-posta); kurumun
 *    IBAN'ı girilmişse ödeme maddesinde ve Ön Bilgilendirme Formu'nda
 *    banka hesabı gösterilir.
 *
 * Kurumun şablonuna özgü hükümler (ör. akademik etik, yazılım hizmet
 * seviyesi) silinmez; "Hizmete Özgü Özel Hükümler" maddesi olarak bu
 * iskeletin içine yerleştirilir. Tüketici / tacir ayrımı müşteri
 * kaydından (VKN, vergi dairesi, unvan) belirlenir ve tüketiciye özgü
 * hükümler (cayma, Ön Bilgilendirme Formu, tüketici hakem heyeti) buna
 * göre koşullu yazılır.
 */

export type ContractContext = {
  kind: PartyKind;
  contractNo: string;
  title: string;
  provider: Provider;
  customer: Customer;
  scopeItems: string[];
  proposalNo: string | null;
  startDate: string | null;
  dueDate: string | null;
  createdAt: string | null;
  signedAt: string | null;
  currency: string;
  tax: TaxBreakdown;
  schedule: ScheduleRow[];
  /** Ara teslim takvimi (crm_contracts.work_plan); boşsa 4.3 eski metinle kalır. */
  workPlan: WorkPlanItem[];
  specialClauses: ContractClause[];
  earlyStart: boolean | null;
  city: string | null;
  /** Gösterilecek yasal metin sürümü (imzalıysa onaylanan sürüm). */
  textVersion: LegalTextVersion;
  /**
   * Şablon kipi: veriye bağlı her yer yer tutucu ({musteri}, {madde:odeme} …)
   * olarak yazılır. Yalnızca Ayarlar → Belge metinleri'nin başlangıç
   * metnini üretmek için; belge çizerken hiç açık değil.
   */
  sablon?: boolean;
};

const commonTitles = new Set(
  arvoOSGeneralTemplate.clauses.map((clause) => clause.title).filter((title) => akademikMerkezTemplate.clauses.some((clause) => clause.title === title)),
);

/** Şablonun genel hükümler dışında kalan, hizmete özgü maddeleri. */
export function specialClausesFor(template: ContractTemplate) {
  return template.clauses.filter((clause) => !commonTitles.has(clause.title));
}

/*
  "blok": veriden çizilen parça (taraf kartları, ödeme tablosu …). Adı,
  kurumun metninde [[ad]] olarak geçer; şablon kipinde metne o işaret
  yazılır. Eskiden "node" adıyla adsızdı.
*/
type Block = { t: "p"; c: ReactNode } | { t: "ul"; items: ReactNode[] } | { t: "blok"; ad: string; c: ReactNode } | { t: "h"; c: ReactNode };
type Article = { key: string; title: string; blocks: Block[] };

const P = (c: ReactNode): Block => ({ t: "p", c });
const UL = (...items: ReactNode[]): Block => ({ t: "ul", items });
const BLOK = (ad: string, c: ReactNode = null): Block => ({ t: "blok", ad, c });
const H = (c: ReactNode): Block => ({ t: "h", c });

/** Silinemeyen maddeler: sözleşmenin kurulması ve tüketici korumaları bunlara dayanıyor. */
export const ZORUNLU_MADDELER = ["parties", "payment", "withdrawal", "evidence", "effect"] as const;
/*
  MADDEYE ATIF YAPAN MADDELER (hedef → atfeden).

  Maddeler birbirine NUMARAYLA atıf yapıyor: numarayı `no(anahtar)`
  veriyor ve o da `keys.indexOf(anahtar) + 1`. Anahtar listede yoksa
  indexOf -1 döner, yani numara SIFIR çıkar. Kurum bir maddeyi
  "Çıkar" ile kaldırdığında ona atıf yapan cümle müşteriye giden
  sözleşmede şöyle yazılıyordu:

    "Gizli Bilgi: 0. maddede tanımlanan bilgi ve belgeler."
    "…değişikliklerin 0. madde uyarınca bildirileceğini kabul eder."

  Zorunlu maddeler (parties, payment, withdrawal) zaten kaldırılamıyor;
  tablo yalnızca KALDIRILABİLEN hedefleri tutuyor. Yeni bir atıf
  eklendiğinde buraya da yazılır — tests/unit/madde-atiflari.test.ts
  kaynaktaki `no("…")` çağrılarını tarayıp bunu sabitliyor.
*/
export const MADDE_ATIFLARI: Record<string, readonly string[]> = {
  scope: ["definitions"],
  confidentiality: ["definitions"],
  notices: ["parties", "definitions"],
  termination: ["payment"],
};
/** Yürürlük maddesi her zaman sonda (madde sayısını o söylüyor). */
export const SON_MADDE = "effect";

function articleKeys(ctx: ContractContext) {
  return [
    "parties", "definitions", "scope", "term", "duties",
    ...(ctx.specialClauses.length ? ["special"] : []),
    "payment", "withdrawal", "confidentiality", "privacy", "ip", "force", "termination", "liability", "notices", "evidence", "disputes", "effect",
  ];
}

export function contractArticleCount(ctx: ContractContext, kurum?: unknown) {
  return etkinSira(articleKeys(ctx), kurumMetniCoz(kurum), ZORUNLU_MADDELER, SON_MADDE).length;
}

/*
  VERİYE BAĞLI CÜMLELER. Arvo'nun maddesi de, kurumun yer tutucusu da
  ({baslangic_cumlesi} …) aynı yardımcıdan okur: değiştirilmemiş madde
  eskisiyle birebir aynı çıkar, kurum da cümleyi elle yazmadan kullanır.
  Şablon kipinde her biri kendi yer tutucusunu döndürür.
*/
const S = (ctx: ContractContext, yerTutucu: string, deger: () => string) => (ctx.sablon ? `{${yerTutucu}}` : deger());
const teklifNumarali = (ctx: ContractContext) => S(ctx, "teklif_no_numarali", () => (ctx.proposalNo ? `${ctx.proposalNo} numaralı ` : ""));
const yetkiliMahkeme = (ctx: ContractContext) => S(ctx, "yetkili_mahkeme", () => (ctx.city ? `${ctx.city} Mahkemeleri ve İcra Daireleri` : "Hizmet Sağlayıcı’nın merkezinin bulunduğu yer mahkemeleri ve icra daireleri"));
const baslangicCumlesi = (ctx: ContractContext) => S(ctx, "baslangic_cumlesi", () => (ctx.startDate
  ? `Hizmet’e ${formatDate(ctx.startDate)} tarihinde başlanması planlanmıştır.`
  : "Hizmet’e, Sözleşme’nin kurulmasını ve varsa ön ödemenin Hizmet Sağlayıcı’nın hesabına geçmesini müteakip başlanır."));
const teslimCumlesi = (ctx: ContractContext) => S(ctx, "teslim_cumlesi", () => (ctx.dueDate ? `Hizmet’in teslim tarihi ${formatDate(ctx.dueDate)} olarak belirlenmiştir.` : "Teslim tarihi, Teklif’te belirtilen takvime göre belirlenir."));
const isPlaniCumlesi = (ctx: ContractContext) => S(ctx, "is_plani_cumlesi", () => (ctx.workPlan.length
  ? "Ara teslimler ve iş planı aşağıdaki takvimde gösterilmiştir. Takvimde yapılacak değişiklikler Taraflar’ın yazılı veya doğrulanabilir elektronik mutabakatıyla (ek protokol) geçerli olur."
  : "Ara teslimler ve iş planı Taraflar’ın yazılı mutabakatıyla belirlenebilir."));
const bedelCumlesi = (ctx: ContractContext) => S(ctx, "bedel_cumlesi", () => {
  const { tax } = ctx;
  const money = (value: number) => formatMoney(value, ctx.currency);
  return tax.status === "included" || tax.status === "excluded"
    ? `Sözleşme Bedeli; ${money(tax.net)} hizmet bedeli ile %${tax.rate.toLocaleString("tr-TR")} oranında ${money(tax.tax)} katma değer vergisinden (“KDV”) oluşan toplam ${money(tax.gross)} (${amountInWords(tax.gross, ctx.currency)}) tutarındadır. ${tax.status === "included" ? "Teklif’te fiyat KDV dahil olarak belirlenmiştir." : "Teklif’te fiyat KDV hariç olarak belirlenmiş olup KDV, 3065 sayılı Katma Değer Vergisi Kanunu uyarınca ayrıca hesaplanmıştır."}`
    : tax.status === "exempt"
      ? `Sözleşme Bedeli ${money(tax.gross)} (${amountInWords(tax.gross, ctx.currency)}) tutarındadır. Hizmet’e KDV istisnası uygulanmakta olup istisnanın yasal dayanağı faturada gösterilir.`
      : `Sözleşme Bedeli ${money(tax.gross)} (${amountInWords(tax.gross, ctx.currency)}) tutarındadır. Bedele ilişkin KDV ve diğer vergiler ilgili mevzuata göre faturada gösterilir.`;
});
const bankaHesabi = (ctx: ContractContext) => (ctx.textVersion !== "3.0" && ctx.provider.iban ? ctx.provider : null);
const havaleKosulu = (ctx: ContractContext, no: (key: string) => number | string) => S(ctx, "havale_kosulu", () => (bankaHesabi(ctx)
  ? `Ödemeler yalnızca aşağıda bilgileri gösterilen, ${ctx.provider.accountHolder || ctx.provider.name} adına kayıtlı banka hesabına yapılır. Ödeme açıklamasına ${ctx.contractNo} sözleşme numarası yazılır; hesap bilgileri faturada da gösterilir.`
  : `Ödemeler yalnızca ${ctx.provider.name} unvanına kayıtlı banka hesabına yapılır. Hesap bilgileri (IBAN) faturada ve Hizmet Sağlayıcı’nın ${no("parties")}. maddedeki kayıtlı iletişim kanalları üzerinden yazılı olarak bildirilir. Ödeme açıklamasına ${ctx.contractNo} sözleşme numarası yazılır.`));
const veriSorumlusuIletisim = (ctx: ContractContext) => S(ctx, "veri_sorumlusu_iletisim", () => `${ctx.provider.email ? `, e-posta: ${ctx.provider.email}` : ""}${ctx.provider.phone ? `, telefon: ${ctx.provider.phone}` : ""}`);
const erkenBaslamaCumlesi = (ctx: ContractContext) => S(ctx, "erken_baslama_cumlesi", () => (ctx.earlyStart === true
  ? "Müşteri, elektronik onay sırasında Hizmet’e cayma süresi dolmadan başlanmasını ayrı bir onay kutusuyla açıkça talep etmiş ve bu durumda ifasına başlanan hizmet bakımından cayma hakkını kullanamayacağı hususunda bilgilendirildiğini beyan etmiştir."
  : ctx.earlyStart === false
    ? "Müşteri, elektronik onay sırasında cayma süresi içinde ifaya başlanmasını talep etmemiştir; Hizmet’e, Müşteri ayrıca yazılı olarak talep etmedikçe cayma süresinin sona ermesinden sonra başlanır."
    : "Cayma süresi içinde ifaya başlanmasına ilişkin talep, elektronik onay ekranında isteğe bağlı ayrı bir onay kutusu ile alınır; bu kutunun işaretlenmemesi Sözleşme’nin kurulmasına engel değildir."));
const bildirimAdresleri = (ctx: ContractContext) => S(ctx, "bildirim_adresleri", () => {
  const parcalar = [
    ctx.provider.address ? `bildirim adresi: ${ctx.provider.address.replace(/\s*\n+\s*/g, ", ")}` : null,
    ctx.provider.email ? `elektronik posta adresi: ${ctx.provider.email}` : null,
  ].filter(Boolean);
  return ctx.textVersion !== "3.0" && parcalar.length ? `Hizmet Sağlayıcı’nın ${parcalar.join("; ")}.` : "";
});
const kurulusCumlesi = (ctx: ContractContext) => S(ctx, "kurulus_cumlesi", () => (ctx.signedAt
  ? `Sözleşme, Müşteri tarafından ${formatDateTime(ctx.signedAt)} tarihinde Elektronik Belge Sistemi üzerinden okunup elektronik olarak onaylanmak suretiyle kurulmuş ve aynı tarihte yürürlüğe girmiştir.`
  : "Sözleşme, Müşteri’nin Elektronik Belge Sistemi üzerinden elektronik onayını tamamladığı tarihte kurulur ve yürürlüğe girer. Onayın tarihi, saati ve işlem kayıtları imza bölümünde gösterilir."));
const duzenlemeTarihi = (ctx: ContractContext) => S(ctx, "duzenleme_tarihi", () => formatDate(ctx.createdAt));

/** Kurumun metninde kullanılabilecek yer tutucular (Ayarlar'daki yardım listesi de buradan). */
export const SOZLESME_YER_TUTUCULARI: { ad: string; aciklama: string }[] = [
  { ad: "hizmet_saglayici", aciklama: "Kurumun unvanı" },
  { ad: "musteri", aciklama: "Müşterinin adı / unvanı" },
  { ad: "sozlesme_no", aciklama: "Sözleşme numarası" },
  { ad: "hizmet_adi", aciklama: "Sözleşmenin başlığı (hizmet)" },
  { ad: "teklif_no", aciklama: "Dayandığı teklifin numarası (yoksa boş)" },
  { ad: "teklif_no_numarali", aciklama: "“TKF-… numaralı ” (teklif yoksa boş)" },
  { ad: "sozlesme_bedeli", aciklama: "Vergiler dahil toplam bedel" },
  { ad: "sozlesme_bedeli_yazi", aciklama: "Toplam bedelin yazıyla" },
  { ad: "hizmet_bedeli", aciklama: "KDV hariç hizmet bedeli" },
  { ad: "kdv_tutari", aciklama: "KDV tutarı" },
  { ad: "kdv_orani", aciklama: "KDV oranı (ör. %20)" },
  { ad: "baslangic_tarihi", aciklama: "Başlangıç tarihi (yoksa —)" },
  { ad: "teslim_tarihi", aciklama: "Teslim tarihi (yoksa —)" },
  { ad: "duzenleme_tarihi", aciklama: "Sözleşmenin düzenlenme tarihi" },
  { ad: "sehir", aciklama: "Kurumun ili" },
  { ad: "yetkili_mahkeme", aciklama: "“İstanbul Mahkemeleri ve İcra Daireleri”" },
  { ad: "madde_sayisi", aciklama: "Sözleşmenin madde sayısı" },
  { ad: "madde_sayisi_yazi", aciklama: "Madde sayısı yazıyla" },
  { ad: "hesap_sahibi", aciklama: "Banka hesabının sahibi" },
  { ad: "baslangic_cumlesi", aciklama: "Başlangıç cümlesi (tarih varsa tarihli)" },
  { ad: "teslim_cumlesi", aciklama: "Teslim cümlesi (tarih varsa tarihli)" },
  { ad: "is_plani_cumlesi", aciklama: "Ara teslim takvimine atıf cümlesi" },
  { ad: "bedel_cumlesi", aciklama: "KDV durumuna göre bedel cümlesi" },
  { ad: "havale_kosulu", aciklama: "Havale/EFT koşulu (IBAN girilmişse hesaplı)" },
  { ad: "veri_sorumlusu_iletisim", aciklama: "“, e-posta: …, telefon: …”" },
  { ad: "erken_baslama_cumlesi", aciklama: "Cayma süresinde başlama onayına göre cümle" },
  { ad: "bildirim_adresleri", aciklama: "Kurumun bildirim adresi cümlesi" },
  { ad: "kurulus_cumlesi", aciklama: "İmza tarihine göre kuruluş cümlesi" },
];

/** [[blok]] adları: veriden çizilen, kurumun yazmadığı parçalar. */
export const SOZLESME_BLOKLARI: { ad: string; aciklama: string }[] = [
  { ad: "taraflar", aciklama: "Hizmet sağlayıcı ve müşteri kartları" },
  { ad: "kapsam", aciklama: "Hizmet kapsamı listesi" },
  { ad: "is_plani", aciklama: "Ara teslim takvimi (varsa)" },
  { ad: "kdv_toplami", aciklama: "Ara toplam, KDV, genel toplam" },
  { ad: "odeme_plani", aciklama: "Ödeme planı tablosu" },
  { ad: "banka_hesabi", aciklama: "Banka hesabı kutusu (IBAN girilmişse)" },
];

/** Kurumun metni bir maddeden zorunlu bloğu çıkarsa da veri belgede kalsın. */
const ZORUNLU_BLOKLAR: Record<string, string[]> = { parties: ["taraflar"], payment: ["odeme_plani"] };

function buildArticles(ctx: ContractContext, keys: string[] = articleKeys(ctx)): Record<string, Article> {
  const sablon = Boolean(ctx.sablon);
  const no = (key: string): number | string => (sablon ? `{madde:${key}}` : keys.indexOf(key) + 1);
  const consumer = ctx.kind === "consumer";
  const sp = sablon ? "{hizmet_saglayici}" : ctx.provider.name;
  const { tax } = ctx;
  const court = yetkiliMahkeme(ctx);
  const count = sablon ? "{madde_sayisi}" : keys.length;
  const countWords = sablon ? "{madde_sayisi_yazi}" : numberToTurkishWords(keys.length);
  const letters = "abcçdefgğhıijklmnoöprsştuüvyz";
  const v30 = ctx.textVersion === "3.0";
  const bank = bankaHesabi(ctx);

  const articles: Record<string, Article> = {
    parties: {
      key: "parties", title: "Taraflar", blocks: [
        P("İşbu Hizmet Sözleşmesi (“Sözleşme”), aşağıda bilgileri yer alan taraflar arasında, aşağıdaki hüküm ve koşullar dahilinde elektronik ortamda akdedilmiştir."),
        BLOK("taraflar", <TaraflarBlogu ctx={ctx} />),
        P("Hizmet Sağlayıcı ve Müşteri, Sözleşme’de birlikte “Taraflar”, ayrı ayrı “Taraf” olarak anılacaktır."),
        P(`Taraflar, işbu maddede gösterilen adres ve elektronik posta adreslerinin Sözleşme’den doğan her türlü bildirim bakımından geçerli iletişim adresleri olduğunu ve değişikliklerin ${no("notices")}. madde uyarınca bildirileceğini kabul eder.`),
        P(consumer
          ? "Müşteri, işbu Sözleşme’yi ticari veya mesleki olmayan amaçlarla akdeden gerçek kişi olarak 6502 sayılı Tüketicinin Korunması Hakkında Kanun (“TKHK”) anlamında tüketici sıfatıyla hareket etmektedir. Tüketici mevzuatının emredici hükümleri saklıdır ve Sözleşme bu hükümlere aykırı şekilde yorumlanamaz."
          : "Müşteri, işbu Sözleşme’yi ticari veya mesleki faaliyeti kapsamında akdettiğini ve Sözleşme’yi kendi adına veya temsil ettiği tüzel kişi adına onaylamaya yetkili olduğunu beyan eder."),
      ],
    },
    definitions: {
      key: "definitions", title: "Tanımlar", blocks: [
        P("Sözleşme’de geçen aşağıdaki terimler, karşılarında gösterilen anlamları taşır:"),
        UL(
          <><b>Sözleşme:</b> İşbu Hizmet Sözleşmesi, ekleri ve ayrılmaz parçası olan {teklifNumarali(ctx)}Teklif.</>,
          <><b>Hizmet:</b> {no("scope")}. maddede konusu ve kapsamı belirtilen, Hizmet Sağlayıcı tarafından Müşteri’ye sunulacak hizmet, çalışma ve teslimlerin tümü.</>,
          <><b>Teklif:</b> Müşteri’nin kabul ettiği; Hizmet’in kapsamını, bedelini ve ticari koşullarını gösteren belge.</>,
          <><b>Sözleşme Bedeli:</b> {no("payment")}. maddede belirtilen, vergiler dahil toplam hizmet bedeli.</>,
          <><b>Gizli Bilgi:</b> {no("confidentiality")}. maddede tanımlanan bilgi ve belgeler.</>,
          <><b>Kişisel Veri:</b> 6698 sayılı Kişisel Verilerin Korunması Kanunu (“KVKK”) anlamında kimliği belirli veya belirlenebilir gerçek kişiye ilişkin her türlü bilgi.</>,
          <><b>Elektronik Belge Sistemi:</b> Sözleşme’nin görüntülendiği, elektronik onayın alındığı, belgenin PDF olarak indirilebildiği ve işlem kayıtlarının tutulduğu çevrim içi sistem.</>,
          <><b>Yazılı Bildirim:</b> {no("notices")}. maddede belirtilen yöntemlerle yapılan ve gönderildiği ispat edilebilen bildirim.</>,
          <><b>İş Günü:</b> Cumartesi, Pazar ve resmî tatil günleri dışında kalan günler.</>,
          ...(consumer ? [<><b>Kalıcı Veri Saklayıcısı:</b> Müşteri’nin gönderdiği veya kendisine gönderilen bilgiyi makul bir süre incelemesine elverecek şekilde kaydedilmesini ve değiştirilmeden kopyalanmasını sağlayan elektronik posta, PDF dosyası ve benzeri her türlü araç veya ortam.</>] : []),
        ),
      ],
    },
    scope: {
      key: "scope", title: "Sözleşmenin Konusu ve Kapsamı", blocks: [
        P(`İşbu Sözleşme’nin konusu, “${ctx.title}” hizmetinin Hizmet Sağlayıcı tarafından Sözleşme ve Teklif’te belirtilen kapsam ve koşullarla ifası ile Sözleşme Bedeli’nin Müşteri tarafından ödenmesine ilişkin Taraflar’ın karşılıklı hak ve yükümlülüklerinin 6098 sayılı Türk Borçlar Kanunu (“TBK”)${consumer ? ", TKHK ve Mesafeli Sözleşmeler Yönetmeliği (“Yönetmelik”)" : ""} ve ilgili mevzuat çerçevesinde düzenlenmesidir.`),
        P("Hizmet kapsamı aşağıdaki kalemlerden oluşur:"),
        sablon ? BLOK("kapsam") : UL(...ctx.scopeItems),
        P("Kapsamda açıkça yer almayan iş, ek teslim, ek revizyon veya değişiklik talepleri kapsam dışıdır. Bu talepler, Taraflar’ın yazılı mutabakatıyla belirlenecek ek süre ve ek bedel karşılığında yerine getirilir."),
        P(`${teklifNumarali(ctx)}Teklif, Sözleşme’nin eki ve ayrılmaz parçasıdır. Sözleşme ile Teklif arasında çelişki bulunması halinde, emredici hükümler saklı kalmak kaydıyla Sözleşme hükümleri uygulanır.`),
        P("Sözleşme’de hüküm bulunmayan hallerde, Hizmet’in hukuki niteliğine göre TBK’nın eser sözleşmesine (m.470 vd.) veya vekâlet sözleşmesine (m.502 vd.) ilişkin hükümleri uygulanır."),
      ],
    },
    term: {
      key: "term", title: "Hizmet Süresi, Teslim ve Termin", blocks: [
        P("Sözleşme, Müşteri’nin elektronik onayı ile kurulur ve Hizmet’in eksiksiz ifası ile Taraflar’ın Sözleşme’den doğan tüm edimlerini yerine getirmesine kadar yürürlükte kalır."),
        P(`${baslangicCumlesi(ctx)}${consumer ? ` Cayma süresi içinde ifaya başlanması, ${no("withdrawal")}. madde uyarınca Müşteri’nin açık talebine bağlıdır.` : ""}`),
        P(`${teslimCumlesi(ctx)} ${isPlaniCumlesi(ctx)}`),
        ...(ctx.workPlan.length || sablon ? [BLOK("is_plani", ctx.workPlan.length ? <WorkPlanTable items={ctx.workPlan} /> : null)] : []),
        P("Müşteri’den kaynaklanan gecikmeler (bilgi, belge, erişim, onay veya ödeme gecikmeleri dahil) ile mücbir sebep halleri, teslim süresini gecikme süresi kadar uzatır. Hizmet Sağlayıcı bu durumu Müşteri’ye makul süre içinde bildirir."),
        P(consumer
          ? "Teslim; Elektronik Belge Sistemi, elektronik posta veya Taraflar’ca kararlaştırılan başka bir kanal üzerinden yapılır. Müşteri, teslim edilen hizmetteki eksiklik ve ayıpları Hizmet Sağlayıcı’ya bildirebilir; ayıplı hizmete ilişkin TKHK m.13 ve m.15’te düzenlenen seçimlik haklar ile m.16’daki zamanaşımı hükümleri saklıdır ve bu madde Müşteri’nin kanuni haklarını sınırlandırmaz."
          : "Teslim; Elektronik Belge Sistemi, elektronik posta veya Taraflar’ca kararlaştırılan başka bir kanal üzerinden yapılır ve bildirim tarihinde gerçekleşmiş sayılır. Müşteri, teslimi en geç 7 (yedi) gün içinde inceleyerek kapsamla çelişen somut eksiklikleri yazılı olarak bildirir; bu süre içinde bildirimde bulunulmaması halinde teslim, açıkça görülebilen eksiklikler bakımından kabul edilmiş sayılır. Gizli ayıplara ilişkin kanuni haklar saklıdır."),
        P("Hizmet Sağlayıcı’nın kendisinden kaynaklanan sebeplerle teslim tarihini aşması halinde Müşteri, TBK m.123 uyarınca uygun bir süre vererek ifayı talep edebilir; bu süre içinde de ifa edilmemesi halinde TBK m.125’teki seçimlik haklarını kullanabilir."),
      ],
    },
    duties: {
      key: "duties", title: "Tarafların Hak ve Yükümlülükleri", blocks: [
        P("Hizmet Sağlayıcı; Hizmet’i Sözleşme’ye, Teklif’e, işin gereklerine, mesleki özen yükümlülüğüne ve 4721 sayılı Türk Medeni Kanunu m.2’de ifadesini bulan dürüstlük kuralına uygun olarak ifa etmeyi taahhüt eder."),
        P("Hizmet Sağlayıcı, Hizmet’in ifasında çalışanlarından ve yardımcı kişilerden yararlanabilir; bu kişilerin Sözleşme kapsamındaki fiillerinden TBK m.116 uyarınca kendi fiili gibi sorumludur."),
        P("Hizmet Sağlayıcı, Hizmet’in ilerleyişi hakkında Müşteri’yi makul aralıklarla bilgilendirir ve Müşteri’nin Hizmet’e ilişkin makul sorularını yanıtlar."),
        P(`Müşteri; Hizmet için gerekli bilgi, belge, içerik, erişim ve onayları doğru, eksiksiz ve zamanında sağlamayı ve Sözleşme Bedeli’ni ${no("payment")}. maddede belirtilen vade ve koşullarla ödemeyi taahhüt eder.`),
        P("Müşteri, Hizmet Sağlayıcı’ya sağladığı içerik ve talimatların hukuka ve üçüncü kişi haklarına (fikri mülkiyet hakları, kişilik hakları ve kişisel veriler dahil) uygun olduğunu ve bunlara ilişkin gerekli izin ve yetkilere sahip olduğunu beyan eder. Bu beyana aykırılıktan doğan üçüncü kişi taleplerinden Müşteri sorumludur."),
        P("Taraflar, Sözleşme’den doğan hak ve alacaklarını karşı Taraf’ın yazılı onayı olmaksızın üçüncü kişilere devredemez. Sözleşme’de yapılacak değişiklikler ancak Taraflar’ın yazılı veya doğrulanabilir elektronik mutabakatıyla geçerli olur."),
      ],
    },
    special: {
      key: "special", title: "Hizmete Özgü Özel Hükümler", blocks: [
        P(`Hizmet’in niteliği gereği aşağıdaki özel hükümler de uygulanır. Bu hükümler ile Sözleşme’nin genel hükümleri arasında çelişki bulunması halinde özel hükümler${consumer ? ", tüketici mevzuatının emredici hükümleri saklı kalmak kaydıyla," : ""} öncelikle uygulanır.`),
        ...ctx.specialClauses.flatMap((clause, index) => [H(`${letters[index] ?? index + 1}) ${clause.title}`), ...clause.paragraphs.map((paragraph) => P(paragraph))]),
      ],
    },
    payment: {
      key: "payment", title: "Ücret ve Ödeme Koşulları", blocks: [
        P(bedelCumlesi(ctx)),
        BLOK("kdv_toplami", <TaxTotals tax={tax} currency={ctx.currency} />),
        P("Sözleşme Bedeli aşağıdaki ödeme planına göre ödenir. Vade tarihi belirtilmeyen ödemeler, “Vade / Koşul” sütununda belirtilen olayın gerçekleşmesiyle muaccel olur:"),
        BLOK("odeme_plani", <PaymentPlanTable rows={ctx.schedule} currency={ctx.currency} />),
        P("Ödemeler aşağıdaki yöntemlerle yapılabilir:"),
        UL(
          <><b>Banka havalesi / EFT:</b> {havaleKosulu(ctx, no)}</>,
          <><b>Kredi kartı / banka kartı:</b> Hizmet Sağlayıcı’nın ilettiği güvenli ödeme bağlantısı üzerinden, 6493 sayılı Kanun kapsamında faaliyet gösteren yetkili ödeme kuruluşu veya banka altyapısı aracılığıyla ödeme yapılabilir. Kart bilgileri Hizmet Sağlayıcı tarafından görülmez ve saklanmaz; taksitlendirme ve buna bağlı maliyetler ilgili bankanın koşullarına tabidir.</>,
        ),
        ...(bank || sablon ? [BLOK("banka_hesabi", bank ? <BankAccountBox provider={bank} /> : null)] : []),
        P(`Hesap bilgisi değişikliğine ilişkin bildirimler, Hizmet Sağlayıcı’nın ${no("parties")}. maddede yer alan kayıtlı iletişim bilgileri üzerinden teyit edilmedikçe geçerli değildir. Müşteri, ödeme öncesinde alıcı hesabın ${sp} adına kayıtlı olduğunu kontrol etmekle yükümlüdür; üçüncü kişiler adına açılmış hesaplara yapılan ödemeler Hizmet Sağlayıcı’ya karşı ifa sonucunu doğurmaz.`),
        P(`Hizmet Sağlayıcı, her ödeme veya hizmet ifası için 213 sayılı Vergi Usul Kanunu (“VUK”) ve ilgili mevzuat uyarınca fatura (e-Fatura veya e-Arşiv Fatura) düzenler ve Müşteri’nin ${no("parties")}. maddedeki elektronik posta adresine iletir.${consumer ? "" : " Müşteri, faturanın içeriğine 6102 sayılı Türk Ticaret Kanunu (“TTK”) m.21/2 uyarınca faturayı aldığı tarihten itibaren 8 (sekiz) gün içinde itiraz edebilir."}`),
        P("Vadesi belirli bir günde kararlaştırılan ödemelerde Müşteri, bu günün geçmesiyle ihtara gerek kalmaksızın temerrüde düşer (TBK m.117/2). Vadesi bir olaya bağlanan ödemelerde temerrüt, olayın gerçekleştiğinin Müşteri’ye Yazılı Bildirimi ve ödemeye çağrılmasıyla gerçekleşir (TBK m.117/1)."),
        P(consumer
          ? "Temerrüt halinde Müşteri’den, ödenmeyen tutar için temerrüt tarihinden itibaren yalnızca 3095 sayılı Kanuni Faiz ve Temerrüt Faizine İlişkin Kanun uyarınca belirlenen kanuni faiz oranında temerrüt faizi talep edilebilir (TBK m.88 ve m.120). Müşteri’ye cezai şart, gecikme ücreti veya kanunun izin verdiği sınırları aşan başka bir yükümlülük yüklenmez; TKHK m.5’te düzenlenen haksız şart yasağı saklıdır."
          : "Temerrüt halinde Müşteri, ödenmeyen tutara temerrüt tarihinden itibaren 3095 sayılı Kanuni Faiz ve Temerrüt Faizine İlişkin Kanun m.2/2 uyarınca Türkiye Cumhuriyet Merkez Bankası’nın kısa vadeli avans işlemlerine uyguladığı faiz oranında temerrüt faizi öder (TBK m.120). Ticari işlerde mal ve hizmet tedarikinde geç ödemeye ilişkin TTK m.1530 hükümleri saklıdır."),
        P(`Temerrüdün devamı süresince Hizmet Sağlayıcı, TBK m.97 uyarınca kendi edimini ifadan kaçınabilir ve Yazılı Bildirim ile Hizmet’i askıya alabilir; askı süresi teslim süresine eklenir. Temerrüdün Yazılı Bildirim tarihinden itibaren 15 (on beş) gün içinde giderilmemesi halinde Hizmet Sağlayıcı’nın ${no("termination")}. madde uyarınca fesih hakkı saklıdır.`),
        P(`${consumer ? `Cayma hakkının kullanılması halinde iade, ${no("withdrawal")}. madde ve Yönetmelik m.13 uyarınca yapılır. ` : ""}Sözleşme’nin herhangi bir sebeple sona ermesi halinde Hizmet Sağlayıcı, sona erme tarihine kadar usulüne uygun olarak ifa ettiği hizmetlerin karşılığı ile belgelendirilmiş zorunlu masrafları mahsup ederek bakiye tutarı, sona erme tarihinden itibaren en geç 14 (on dört) gün içinde Müşteri’nin ödemede kullandığı yöntemle veya Müşteri’nin bildireceği kendi adına kayıtlı banka hesabına iade eder. Kartla yapılan ödemelerde iadenin karta yansıma süresi ilgili bankanın uygulamasına tabidir.`),
        P("Sözleşme Bedeli Sözleşme süresince sabittir. Kapsam değişikliği veya ek hizmetlerin bedeli Taraflar’ın yazılı mutabakatıyla ayrıca belirlenir. Sözleşme’den doğabilecek vergi, resim ve harçlar, ilgili mevzuata göre ödemekle yükümlü olan Tarafça karşılanır."),
      ],
    },
    withdrawal: consumer ? {
      key: "withdrawal", title: "Cayma Hakkı", blocks: [
        P("Müşteri, TKHK m.48 ve Yönetmelik m.9 uyarınca, Sözleşme’nin kurulduğu günden itibaren 14 (on dört) gün içinde herhangi bir gerekçe göstermeksizin ve cezai şart ödemeksizin Sözleşme’den cayma hakkına sahiptir."),
        P(`Cayma hakkının kullanıldığına ilişkin bildirimin bu süre içinde Hizmet Sağlayıcı’nın ${no("parties")}. maddede yer alan elektronik posta adresine veya adresine yazılı olarak ya da kalıcı veri saklayıcısı ile yöneltilmesi yeterlidir (Yönetmelik m.11). Müşteri, cayma bildirimi için Ek-1 Ön Bilgilendirme Formu’ndaki iletişim bilgilerini kullanabilir.`),
        P("Hizmet Sağlayıcı, cayma bildiriminin kendisine ulaştığı tarihten itibaren 14 (on dört) gün içinde tahsil ettiği tüm ödemeleri, Müşteri’nin ödemede kullandığı araca uygun şekilde ve Müşteri’ye herhangi bir masraf veya yükümlülük getirmeksizin tek seferde iade eder (Yönetmelik m.13)."),
        P("Yönetmelik m.15/1-(ğ) uyarınca, cayma hakkı süresi sona ermeden önce Müşteri’nin onayı ile ifasına başlanan hizmetlere ilişkin sözleşmelerde cayma hakkı kullanılamaz. Hizmet Sağlayıcı, Müşteri’nin açık talebi ve bu sonuç hakkında bilgilendirildiğine ilişkin onayı olmaksızın cayma süresi dolmadan Hizmet’in ifasına başlamaz."),
        P(erkenBaslamaCumlesi(ctx)),
      ],
    } : {
      key: "withdrawal", title: "Cayma Hakkı", blocks: [
        P("Müşteri, işbu Sözleşme’yi ticari veya mesleki faaliyeti kapsamında akdettiğinden, TKHK ve Mesafeli Sözleşmeler Yönetmeliği’nde düzenlenen cayma hakkı ile tüketiciye özgü diğer hükümler Sözleşme’ye uygulanmaz."),
        P("Müşteri’nin işlem bakımından tüketici sıfatını taşıdığının anlaşılması halinde, tüketici mevzuatının emredici hükümleri kendiliğinden uygulanır ve Sözleşme’nin bu hükümlere aykırı düzenlemeleri Müşteri aleyhine uygulanmaz."),
      ],
    },
    confidentiality: {
      key: "confidentiality", title: "Gizlilik", blocks: [
        P("“Gizli Bilgi”; Sözleşme’nin müzakeresi, kurulması ve ifası sırasında Taraflardan birinin (“Açıklayan Taraf”) diğerine (“Alan Taraf”) yazılı, sözlü, elektronik veya başka herhangi bir yolla açıkladığı ya da Alan Taraf’ın öğrendiği ticari sırlar, fiyat ve teklif bilgileri, müşteri ve tedarikçi bilgileri, iş planları, yazılım ve kaynak kodları, tasarımlar, know-how, proje dokümanları, erişim bilgileri, kişisel veriler ve niteliği gereği gizli olduğu anlaşılan diğer tüm bilgi ve belgelerdir. Sözleşme’nin içeriği ve Sözleşme Bedeli de Gizli Bilgi niteliğindedir."),
        P("Taraflar karşılıklı olarak; Gizli Bilgi’yi yalnızca Sözleşme’nin ifası amacıyla kullanmayı, Açıklayan Taraf’ın önceden yazılı onayı olmaksızın üçüncü kişilere açıklamamayı ve çoğaltmamayı, kendi gizli bilgilerine gösterdikleri özenden az olmamak üzere her halde makul özeni göstererek korumayı taahhüt eder."),
        P("Gizli Bilgi, yalnızca Sözleşme’nin ifası için bilmesi gereken çalışanlar, yardımcı kişiler, danışmanlar ve alt yüklenicilerle; bunların en az işbu madde kadar koruyucu bir gizlilik yükümlülüğü altında bulunması koşuluyla paylaşılabilir. Alan Taraf, bu kişilerin gizlilik ihlalinden kendi fiili gibi sorumludur."),
        P("Aşağıdaki bilgiler Gizli Bilgi sayılmaz:"),
        UL(
          "Alan Taraf’ın ihlali olmaksızın kamuya açık hale gelmiş veya gelecek bilgiler,",
          "Açıklamadan önce Alan Taraf’ça hukuka uygun olarak bilindiği belgelenebilen bilgiler,",
          "Gizlilik yükümlülüğü bulunmayan üçüncü kişilerden hukuka uygun olarak elde edilen bilgiler,",
          "Alan Taraf’ça Gizli Bilgi’den yararlanılmaksızın bağımsız olarak geliştirilen bilgiler.",
        ),
        P("Kanun, mahkeme kararı veya yetkili idari makam talebi uyarınca yapılması zorunlu açıklamalar işbu madde kapsamında ihlal sayılmaz. Bu halde Alan Taraf, hukuken mümkün olduğu ölçüde Açıklayan Taraf’ı açıklamadan önce bilgilendirir ve açıklamayı zorunlu olan asgari ölçüyle sınırlar."),
        P("Gizlilik yükümlülüğü Sözleşme süresince ve Sözleşme’nin herhangi bir sebeple sona ermesinden itibaren 5 (beş) yıl süreyle devam eder. Ticari sır ve kişisel veri niteliğindeki bilgiler bakımından yükümlülük, bu nitelik devam ettiği sürece sürer."),
        P("Sözleşme’nin sona ermesi veya Açıklayan Taraf’ın yazılı talebi üzerine Alan Taraf, kanuni saklama yükümlülükleri saklı kalmak kaydıyla Gizli Bilgi’yi iade eder veya geri döndürülemeyecek şekilde imha eder."),
        P("İşbu maddeye aykırılık halinde ihlal eden Taraf, karşı Taraf’ın uğradığı zararı TBK m.112 vd. hükümleri uyarınca tazmin eder. TTK’nın haksız rekabete ilişkin m.54 vd. hükümleri, özellikle iş sırlarının hukuka aykırı olarak kullanılması veya ifşasına ilişkin m.55 hükmü ile 5237 sayılı Türk Ceza Kanunu m.239 hükmü saklıdır."),
      ],
    },
    privacy: {
      key: "privacy", title: "Kişisel Verilerin Korunması", blocks: [
        P(`Hizmet Sağlayıcı, Sözleşme kapsamında işlenen kişisel veriler bakımından KVKK uyarınca veri sorumlusudur. Veri sorumlusu: ${sp}${veriSorumlusuIletisim(ctx)}.`),
        P("Sözleşme kapsamında Müşteri’ye ve Müşteri yetkililerine ait kimlik (ad soyad, T.C. kimlik veya vergi kimlik numarası), iletişim (adres, telefon, elektronik posta), müşteri işlem (teklif, sözleşme ve talep kayıtları), finans (ödeme, fatura ve banka bilgileri) ve işlem güvenliği (IP adresi, tarih-saat, cihaz ve tarayıcı bilgisi, elektronik imza görüntüsü, erişim kayıtları) kategorilerindeki kişisel veriler işlenir."),
        P("Kişisel veriler; Sözleşme’nin kurulması ve ifası (KVKK m.5/2-c), Hizmet Sağlayıcı’nın vergi, ticaret ve muhasebe mevzuatından doğan hukuki yükümlülüklerinin yerine getirilmesi (m.5/2-ç), bir hakkın tesisi, kullanılması veya korunması (m.5/2-e) ve ilgili kişinin temel hak ve özgürlüklerine zarar vermemek kaydıyla Hizmet Sağlayıcı’nın meşru menfaatleri (m.5/2-f) hukuki sebeplerine dayanılarak; hukuka ve dürüstlük kurallarına uygun, amaçla bağlantılı, sınırlı ve ölçülü şekilde işlenir (m.4). Açık rıza gerektiren işlemler için Sözleşme’den bağımsız olarak ayrıca açık rıza alınır."),
        P("Hizmet için zorunlu olmadıkça özel nitelikli kişisel veri işlenmez; işlenmesinin gerekmesi halinde KVKK m.6’da öngörülen şartlara uyulur."),
        P("Kişisel veriler, yukarıdaki amaçlarla sınırlı olarak barındırma, bulut, elektronik posta ve yazılım hizmeti sağlayıcılarına, ödeme kuruluşları ve bankalara, mali müşavir ve hukuk danışmanlarına ve kanunen yetkili kamu kurum ve kuruluşlarına KVKK m.8 ve m.9 hükümlerine uygun olarak aktarılabilir."),
        P("Kişisel veriler, ilgili mevzuatta öngörülen saklama süreleri (ör. VUK m.253 ve TTK m.82) ve olası uyuşmazlıklar bakımından kanuni zamanaşımı süreleri boyunca saklanır; sürenin sona ermesiyle KVKK m.7 uyarınca silinir, yok edilir veya anonim hale getirilir."),
        P(`İlgili kişi, KVKK m.11 uyarınca; kişisel verilerinin işlenip işlenmediğini öğrenme, işlenmişse buna ilişkin bilgi talep etme, işlenme amacını ve bunların amacına uygun kullanılıp kullanılmadığını öğrenme, yurt içinde veya yurt dışında aktarıldığı üçüncü kişileri bilme, eksik veya yanlış işlenmişse düzeltilmesini ve KVKK m.7 çerçevesinde silinmesini veya yok edilmesini isteme, bu işlemlerin aktarıldığı üçüncü kişilere bildirilmesini isteme, münhasıran otomatik sistemler vasıtasıyla analiz edilmesi suretiyle aleyhine bir sonucun ortaya çıkmasına itiraz etme ve kanuna aykırı işleme sebebiyle zarara uğraması halinde zararın giderilmesini talep etme haklarına sahiptir. Başvurular Hizmet Sağlayıcı’nın ${no("parties")}. maddedeki iletişim adreslerine ${v30 ? "yazılı olarak veya kayıtlı elektronik posta ile" : "yazılı olarak, Hizmet Sağlayıcı’ya önceden bildirilmiş ve kayıtlarında bulunan elektronik posta adresinden gönderilecek elektronik posta ile ya da ilgili mevzuatta öngörülen diğer yöntemlerle"} yapılabilir ve KVKK m.13 uyarınca en geç 30 (otuz) gün içinde sonuçlandırılır.`),
        P("İşbu madde, KVKK m.10 kapsamındaki aydınlatma yükümlülüğünün yerine getirilmesine ilişkin olup Hizmet Sağlayıcı’nın ayrıca yayımladığı aydınlatma metinleriyle birlikte değerlendirilir. Müşteri, Hizmet kapsamında Hizmet Sağlayıcı ile paylaştığı üçüncü kişilere ait kişisel veriler bakımından gerekli aydınlatmayı yaptığını ve işleme şartlarını sağladığını beyan eder."),
        P("Taraflar, KVKK m.12 uyarınca kişisel verilerin hukuka aykırı olarak işlenmesini ve erişilmesini önlemek ve muhafazasını sağlamak amacıyla uygun güvenlik düzeyini temin etmeye yönelik gerekli her türlü teknik ve idari tedbiri alır; veri ihlali halinde mevzuatta öngörülen bildirim yükümlülüklerine uyar."),
      ],
    },
    ip: {
      key: "ip", title: "Fikri ve Sınai Mülkiyet Hakları", blocks: [
        P("Taraflar’ın Sözleşme’den önce sahip oldukları veya Sözleşme’den bağımsız olarak geliştirdikleri eser, yazılım, yöntem, şablon, know-how, marka ve diğer fikri ve sınai mülkiyet hakları ilgili Tarafta kalır. Bu haklar 5846 sayılı Fikir ve Sanat Eserleri Kanunu (“FSEK”) ve 6769 sayılı Sınai Mülkiyet Kanunu kapsamında korunur."),
        P("Teklif’te veya özel hükümlerde aksi yazılı olarak kararlaştırılmadıkça, Sözleşme Bedeli’nin tamamen ödenmesi koşuluyla Müşteri, kendisine teslim edilen çıktıları Sözleşme’nin amacıyla sınırlı olarak, süresiz ve münhasır olmayan şekilde kullanma hakkını (FSEK m.48 anlamında basit ruhsat) kazanır."),
        P("Mali hakların devri veya münhasır ruhsat verilmesi, FSEK m.52 uyarınca yazılı olarak yapılır ve devredilen haklar (işleme, çoğaltma, yayma, temsil ve umuma iletim hakları) ayrı ayrı gösterilir. Bu şekilde açıkça devredilmeyen haklar Hizmet Sağlayıcı’da kalır."),
        P("Üçüncü kişilere ait yazılım, kütüphane, yazı tipi, görsel ve içerikler kendi lisans koşullarına tabidir. Müşteri’nin sağladığı içerik ve materyaller üzerindeki haklar Müşteri’de kalır; Müşteri bu materyallerin yalnızca Hizmet’in ifası amacıyla kullanılmasına izin verir."),
        ...(consumer ? [] : [P("Hizmet Sağlayıcı, Müşteri’nin önceden yazılı onayı bulunması ve Gizli Bilgi içermemesi kaydıyla, Müşteri’nin unvanını ve Hizmet’in genel niteliğini referans olarak gösterebilir.")]),
      ],
    },
    force: {
      key: "force", title: "Mücbir Sebep", blocks: [
        P("Doğal afet, salgın hastalık, savaş, seferberlik, terör, yangın, grev ve lokavt, yaygın enerji veya iletişim altyapısı kesintileri, siber saldırılar ve kamu otoritelerinin karar ve düzenlemeleri gibi Taraflar’ın makul kontrolü dışında gelişen, önceden öngörülemeyen ve önlenemeyen olaylar mücbir sebep sayılır."),
        P("Mücbir sebepten etkilenen Taraf, durumu ve öngörülen etkisini gecikmeksizin karşı Taraf’a bildirir ve zararın azaltılması için makul çabayı gösterir. Mücbir sebep süresince etkilenen edimler askıya alınır ve ifa süreleri bu süre kadar uzar. Mücbir sebep nedeniyle ifanın imkânsızlaşması halinde TBK m.136, ifanın aşırı ölçüde güçleşmesi halinde TBK m.138 hükümleri uygulanır."),
        P(`Mücbir sebebin 60 (altmış) günden fazla sürmesi halinde Taraflardan her biri Sözleşme’yi Yazılı Bildirimle feshedebilir. Bu halde fesih tarihine kadar ifa edilmiş hizmetlerin bedeli ödenir; ifa edilmeyen kısma ilişkin tahsil edilmiş bedeller ${no("payment")}. madde uyarınca iade edilir.`),
      ],
    },
    termination: {
      key: "termination", title: "Sözleşmenin Feshi ve Sona Ermesi", blocks: [
        P("Taraflardan birinin Sözleşme’den doğan esaslı bir yükümlülüğünü ihlal etmesi halinde diğer Taraf, TBK m.123 uyarınca ihlalin giderilmesi için en az 15 (on beş) günlük uygun bir süre vererek Yazılı Bildirimde bulunur. Süre içinde ihlalin giderilmemesi halinde bildirimde bulunan Taraf, TBK m.125’te düzenlenen seçimlik haklarını kullanarak Sözleşme’den dönebilir veya Sözleşme’yi feshedebilir. TBK m.124’te sayılan hallerde süre verilmesine gerek yoktur."),
        P("Aşağıdaki haller, karşı Taraf bakımından haklı fesih sebebi sayılır:"),
        UL(
          "Vadesi gelmiş bir ödemenin Yazılı Bildirime rağmen 15 (on beş) gün içinde yapılmaması,",
          "Gizlilik veya kişisel verilerin korunmasına ilişkin hükümlerin ağır ihlali,",
          "Hizmet’in hukuka veya ahlaka aykırı bir amaçla kullanılmasının talep edilmesi,",
          ...(consumer ? [] : ["Taraflardan birinin iflasına karar verilmesi, konkordato mühleti alması veya ödemelerini tatil etmesi."]),
        ),
        P("Sözleşme’nin sürekli edimli niteliği bulunan hallerde fesih, TBK m.126 uyarınca ileriye etkili sonuç doğurur."),
        P(`Fesih halinde, fesih tarihine kadar usulüne uygun olarak ifa edilen hizmetlerin bedeli ile belgelendirilmiş zorunlu masraflar Müşteri tarafından ödenir veya ödenmiş tutarlardan mahsup edilir. Fesih Hizmet Sağlayıcı’nın kusurundan kaynaklanıyorsa, ifa edilmeyen kısma ilişkin ödenmiş bedeller ${no("payment")}. maddedeki süre içinde iade edilir. Fesih Müşteri’nin kusurundan kaynaklanıyorsa Hizmet Sağlayıcı’nın kanundan doğan tazminat hakları saklıdır.`),
        P("Müşteri’nin, Hizmet’in hukuki niteliğine göre TBK m.484 (eser tamamlanmadan iş sahibinin sözleşmeden dönmesi) veya TBK m.512 (vekâlet sözleşmesinin tek taraflı sona erdirilmesi) uyarınca sahip olduğu haklar saklıdır; bu hallerde de ifa edilen kısmın bedeline ve kanunda öngörülen tazminata ilişkin hükümler uygulanır."),
        P("Gizlilik, kişisel verilerin korunması, fikri mülkiyet, sorumluluk, delil ve uyuşmazlıkların çözümüne ilişkin hükümler, niteliği gereği Sözleşme’nin sona ermesinden sonra da yürürlükte kalır."),
      ],
    },
    liability: {
      key: "liability", title: "Sorumluluğun Sınırlandırılması", blocks: [
        ...(consumer ? [
          P("Hizmet Sağlayıcı, Hizmet’in Sözleşme’ye uygun olarak ifasından ve TKHK kapsamında ayıplı hizmetten doğan zararlardan kanun hükümleri çerçevesinde sorumludur. İşbu madde, Müşteri’nin TKHK ve ilgili mevzuattan doğan haklarını hiçbir şekilde sınırlandırmaz."),
        ] : [
          P("Taraflar, Sözleşme’ye aykırılıktan doğan doğrudan zararlardan sorumludur. Hafif ihmal hallerinde Taraflar’ın dolaylı zararlardan (kâr kaybı, iş kaybı, itibar kaybı ve üçüncü kişilerin talepleri dahil) sorumluluğu bulunmaz."),
          P("Hizmet Sağlayıcı’nın Sözleşme kapsamındaki toplam sorumluluğu, hafif ihmal hallerinde Müşteri tarafından fiilen ödenmiş Sözleşme Bedeli ile sınırlıdır."),
        ]),
        P("TBK m.115 uyarınca kast ve ağır ihmal hallerinde ve Kanun’un sorumsuzluk anlaşmasını kesin olarak hükümsüz saydığı diğer hallerde (özellikle uzmanlık gerektiren bir meslek veya sanatın yürütülmesine ilişkin hizmetlerde hafif ihmal) hiçbir sorumluluk sınırlaması uygulanmaz. Hayat, vücut bütünlüğü ve sağlığa verilen zararlar ile kişisel verilerin korunmasına ilişkin kanuni sorumluluk da sınırlandırılamaz."),
        P("Müşteri’nin sağladığı bilgi, belge, içerik veya talimatların hatalı, eksik ya da hukuka aykırı olmasından ve Hizmet Sağlayıcı’nın kontrolü dışındaki üçüncü kişi hizmetlerinin (internet, barındırma, ödeme altyapısı ve benzerleri) kesintilerinden doğan sonuçlardan, Hizmet Sağlayıcı’nın kusuru bulunan haller saklı kalmak kaydıyla, Hizmet Sağlayıcı sorumlu tutulamaz."),
      ],
    },
    notices: {
      key: "notices", title: "Tebligat ve Bildirimler", blocks: [
        P(`Taraflar, ${no("parties")}. maddede belirtilen adres ve elektronik posta adreslerini Sözleşme’den doğan her türlü bildirim için geçerli adres olarak kabul eder. Adres değişiklikleri, değişiklikten itibaren 7 (yedi) gün içinde karşı Taraf’a Yazılı Bildirimle bildirilmedikçe eski adrese yapılan bildirimler geçerli sayılır.`),
        ...(sablon || bildirimAdresleri(ctx) ? [P(bildirimAdresleri(ctx))] : []),
        P("Günlük iletişim ve operasyonel bildirimler elektronik posta veya Elektronik Belge Sistemi üzerinden yapılabilir."),
        P(v30 ? (consumer
          ? "Temerrüt ve fesih gibi hukuki sonuç doğuran bildirimler; noter, iadeli taahhütlü posta, 7201 sayılı Tebligat Kanunu m.7/a kapsamında kayıtlı elektronik posta (KEP) veya karşı Taraf’ın elektronik posta adresine gönderilen ve gönderim kaydı saklanan elektronik posta ile yapılır. Müşteri’nin cayma bildirimine ilişkin Yönetmelik hükümleri saklıdır."
          : "Taraflar tacir olduğu ölçüde, temerrüde düşürmeye, fesih ve sözleşmeden dönmeye ilişkin ihbar ve ihtarlar TTK m.18/3 uyarınca noter aracılığıyla, taahhütlü mektupla, telgrafla veya güvenli elektronik imza kullanılarak kayıtlı elektronik posta (KEP) sistemiyle yapılır. Diğer hukuki bildirimler, karşı Taraf’ın elektronik posta adresine gönderilen ve gönderim kaydı saklanan elektronik posta ile de yapılabilir.")
          : consumer
            ? `Temerrüt ve fesih gibi hukuki sonuç doğuran bildirimler; noter aracılığıyla, iadeli taahhütlü posta ile veya karşı Taraf’ın ${no("parties")}. maddede belirtilen elektronik posta adresine gönderilen ve gönderim kaydı saklanan elektronik posta ile yapılır. Müşteri’nin cayma bildirimine ilişkin Yönetmelik hükümleri saklıdır.`
            : `Taraflar tacir olduğu ölçüde, temerrüde düşürmeye, fesih ve sözleşmeden dönmeye ilişkin ihbar ve ihtarlar TTK m.18/3’te öngörülen usullerden biriyle, özellikle noter aracılığıyla veya taahhütlü mektupla, karşı Taraf’ın ${no("parties")}. maddede belirtilen adresine yapılır. Diğer hukuki bildirimler, karşı Taraf’ın elektronik posta adresine gönderilen ve gönderim kaydı saklanan elektronik posta ile de yapılabilir.`),
      ],
    },
    evidence: {
      key: "evidence", title: "Delil Sözleşmesi ve Elektronik Onay", blocks: [
        P(`Taraflar, Sözleşme’den doğabilecek uyuşmazlıklarda Hizmet Sağlayıcı’nın Elektronik Belge Sistemi kayıtlarının (elektronik onay kayıtları, tarih-saat bilgisi, IP adresi, cihaz ve tarayıcı bilgisi, imza görüntüsü, onay beyanları, belge sürümü ve doğrulama özeti), elektronik posta yazışmalarının ve usulüne uygun tutulmuş ticari defter ve kayıtların 6100 sayılı Hukuk Muhakemeleri Kanunu (“HMK”) m.193 uyarınca delil teşkil edeceğini kabul eder. Bu hüküm Taraflar’ın karşı delil sunma hakkını ortadan kaldırmaz${consumer ? "; tüketici işlemlerinde TKHK’nın emredici hükümleri saklıdır" : ""}.`),
        P("Sözleşme; Müşteri’nin Elektronik Belge Sistemi üzerinde ad soyadını yazması, imzasını elektronik ortamda çizmesi, onay beyanlarını işaretlemesi ve “Sözleşmeyi İmzala” işlemini tamamlaması suretiyle elektronik ortamda kurulur. TBK m.12 uyarınca sözleşmeler, kanunda aksi öngörülmedikçe hiçbir şekle bağlı değildir; işbu Sözleşme için kanunda özel bir geçerlilik şekli öngörülmemiştir."),
        P("Bu elektronik onay, 5070 sayılı Elektronik İmza Kanunu anlamında güvenli elektronik imza değildir ve anılan Kanun m.5 uyarınca elle atılan imza ile aynı hukuki sonucu doğurduğu iddiasını taşımaz. Onay işlemine ilişkin kayıtlar, Müşteri’nin iradesini gösteren elektronik belge ve delil niteliğindedir. Taraflardan biri talep ederse Sözleşme ayrıca ıslak imza veya güvenli elektronik imza ile de imzalanabilir."),
        P(`İmzalanan Sözleşme, imza tarihindeki haliyle Elektronik Belge Sistemi’nde saklanır ve içeriği sonradan değiştirilemez. Taraflar Sözleşme’yi dilediği zaman A4 biçiminde PDF olarak indirebilir${consumer ? "; Müşteri bu suretle Sözleşme’yi ve Ön Bilgilendirme Formu’nu kalıcı veri saklayıcısında muhafaza edebilir. Hizmet Sağlayıcı, talep halinde Sözleşme’nin bir nüshasını Müşteri’nin elektronik posta adresine ayrıca iletir" : ""}.`),
      ],
    },
    disputes: {
      key: "disputes", title: "Uygulanacak Hukuk ve Uyuşmazlıkların Çözümü", blocks: [
        P("Sözleşme ve Sözleşme’den doğan uyuşmazlıklar Türkiye Cumhuriyeti kanunlarına tabidir."),
        ...(consumer ? [
          P("Müşteri, Sözleşme’den doğan uyuşmazlıklarda, Ticaret Bakanlığı’nca her yıl ilan edilen parasal sınırlar dahilinde, TKHK m.68 uyarınca yerleşim yerindeki veya tüketici işleminin yapıldığı yerdeki tüketici hakem heyetine başvurabilir."),
          P("Parasal sınırı aşan uyuşmazlıklarda, TKHK m.73/A uyarınca dava şartı olan arabuluculuğa ilişkin hükümler saklı kalmak üzere, tüketici mahkemeleri görevlidir. Müşteri, TKHK m.73 uyarınca davayı kendi yerleşim yeri mahkemesinde de açabilir; Müşteri’nin kanundan doğan yetki ve başvuru hakları bu Sözleşme ile sınırlandırılamaz."),
        ] : [
          P(`Sözleşme’den doğan uyuşmazlıklarda, TTK m.5/A uyarınca dava şartı olan arabuluculuğa ilişkin hükümler saklı kalmak üzere, HMK m.17 uyarınca ${court} yetkilidir.`),
        ]),
      ],
    },
    effect: {
      key: "effect", title: "Yürürlük", blocks: [
        P(`İşbu Sözleşme ${count} (${countWords}) maddeden${consumer ? " ve Ek-1 Ön Bilgilendirme Formu’ndan" : ""} ibaret olup, ${teklifNumarali(ctx)}Teklif ile birlikte bir bütündür.`),
        P(kurulusCumlesi(ctx)),
        P("Sözleşme’nin herhangi bir hükmünün geçersiz sayılması, TBK m.27/2 çerçevesinde diğer hükümlerin geçerliliğini etkilemez; geçersiz hüküm, Taraflar’ın ortak amacına en yakın geçerli hükümle ikame edilir."),
        P(`Sözleşme’nin düzenlenme tarihi ${duzenlemeTarihi(ctx)}, belge referans numarası ${ctx.contractNo}’dir.`),
      ],
    },
  };
  return articles;
}

function ArticleView({ article, index }: { article: Article; index: number }) {
  const paragraphNo = (blockIndex: number) => article.blocks.slice(0, blockIndex + 1).filter((block) => block.t === "p").length;
  const rendered = article.blocks.map((block, blockIndex) => {
    if (block.t === "p") {
      return <p key={blockIndex}><span className="doc-pn">{index}.{paragraphNo(blockIndex)}</span>{block.c}</p>;
    }
    if (block.t === "ul") return <ul key={blockIndex}>{block.items.map((item, itemIndex) => <li key={itemIndex}>{item}</li>)}</ul>;
    if (block.t === "h") return <h4 key={blockIndex}>{block.c}</h4>;
    return block.c === null ? null : <div className="doc-block" key={blockIndex}>{block.c}</div>;
  }).filter((node) => node !== null);
  const [first, ...rest] = rendered;
  return <section className="doc-article">
    <div className="doc-keep"><h2><em>Madde {index}</em>{article.title}</h2>{first}</div>
    {rest}
  </section>;
}

function TaraflarBlogu({ ctx }: { ctx: ContractContext }) {
  return <div className="doc-grid-2">
    <PartyCard role="Hizmet Sağlayıcı" name={ctx.provider.name} rows={providerRows(ctx.provider)} />
    <PartyCard role={ctx.kind === "consumer" ? "Müşteri / Tüketici" : "Müşteri / Alıcı"} name={ctx.customer.name} rows={customerRows(ctx.customer)} />
  </div>;
}

/** [[blok]] → veriden çizilen parça; verisi yoksa (iş planı, IBAN) hiç çizilmez. */
function blokCiz(ctx: ContractContext, ad: string): Block | null {
  const bank = bankaHesabi(ctx);
  switch (ad) {
    case "taraflar": return BLOK(ad, <TaraflarBlogu ctx={ctx} />);
    case "kapsam": return UL(...ctx.scopeItems);
    case "is_plani": return ctx.workPlan.length ? BLOK(ad, <WorkPlanTable items={ctx.workPlan} />) : null;
    case "kdv_toplami": return BLOK(ad, <TaxTotals tax={ctx.tax} currency={ctx.currency} />);
    case "odeme_plani": return BLOK(ad, <PaymentPlanTable rows={ctx.schedule} currency={ctx.currency} />);
    case "banka_hesabi": return bank ? BLOK(ad, <BankAccountBox provider={bank} />) : null;
    default: return null;
  }
}

/** Kurumun metnindeki yer tutucuların bu belgedeki değerleri. */
function yerTutucuDegerleri(ctx: ContractContext, no: (key: string) => number): Record<string, string> {
  const money = (value: number) => formatMoney(value, ctx.currency);
  const sayi = ctx.sablon ? 0 : 0;
  void sayi;
  return {
    hizmet_saglayici: ctx.provider.name,
    musteri: ctx.customer.name,
    sozlesme_no: ctx.contractNo,
    hizmet_adi: ctx.title,
    teklif_no: ctx.proposalNo ?? "",
    teklif_no_numarali: teklifNumarali(ctx),
    sozlesme_bedeli: money(ctx.tax.gross),
    sozlesme_bedeli_yazi: amountInWords(ctx.tax.gross, ctx.currency),
    hizmet_bedeli: money(ctx.tax.net),
    kdv_tutari: money(ctx.tax.tax),
    kdv_orani: `%${ctx.tax.rate.toLocaleString("tr-TR")}`,
    baslangic_tarihi: formatDate(ctx.startDate),
    teslim_tarihi: formatDate(ctx.dueDate),
    duzenleme_tarihi: duzenlemeTarihi(ctx),
    sehir: ctx.city ?? "",
    yetkili_mahkeme: yetkiliMahkeme(ctx),
    hesap_sahibi: ctx.provider.accountHolder || ctx.provider.name,
    baslangic_cumlesi: baslangicCumlesi(ctx),
    teslim_cumlesi: teslimCumlesi(ctx),
    is_plani_cumlesi: isPlaniCumlesi(ctx),
    bedel_cumlesi: bedelCumlesi(ctx),
    havale_kosulu: havaleKosulu(ctx, no),
    veri_sorumlusu_iletisim: veriSorumlusuIletisim(ctx),
    erken_baslama_cumlesi: erkenBaslamaCumlesi(ctx),
    bildirim_adresleri: bildirimAdresleri(ctx),
    kurulus_cumlesi: kurulusCumlesi(ctx),
  };
}

/** **kalın** işaretli metni çizer. */
function satirIci(metin: string): ReactNode {
  const parcalar = kalinAyir(metin);
  return parcalar.length === 1 && !parcalar[0].kalin ? metin : <>{parcalar.map((parca, sira) => (parca.kalin ? <b key={sira}>{parca.metin}</b> : parca.metin))}</>;
}

/** Kurumun yazdığı madde: metin → bloklar. Zorunlu blok çıkarılmışsa sona eklenir. */
function metindenMadde(ctx: ContractContext, key: string, madde: MaddeMetni, sira: string[]): Article {
  const no = (anahtar: string) => sira.indexOf(anahtar) + 1;
  const degerler = { ...yerTutucuDegerleri(ctx, no), madde_sayisi: String(sira.length), madde_sayisi_yazi: numberToTurkishWords(sira.length) };
  const doldur = (metin: string) => yerTutucuDoldur(metin, degerler, (anahtar) => no(anahtar) || null).trim();
  const blocks: Block[] = [];
  const kullanilan = new Set<string>();
  for (const satir of metniCoz(madde.metin, ctx.kind === "consumer")) {
    if (satir.tur === "blok") {
      kullanilan.add(satir.ad);
      const blok = blokCiz(ctx, satir.ad);
      if (blok) blocks.push(blok);
    } else if (satir.tur === "liste") {
      const ogeler = satir.ogeler.map(doldur).filter(Boolean);
      if (ogeler.length) blocks.push(UL(...ogeler.map(satirIci)));
    } else {
      const metin = doldur(satir.metin);
      if (metin) blocks.push(satir.tur === "baslik" ? H(satirIci(metin)) : P(satirIci(metin)));
    }
  }
  for (const ad of ZORUNLU_BLOKLAR[key] ?? []) {
    if (kullanilan.has(ad)) continue;
    const blok = blokCiz(ctx, ad);
    if (blok) blocks.push(blok);
  }
  return { key, title: madde.baslik, blocks };
}

/**
 * Belgenin maddeleri: kurumun sırası ve değiştirdiği maddeler, gerisi
 * Arvo'nun metni. Kurum metni yoksa (ya da '{}') çıktı eskisiyle aynı.
 */
function etkinMaddeler(ctx: ContractContext, kurum: unknown): Article[] {
  const metin = kurumMetniCoz(kurum);
  const sira = etkinSira(articleKeys(ctx), metin, ZORUNLU_MADDELER, SON_MADDE)
    // Arvo'nun "özel hükümler" maddesi yalnızca şablonda özel hüküm varsa anlamlı.
    .filter((key) => key !== "special" || ctx.specialClauses.length || metin.maddeler?.special);
  const varsayilan = buildArticles(ctx, sira);
  return sira
    .map((key) => (metin.maddeler?.[key] ? metindenMadde(ctx, key, metin.maddeler[key], sira) : varsayilan[key]))
    .filter((article): article is Article => Boolean(article));
}

export function ContractArticles({ ctx, kurum }: { ctx: ContractContext; kurum?: unknown }) {
  return <div className="doc-articles">{etkinMaddeler(ctx, kurum).map((article, index) => <ArticleView key={article.key} article={article} index={index + 1} />)}</div>;
}

/* ---------- Düzenleme ekranının başlangıç metni ---------- */

/** React düğümünü kurumun söz dizimine çevirir (<b> → **…**). */
function dugumMetni(dugum: ReactNode): string {
  if (dugum === null || dugum === undefined || typeof dugum === "boolean") return "";
  if (typeof dugum === "string" || typeof dugum === "number") return String(dugum);
  if (Array.isArray(dugum)) return dugum.map(dugumMetni).join("");
  if (isValidElement<{ children?: ReactNode }>(dugum)) {
    const ic = dugumMetni(dugum.props.children);
    return dugum.type === "b" || dugum.type === "strong" ? `**${ic}**` : ic;
  }
  return "";
}

function birimler(article: Article): Birim[] {
  return article.blocks.flatMap((block): Birim[] => {
    if (block.t === "p") return [{ tur: "p", metin: dugumMetni(block.c) }];
    if (block.t === "h") return [{ tur: "h", metin: dugumMetni(block.c) }];
    if (block.t === "ul") return block.items.map((item) => ({ tur: "li", metin: dugumMetni(item) }));
    return [{ tur: "blok", metin: block.ad }];
  });
}

/**
 * Arvo'nun maddeleri, kurumun düzenleyeceği söz diziminde: tüketici ve
 * tacir sürümleri tek metinde ("[tüketici]" / "[tacir]" önekli satırlar).
 * Özel hükümler kurumun şablonundan (akademik, yazılım …) gelir.
 */
export function sozlesmeVarsayilanMetinleri(specialClauses: ContractClause[]): { anahtar: string; baslik: string; metin: string; zorunlu: boolean }[] {
  const temel = (kind: PartyKind): ContractContext => ({
    kind,
    contractNo: "{sozlesme_no}",
    title: "{hizmet_adi}",
    provider: { name: "{hizmet_saglayici}" } as Provider,
    customer: { name: "{musteri}" } as Customer,
    scopeItems: [],
    proposalNo: null,
    startDate: null,
    dueDate: null,
    createdAt: null,
    signedAt: null,
    currency: "TRY",
    tax: { status: "excluded", rate: 20, net: 0, tax: 0, gross: 0 } as TaxBreakdown,
    schedule: [],
    workPlan: [],
    specialClauses,
    earlyStart: null,
    city: null,
    textVersion: LEGAL_TEXT_VERSION,
    sablon: true,
  });
  const tuketici = buildArticles(temel("consumer"));
  const tacir = buildArticles(temel("merchant"));
  return articleKeys(temel("merchant")).map((anahtar) => ({
    anahtar,
    baslik: tacir[anahtar].title,
    metin: birimleriYaz(surumleriBirlestir(birimler(tuketici[anahtar]), birimler(tacir[anahtar]))),
    zorunlu: (ZORUNLU_MADDELER as readonly string[]).includes(anahtar),
  }));
}

/** İmzası yeni metinden önce alınmış sözleşmeler: onaylandıkları metinle gösterilir. */
export function LegacyArticles({ clauses }: { clauses: ContractClause[] }) {
  return <div className="doc-articles">{clauses.map((clause, index) => <ArticleView key={clause.title} index={index + 1} article={{ key: clause.title, title: clause.title, blocks: clause.paragraphs.map((paragraph) => P(paragraph)) }} />)}</div>;
}

/** Tüketici işlemlerinde Ek-1: Mesafeli Sözleşmeler Yönetmeliği m.5 kapsamındaki bilgiler. */
export function PreInformationAnnex({ ctx }: { ctx: ContractContext }) {
  const money = (value: number) => formatMoney(value, ctx.currency);
  const taxLine = providerTaxLine(ctx.provider);
  const bank = ctx.textVersion !== "3.0" && ctx.provider.iban ? ctx.provider : null;
  const plan = ctx.schedule.map((row) => `${row.label}: ${money(row.amount)}${row.dueDate ? ` (${formatDate(row.dueDate)})` : row.trigger ? ` (${row.trigger})` : ""}`);
  const rows: [string, ReactNode][] = [
    ["Hizmet Sağlayıcı", <>{ctx.provider.name}<br />{ctx.provider.address ? ctx.provider.address.replace(/\s*\n+\s*/g, ", ") : ctx.provider.info || "Ticaret siciline kayıtlı merkez adresi"}{taxLine ? <><br />{taxLine}</> : null}{ctx.provider.mersisNo ? <><br />MERSİS No: {ctx.provider.mersisNo}</> : null}{ctx.provider.phone ? <><br />Tel: {ctx.provider.phone}</> : null}{ctx.provider.email ? <><br />E-posta: {ctx.provider.email}</> : null}</>],
    ["Hizmetin temel nitelikleri", <><strong>{ctx.title}</strong><ul>{ctx.scopeItems.map((item, index) => <li key={index}>{item}</li>)}</ul></>],
    ["Toplam fiyat (vergiler dahil)", <>{money(ctx.tax.gross)}{ctx.tax.status === "included" || ctx.tax.status === "excluded" ? ` — ${money(ctx.tax.net)} + %${ctx.tax.rate.toLocaleString("tr-TR")} KDV (${money(ctx.tax.tax)})` : ctx.tax.status === "exempt" ? " — KDV istisnası uygulanır" : ""}. Bunun dışında Müşteri’den ek ücret, teslim veya kargo bedeli talep edilmez.</>],
    ["Ödeme şekli ve planı", <>{plan.map((line, index) => <span key={index} style={{ display: "block" }}>{line}</span>)}{bank ? <>Havale/EFT: {bank.bankName ? `${bank.bankName}, ` : ""}IBAN {formatIban(bank.iban)} ({bank.accountHolder || bank.name} adına kayıtlı hesap) veya güvenli ödeme bağlantısı ile kredi/banka kartı.</> : <>Havale/EFT ({ctx.provider.name} adına kayıtlı hesaba) veya güvenli ödeme bağlantısı ile kredi/banka kartı.</>}</>],
    ["İfa ve teslim", <>{ctx.startDate ? `Başlangıç: ${formatDate(ctx.startDate)}. ` : "Sözleşme’nin kurulmasını ve ön ödemeyi müteakip başlanır. "}{ctx.dueDate ? `Teslim: ${formatDate(ctx.dueDate)}.` : "Teslim takvimi Teklif’te belirtilmiştir."}{ctx.workPlan.length ? ` Ara teslimler: ${ctx.workPlan.map((item) => `${item.title} (${formatDate(item.due_date)})`).join("; ")}.` : ""} Teslim elektronik ortamda yapılır.</>],
    ["Cayma hakkı", <>Sözleşme’nin kurulduğu günden itibaren 14 (on dört) gün içinde gerekçe göstermeksizin ve cezai şart ödemeksizin cayma hakkı kullanılabilir. Bildirim, Hizmet Sağlayıcı’nın yukarıdaki elektronik posta veya posta adresine yazılı olarak ya da kalıcı veri saklayıcısı ile yapılır. Ödemeler bildirimin ulaşmasından itibaren 14 gün içinde iade edilir. Cayma süresi dolmadan Müşteri’nin onayıyla ifasına başlanan hizmetlerde cayma hakkı kullanılamaz (Yönetmelik m.15/1-ğ).</>],
    ["Şikâyet ve başvurular", <>Şikâyetler Hizmet Sağlayıcı’nın yukarıdaki iletişim adreslerine iletilebilir. Uyuşmazlıklarda Ticaret Bakanlığı’nca her yıl belirlenen parasal sınırlar dahilinde tüketici hakem heyetlerine, bu sınırları aşan uyuşmazlıklarda arabuluculuk şartı saklı kalmak üzere tüketici mahkemelerine başvurulabilir.</>],
    ["Sözleşmenin saklanması", <>Sözleşme ve bu form Elektronik Belge Sistemi’nde saklanır; Müşteri her ikisini de dilediği zaman PDF olarak indirebilir.</>],
  ];
  return <section className="doc-annex">
    <div className="doc-kicker">Ek-1 · {ctx.contractNo}</div>
    <h2 className="doc-annex-h">Ön Bilgilendirme Formu</h2>
    <p className="doc-annex-sub">6502 sayılı Tüketicinin Korunması Hakkında Kanun m.48 ve Mesafeli Sözleşmeler Yönetmeliği m.5 uyarınca, Sözleşme kurulmadan önce Müşteri’ye sunulan bilgiler.</p>
    <div className="doc-table-wrap"><table className="doc-table"><tbody>{rows.map(([label, value]) => <tr key={label}><td>{label}</td><td>{value}</td></tr>)}</tbody></table></div>
    <p className="doc-legal-note">Müşteri, bu formu Sözleşme’yi onaylamadan önce okuduğunu elektronik onay ekranında ayrı bir beyanla teyit eder.</p>
  </section>;
}
