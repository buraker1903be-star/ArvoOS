/*
  KULLANIM KILAVUZU — metin ve süzme kuralı (30.10.2026). Saf modül:
  sayfa (app/panel/kilavuz) yalnızca çiziyor, birim testi
  tests/unit/kilavuz.test.ts.

  NEDEN KODDA, BİR CMS'TE DEĞİL: kılavuzun en sık bozulma yolu ekranın
  değişip metnin eskimesi. Burada her bağlantı testte gerçek bir sayfaya
  karşı sınanıyor ve her yetki anahtarı katalogla karşılaştırılıyor;
  ekranı değiştiren kişi metni de aynı değişiklikte görüyor.

  YAZIM KURALI: düğme ve sekme adları EKRANDAKİ yazımıyla, tırnak
  içinde. Bir ekranı değiştirirken buradaki adı da değiştirin; kullanıcı
  kılavuzdaki kelimeyi ekranda arıyor.
*/
import { aramaAnahtari } from "@/app/panel/os/os-apps";

export type KilavuzKonusu = {
  id: string;
  baslik: string;
  /** Açıklama paragrafları. */
  metin?: string[];
  /** Sıralı adımlar ("şunu yapın, sonra şunu"). */
  adimlar?: string[];
  /** Kurallar, ipuçları, dikkat edilecekler. */
  notlar?: string[];
  baglanti?: { href: string; etiket: string };
  /** Verilirse konu yalnızca bu yetkisi olana görünür (lib/yetkiler). */
  yetki?: string;
};

export type KilavuzBolumu = {
  id: string;
  baslik: string;
  /** Dock uygulaması (panel-navigation-config anahtarı ya da "posta"); null herkes için. */
  uygulama: string | null;
  giris: string;
  konular: KilavuzKonusu[];
};

export type KilavuzErisimi = { uygulamalar: ReadonlySet<string>; yetkiler: ReadonlySet<string> };

export const KILAVUZ: KilavuzBolumu[] = [
  {
    id: "baslarken",
    baslik: "Başlarken",
    uygulama: null,
    giris: "Panel bir masaüstü gibi çalışır: altta uygulamalar (dock), üstte durum çubuğu. Her modül bir uygulamadır; kurumunuzda açık olan ve rolünüzün gördüğü uygulamalar listelenir.",
    konular: [
      {
        id: "dock",
        baslik: "Uygulamalar ve bölümler",
        metin: [
          "Alttaki çubukta CRM, Operasyon, Finans, İnsan Kaynakları gibi uygulamalar durur. Bir uygulamanın üstüne gelince (telefonda dokununca) bölümleri açılır: ör. CRM → Genel Bakış, Talepler, Teklifler, Sözleşmeler, Takvim.",
          "WhatsApp, Posta ve Mesajlar gibi gün içinde gidip gelinen ekranlar \"Tüm uygulamalar\" içindedir.",
        ],
        notlar: ["Bir uygulamayı ya da bölümü göremiyorsanız kurumunuzda kapalıdır ya da rolünüzün yetkisi yoktur; yetkiyi Kurum Sahibi veya Yönetici Ayarlar → Yetkilendirme'den açar."],
      },
      {
        id: "arama",
        baslik: "Hızlı arama (Ctrl+K)",
        metin: ["Klavyede Ctrl+K (Mac'te ⌘K) ya da üst çubuktaki arama kutusu: uygulamalar, bölümler ve komutlar tek kutuda. Yazdığınız kelimeyle Türkçe harf farkı gözetmeden arar; \"sozlesme\" yazmak \"Sözleşmeler\"i bulur."],
      },
      {
        id: "ust-cubuk",
        baslik: "Üst çubuk: bildirimler, mesajlar, hesap",
        metin: [
          "Üst çubukta açık olan uygulama, çevrimiçi ekip arkadaşlarınız, mesajlar ve bildirimler görünür. Sağdaki adınıza tıklayınca hesap menüsü açılır: çalışma alanı değiştirme, Ayarlar, Bildirimler, Sözleşmelerim, Kullanım kılavuzu ve çıkış.",
          "Liste ve özet ekranları kendiliğinden tazelenir: bir ekip arkadaşınız talep ya da iş eklediğinde sayfayı yenilemeniz gerekmez.",
        ],
      },
      {
        id: "tutar",
        baslik: "Tutar ve tarih yazımı",
        metin: ["Tutarlar Türkçe yazımla girilir: binlik ayırıcı nokta, kuruş virgül. \"30.000,00\" otuz bin liradır; \"1.500\" bin beş yüz liradır, bir buçuk değil."],
        notlar: ["Saatler ve günler Türkiye saatiyle gösterilir."],
      },
      {
        id: "telefon",
        baslik: "Telefonda kullanım",
        metin: ["Paneli telefonun ana ekranına ekleyebilirsiniz (tarayıcının paylaş menüsü → \"Ana ekrana ekle\"). Bu kipte üst çubukta geri düğmesi görünür; tablolar telefonda kart olarak çizilir."],
      },
    ],
  },
  {
    id: "hesap",
    baslik: "Hesabım ve destek",
    uygulama: null,
    giris: "Kişisel kayıtlarınız ve yardım alma yolları.",
    konular: [
      {
        id: "sozlesmelerim",
        baslik: "Kullanım sözleşmesi ve onay kaydım",
        metin: ["Panele ilk girişte Kullanım Sözleşmesi'ni okuyup onaylarsınız. Onayınızın zamanı, sürümü, IP adresi, yaklaşık konumu ve cihaz bilgisi kayıt altına alınır; bir kopyası e-postanıza gider. Hesap menüsü → \"Sözleşmelerim\" sayfasında kaydı ve yürürlükteki metni her zaman görebilirsiniz."],
        baglanti: { href: "/panel/sozlesmelerim", etiket: "Sözleşmelerim" },
      },
      {
        id: "destek",
        baslik: "Destek talebi açmak",
        metin: ["Teknik, faturalama ya da ürünle ilgili sorularınız için Destek ekranından talep açın; yanıtlar aynı konuşmada gelir ve talebin durumunu oradan izlersiniz."],
        baglanti: { href: "/panel/support", etiket: "Destek" },
      },
    ],
  },
  {
    id: "ik",
    baslik: "İnsan Kaynakları",
    uygulama: "hr",
    giris: "Personel kayıtları, departmanlar, satış hedefleri; yetkisi olana maaş ve hakediş takibi.",
    konular: [
      {
        id: "maaslar",
        baslik: "Maaşlar (kadrolu personel)",
        yetki: "hr.maas.yonet",
        metin: [
          "ArvoOS bordro HESAPLAMAZ: SGK ve vergiyi mali müşaviriniz hesaplar. Bu ekran ayın maaş listesini ve ödemeyi tutar. Listede tam zamanlı, yarı zamanlı ve stajyer personel bulunur; sözleşmeli çalışanlar Hakedişler'dedir.",
          "\"Müşavir neti\" girilirse ödenecek tutar ondan, girilmezse \"Anlaşılan net\"ten hesaplanır; ek ödeme eklenir, avans ve kesinti düşülür. Eksik gün (ücretsiz izin + rapor) onaylı izinlerden, o ay ödenen prim de prim ödemelerinden kendiliğinden gelir.",
        ],
        adimlar: [
          "İnsan Kaynakları → Maaşlar'da ayı seçin.",
          "Anlaşılan neti girin; geçen ay girdiyseniz \"… maaşlarını kopyala\" ile aktarın.",
          "\"Müşavir dosyası (CSV)\" ile listeyi indirip müşavirinize gönderin; hesapladığı neti \"Müşavir neti\" kutusuna yazın ve \"Maaşları kaydet\".",
          "Ödemeyi yapınca satırdaki \"Öde\" → tarih ve yöntem → \"Ödendi olarak kaydet\". Finansa \"Personel Maaşı\" gideri yazılır.",
        ],
        notlar: [
          "Ödenmiş satır değiştirilemez; yanlışsa \"Geri al\" ile ödemeyi (ve finanstaki gideri) kaldırıp düzeltin.",
          "Bu ekranı yalnızca Kurum Sahibi ve Yönetici görür; personel yalnızca kendi kaydını görebilir.",
        ],
        baglanti: { href: "/panel/hr/maaslar", etiket: "Maaşlar" },
      },
      {
        id: "hakedisler",
        baslik: "Hakedişler (sözleşmeli / serbest çalışan)",
        yetki: "hr.maas.yonet",
        metin: ["Sözleşmeli çalışan bordroya girmez; iş başına ödenir. Hakediş; yapılan iş, tutar, belge (fatura ya da serbest meslek makbuzu) ve müşavirin söylediği stopajla girilir. Ödenecek tutar = tutar − stopaj."],
        adimlar: [
          "İnsan Kaynakları → Hakedişler → \"Yeni hakediş\".",
          "Çalışanı, işi, tutarı ve varsa stopajı girip \"Kaydet\".",
          "Ödeyince satırdaki \"Öde\" ile tarihi ve yöntemi kaydedin; finansa \"Serbest Çalışan Hakedişi\" gideri yazılır.",
        ],
        notlar: [
          "Özet şeridindeki \"Bu ayın stopajı\" müşavirinize bildireceğiniz tutardır.",
          "Ödenmiş hakediş silinmez; önce \"Geri al\".",
          "Çalışan listesinde personel kaydında çalışma tipi \"Sözleşmeli\" olanlar çıkar.",
        ],
        baglanti: { href: "/panel/hr/hakedisler", etiket: "Hakedişler" },
      },
    ],
  },
];

/** Kişinin görebildiği bölümler ve konular; boş kalan bölüm düşer. */
export function kilavuzBolumleri(e: KilavuzErisimi): KilavuzBolumu[] {
  return KILAVUZ
    .filter((b) => b.uygulama === null || e.uygulamalar.has(b.uygulama))
    .map((b) => ({ ...b, konular: b.konular.filter((k) => !k.yetki || e.yetkiler.has(k.yetki)) }))
    .filter((b) => b.konular.length > 0);
}

/** Aramanın baktığı metin: bölüm adı + konu başlığı + bütün içerik, Türkçe harf duyarsız. */
export function aramaMetni(b: KilavuzBolumu, k: KilavuzKonusu): string {
  return aramaAnahtari([b.baslik, b.uygulama ?? "", k.baslik, ...(k.metin ?? []), ...(k.adimlar ?? []), ...(k.notlar ?? [])].join(" "));
}
