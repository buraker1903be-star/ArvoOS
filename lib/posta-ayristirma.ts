/*
  ORTAK POSTA KUTUSU — Gmail cevaplarının okunması (saf).

  Ağ yok, Supabase yok: Gmail'in döndürdüğü JSON'dan listeye yazılacak
  alanları çıkarır. Birim testten import edilebilsin diye ayrı
  (tests/unit/posta-ayristirma.test.ts).
*/

export type GmailBaslik = { name?: string; value?: string };

/**
 * Başlık adı büyük/küçük harfe duyarsız aranır. Gmail çoğu zaman
 * "From" döndürüyor ama RFC başlık adlarını duyarsız tanımlıyor ve
 * bazı sunucular "FROM" yazıyor; duyarlı arama o mesajlarda göndereni
 * boş bırakıyordu.
 */
export function baslik(basliklar: readonly GmailBaslik[] | undefined, ad: string): string {
  const hedef = ad.toLowerCase();
  return basliklar?.find((satir) => (satir.name ?? "").toLowerCase() === hedef)?.value ?? "";
}

export type Gonderen = { ad: string | null; adres: string };

/**
 * "Ayşe Yılmaz <ayse@firma.com>" → { ad, adres }
 *
 * Ad tırnaklı da gelebiliyor ("Yılmaz, Ayşe" <...>) ve o virgül ekranda
 * iki kişi varmış gibi görünüyordu; tırnaklar soyuluyor. Adres yoksa
 * metnin tamamı adres sayılır — "ayse@firma.com" biçiminde gelen
 * başlıklar da var.
 */
export function gondereniAyristir(ham: string): Gonderen {
  const metin = (ham ?? "").trim();
  if (!metin) return { ad: null, adres: "" };

  const koseli = metin.match(/^(.*)<([^>]+)>\s*$/);
  if (!koseli) return { ad: null, adres: metin.toLowerCase() };

  const ad = koseli[1].trim().replace(/^"(.*)"$/, "$1").trim();
  return { ad: ad || null, adres: koseli[2].trim().toLowerCase() };
}

/**
 * Mesaj kutudan mı çıkmış, kutuya mı gelmiş.
 *
 * Önce Gmail'in kendi etiketine bakılıyor: SENT etiketi kesin bilgi.
 * Etiket yoksa gönderen adresi ortak kutunun adresiyle karşılaştırılıyor
 * — taslaktan gönderilen ya da başka istemciden yollanan mesajlarda
 * etiket gecikebiliyor.
 */
export function mesajYonu(girdi: {
  etiketler?: readonly string[];
  gonderenAdres: string;
  kutuAdresi: string;
}): "gelen" | "giden" {
  if (girdi.etiketler?.includes("SENT")) return "giden";
  return girdi.gonderenAdres.toLowerCase() === girdi.kutuAdresi.toLowerCase() ? "giden" : "gelen";
}

/**
 * Gmail'in internalDate'i milisaniye cinsinden METİN. Number'a
 * çevrilmeden Date'e verildiğinde "Invalid Date" oluyor ve liste
 * tarihsiz çiziliyordu.
 */
export function mesajTarihi(internalDate: unknown): Date | null {
  const sayi = typeof internalDate === "string" ? Number(internalDate)
    : typeof internalDate === "number" ? internalDate : NaN;
  if (!Number.isFinite(sayi) || sayi <= 0) return null;
  return new Date(sayi);
}

export type GmailMesaji = {
  id?: string;
  threadId?: string;
  labelIds?: string[];
  snippet?: string;
  internalDate?: string;
  payload?: { headers?: GmailBaslik[]; parts?: unknown[]; mimeType?: string; filename?: string };
};

export type CozulmusMesaj = {
  messageId: string;
  threadId: string;
  gonderenAd: string | null;
  gonderenAdres: string;
  alici: string;
  konu: string;
  ozet: string;
  tarih: Date | null;
  yon: "gelen" | "giden";
  okunmamis: boolean;
  etiketler: string[];
  ekliDosya: boolean;
};

/** Gmail mesajından tabloya yazılacak satır. Kimlik yoksa null. */
export function mesajiCoz(ham: GmailMesaji, kutuAdresi: string): CozulmusMesaj | null {
  if (!ham.id || !ham.threadId) return null;
  const basliklar = ham.payload?.headers;
  const gonderen = gondereniAyristir(baslik(basliklar, "From"));
  return {
    messageId: ham.id,
    threadId: ham.threadId,
    gonderenAd: gonderen.ad,
    gonderenAdres: gonderen.adres,
    /* Alıcı To + Cc. Eskiden yalnızca To saklanıyordu ve "tümünü yanıtla"
       özgün mesajın Cc alıcılarını hiç öneremiyordu. Panelden giden yeni
       posta (postaYeniGonder) da alıcıyı zaten bu biçimde yazıyor. */
    alici: [baslik(basliklar, "To"), baslik(basliklar, "Cc")].filter(Boolean).join(", "),
    konu: baslik(basliklar, "Subject"),
    /* Gmail özeti HTML varlıklarıyla geliyor (&#39;, &amp;); ekranda ham
       görünüyordu. Listede okunan tek metin bu, çözmek gerekiyor. */
    ozet: htmlVarliklariniCoz(ham.snippet ?? ""),
    tarih: mesajTarihi(ham.internalDate),
    yon: mesajYonu({ etiketler: ham.labelIds, gonderenAdres: gonderen.adres, kutuAdresi }),
    okunmamis: Boolean(ham.labelIds?.includes("UNREAD")),
    etiketler: kullaniciEtiketleri(ham.labelIds),
    ekliDosya: ekliDosyaVarMi(ham.payload),
  };
}

/*
  HTML VARLIKLARI.

  Eskiden altı varlık elle çözülüyordu ve gerisi ekranda ham kalıyordu:
  Türkçe postalarda "&uuml;", "&ccedil;" ve özellikle sayısal biçim
  ("&#8217;", "&#x27;") sık geçiyor — gelen kutusunda cümlenin ortasında
  "mü&scedil;teri" yazıyordu. Sayısal biçim genel olarak çözülüyor, adlı
  olanların yaygınları tabloda; tanınmayan varlık olduğu gibi bırakılıyor
  (yanlış tahmin, metni bozmaktan beter).
*/
const VARLIKLAR: Record<string, string> = {
  nbsp: " ", amp: "&", lt: "<", gt: ">", quot: '"', apos: "'",
  hellip: "…", mdash: "—", ndash: "–", minus: "−", bull: "•", middot: "·",
  rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", laquo: "«", raquo: "»",
  euro: "€", pound: "£", cent: "¢", copy: "©", reg: "®", trade: "™", deg: "°",
  uuml: "ü", Uuml: "Ü", ouml: "ö", Ouml: "Ö", ccedil: "ç", Ccedil: "Ç",
  auml: "ä", Auml: "Ä", szlig: "ß", eacute: "é", egrave: "è", agrave: "à",
  /* Görünmez karakterler: pazarlama postaları önizleme metnini bunlarla
     dolduruyor, çözülmezse gövdede boşluk yığını oluyor. */
  shy: "", zwnj: "", zwj: "", ensp: " ", emsp: " ", thinsp: " ",
};

function htmlVarliklariniCoz(metin: string): string {
  return metin.replace(/&(#\d{1,7}|#[xX][0-9a-fA-F]{1,6}|[a-zA-Z][a-zA-Z0-9]{1,8});/g, (tam, ad: string) => {
    if (ad.startsWith("#")) {
      const onaltilik = ad[1] === "x" || ad[1] === "X";
      const kod = onaltilik ? Number.parseInt(ad.slice(2), 16) : Number.parseInt(ad.slice(1), 10);
      if (!Number.isFinite(kod) || kod <= 0 || kod > 0x10ffff) return tam;
      try { return String.fromCodePoint(kod); } catch { return tam; }
    }
    return VARLIKLAR[ad] ?? VARLIKLAR[ad.toLowerCase()] ?? tam;
  });
}

/* Rozet, ek LİSTESİYLE aynı kaynaktan: iki ayrı tanım, imza logosunu
   listeden çıkarıp rozeti yanık bırakmanın yoluydu (10.10.2026). */
function ekliDosyaVarMi(payload: GmailMesaji["payload"]): boolean {
  return mesajEkleri(payload).length > 0;
}

/**
 * Konuşma satırı: aynı thread'in mesajlarından listede görünecek özet.
 * En SON mesaj kazanır; ekip listede "en son ne oldu"ya bakıyor.
 * Okunmamış, konuşmadaki herhangi bir mesaj okunmamışsa doğru.
 */
export function konusmayiOzetle(mesajlar: readonly CozulmusMesaj[]) {
  const sirali = [...mesajlar].sort((a, b) => (a.tarih?.getTime() ?? 0) - (b.tarih?.getTime() ?? 0));
  const son = sirali[sirali.length - 1];
  if (!son) return null;
  /* Konu ilk mesajdan alınıyor: yanıtlarda "Re: " ekleniyor ve liste
     aynı konuşmayı her yanıtta farklı başlıkla gösteriyordu. */
  const ilkKonu = sirali.find((mesaj) => mesaj.konu)?.konu ?? "";
  return {
    threadId: son.threadId,
    konu: ilkKonu,
    sonGonderenAd: son.gonderenAd,
    sonGonderenAdres: son.gonderenAdres,
    sonMesajAt: son.tarih,
    ozet: son.ozet,
    mesajSayisi: sirali.length,
    okunmamis: sirali.some((mesaj) => mesaj.okunmamis),
  };
}

/*
  GÖVDE SEÇİMİ VE METNE ÇEVİRME.

  Posta gövdesi HTML olarak GÖSTERİLMİYOR. Gelen kutusu dışarıdan gelen
  içerik; gönderenin HTML'ini olduğu gibi panele basmak, kurumun oturumu
  açıkken çalışan bir betik demek (XSS) — üstelik e-postalarda <script>,
  <iframe> ve izleme pikseli olağan. Bu yüzden önce düz metin parçası
  aranıyor, yoksa HTML etiketlerinden arındırılıyor.
*/

type GmailParca = { mimeType?: string; filename?: string; body?: { data?: string }; parts?: GmailParca[] };

/** base64url → metin. Gmail gövdeyi "-" ve "_" ile kodluyor. */
export function base64UrlCoz(veri: string): string {
  const normal = veri.replace(/-/g, "+").replace(/_/g, "/");
  try {
    return Buffer.from(normal, "base64").toString("utf8");
  } catch {
    return "";
  }
}

function parcaBul(parca: GmailParca | undefined, mime: string): string {
  if (!parca) return "";
  if (parca.mimeType === mime && !parca.filename && parca.body?.data) return base64UrlCoz(parca.body.data);
  for (const alt of parca.parts ?? []) {
    const bulunan = parcaBul(alt, mime);
    if (bulunan) return bulunan;
  }
  return "";
}

/*
  HTML → OKUNABİLİR METİN.

  Gösterim düz metin (yukarıdaki gerekçe), ama "etiketleri sil"
  yetmiyordu; gelen kutusunda okunan şey çoğu zaman bu metin:

  - BAĞLANTININ ADRESİ KAYBOLUYORDU. "Siparişinizi görüntüleyin" yazan
    bir düğmeden geriye yalnızca o cümle kalıyordu; müşterinin yolladığı
    ödeme ya da belge bağlantısına ulaşmanın tek yolu Gmail'e geçmekti.
    Artık adres metnin yanında duruyor.
  - KOŞULLU YORUMLAR sızıyordu: Outlook için yazılan <!--[if mso]> blokları
    ">" içerdiği için etiket süzgecinden geçiyor ve gövdenin başına
    anlamsız biçim kodu düşüyordu.
  - <head> ve <title> içeriği gövdeye karışıyordu.
  - TABLO HÜCRELERİ birbirine yapışıyordu ("Ürün Adet Tutar" yerine
    "ÜrünAdetTutar"); pazarlama ve fatura postalarının tamamı tablo.
  - Liste maddeleri ayrışmıyordu.

  Sıra önemli: varlıklar EN SONDA çözülüyor. Önce çözülseydi "&lt;b&gt;"
  yazan bir metin etikete dönüşüp süzgece yem olurdu.
*/
const GORUNMEZ = /[\u200b-\u200d\u2060\ufeff]/g;

export function htmlDenMetin(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|head|title)\b[\s\S]*?<\/\1>/gi, " ")
    /* Bağlantı: görünen metin + adres. Adres metnin içinde zaten
       geçiyorsa iki kez yazılmıyor. */
    .replace(/<a\b[^>]*\bhref=["']?(https?:\/\/[^"'\s>]+)["']?[^>]*>([\s\S]*?)<\/a>/gi, (_tam, adres: string, ic: string) => {
      const metin = ic.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      if (!metin) return ` ${adres} `;
      return metin.includes(adres) || adres.includes(metin) ? ` ${metin} ` : `${metin} (${adres})`;
    })
    .replace(/<li\b[^>]*>/gi, "\n• ")
    .replace(/<(br|hr)\b[^>]*\/?>/gi, "\n")
    /* li kapanışı listede YOK: açılışı zaten satır başı açıyor, ikisi
       birden her madde arasına boş satır koyuyordu. */
    .replace(/<\/(p|div|tr|h[1-6]|blockquote|table|ul|ol|section|article)>/gi, "\n")
    .replace(/<\/t[dh]>/gi, "  ")
    .replace(/<[^>]+>/g, "")
    .replace(GORUNMEZ, "")
    /* Varlıklar etiketler SİLİNDİKTEN sonra, boşluk sadeleştirmesinden
       ÖNCE: "&nbsp;" ile doldurulmuş bir satır çözülmeden sadeleşirse
       geriye boşluk yığını kalıyordu. */
    .split("\n").map((satir) => htmlVarliklariniCoz(satir).replace(/[ \t\u00a0]+/g, " ").trim()).join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Mesajın okunabilir gövdesi. Düz metin varsa o, yoksa HTML'den türetilen metin. */
export function mesajGovdesi(payload: unknown): string {
  const kok = payload as GmailParca | undefined;
  const duzMetin = parcaBul(kok, "text/plain");
  if (duzMetin.trim()) return duzMetin.trim();
  const html = parcaBul(kok, "text/html");
  return html ? htmlDenMetin(html) : "";
}

/*
  GMAIL DEĞİŞİKLİK SAYFALARINI TEK SONUCA İNDİRGEME.

  Artımlı eşitleme "şu imleçten beri ne değişti" diye soruyor; cevap
  sayfalı gelebiliyor. Burada iki şey oluyor: değişen mesaj kimlikleri
  tekilleşiyor, ve imlecin nereye taşınacağına karar veriliyor.

  İMLEÇ, SAYFALAR BİTMEDİYSE TAŞINMIYOR (null). Tur başına okunacak
  sayfa sayısı sınırlı; çok değişiklik birikmişse son okunan sayfanın
  historyId'sine atlamak, okunmayan sayfalardaki mesajları KALICI olarak
  atlamak demekti — bir daha hiçbir tur onları istemezdi. null dönünce
  çağıran imleci olduğu yerde bırakıyor ve sonraki tur aynı yerden
  devam ediyor; tekrar okunan birkaç değişikliğin maliyeti, sessizce
  kaybolan bir postanın yanında hiçbir şey.
*/
export type DegisimSayfasi = {
  history?: { messages?: { id?: string }[] }[];
  historyId?: string;
  nextPageToken?: string;
};

export function degisimleriTopla(
  sayfalar: readonly DegisimSayfasi[],
): { kimlikler: string[]; yeniImlec: string | null } {
  const kimlikler = new Set<string>();
  let imlec: string | null = null;
  for (const sayfa of sayfalar) {
    for (const kayit of sayfa.history ?? []) {
      for (const mesaj of kayit.messages ?? []) if (mesaj.id) kimlikler.add(mesaj.id);
    }
    if (sayfa.historyId) imlec = String(sayfa.historyId);
  }
  const yarimKaldi = Boolean(sayfalar.at(-1)?.nextPageToken);
  return { kimlikler: [...kimlikler], yeniImlec: yarimKaldi ? null : imlec };
}

/*
  ORTAK KUTUDA GÖRÜNMESİ GEREKEN MESAJ MI.

  Eskiden bu kararı Gmail'in liste sorgusu veriyordu. Artımlı eşitlemede
  öyle bir süzgeç yok: history ucu TÜM değişiklikleri döndürüyor —
  taslaklar, çöp kutusuna atılanlar, spam. Süzgeçsiz bırakmak, ekibin
  ortak kutusuna yarım kalmış taslakları konuşma diye yazmak demekti.

  Karar mesajın kendi etiketlerinden veriliyor, listeyi kimin ürettiğinden
  bağımsız: aynı kural hem artımlı tura hem geçmiş taramasına uyuyor.
*/
/*
  KULLANICI ETİKETLERİ.

  Gmail etiketlerin hepsini aynı listede veriyor: kutu durumunu anlatan
  sistem etiketleri (INBOX, SENT, UNREAD, TRASH…) ile kurumun kendi
  açtığı etiketler (Faturalar, Bayiler…) yan yana. Panelde yalnızca
  kurumun kendi etiketleri anlamlı: gelen/giden, okunmamış ve çöp zaten
  kendi sütunlarında modellenmiş durumda, onları etiket olarak bir daha
  göstermek aynı bilgiyi iki kez söylemek olurdu.

  Sistem etiketleri sabit bir listeyle değil, BİÇİMLERİYLE tanınıyor:
  Gmail'in kendi etiketleri tamamı büyük harf ve alt çizgi (INBOX,
  CATEGORY_PROMOTIONS), kullanıcınınkiler "Label_12" kimliğiyle geliyor.
  Sabit liste tutsaydık Gmail yeni bir sistem etiketi eklediğinde o,
  kurumun etiketi gibi görünürdü.
*/
/*
  Gmail arama sorgusu. Çöp ve spam DIŞARIDA: panelin çöp kutusu kendi
  görünümü, arama sonucuna karışması silinmiş bir yazışmayı geri gelmiş
  gibi gösterirdi. Kullanıcının yazdığı metin olduğu gibi gidiyor —
  Gmail'in kendi söz dizimi (from:, has:attachment) bilen için
  çalışmaya devam etsin.
*/
export function gmailAramaSorgusu(ham: string): string {
  return `${(ham ?? "").trim()} -in:trash -in:spam`.trim();
}

export function kullaniciEtiketleri(etiketler: readonly string[] | undefined): string[] {
  return [...new Set(etiketler ?? [])].filter((etiket) => !/^[A-Z][A-Z0-9_]*$/.test(etiket)).sort();
}

export function kutudaGorunurMu(etiketler: readonly string[] | undefined): boolean {
  const kume = new Set(etiketler ?? []);
  if (kume.has("DRAFT") || kume.has("SPAM") || kume.has("TRASH")) return false;
  return kume.has("INBOX") || kume.has("SENT");
}

/*
  EKLİ DOSYALAR.

  İlk sürüm yalnızca "ek var mı" diyordu; indirmek için Gmail'e geçmek
  gerekiyordu ve ortak kutunun amacı tam da bunu gerektirmemekti.
  Gmail ekleri gövdeyle aynı ağaçta taşıyor: filename'i olan her parça
  bir ek, verisi ayrı bir attachmentId'nin arkasında.
*/
export type MesajEki = { ekId: string; dosyaAdi: string; tur: string; boyut: number };

type EkliParca = {
  filename?: string;
  mimeType?: string;
  body?: { attachmentId?: string; size?: number };
  headers?: { name?: string; value?: string }[];
  parts?: EkliParca[];
};

/*
  GÖVDENİN İÇİNDE ÇİZİLEN GÖRSEL EK DEĞİL.

  İmza logosu mesajın içinde gidiyor (multipart/related + Content-ID) ve
  HTML ondan "cid:" ile çağırıyor. Gmail onu da dosya adı olan bir parça
  olarak döndürüyor; ayırmazsak panelde her yazışmanın altında
  "logo.png 23 KB" diye bir ek görünüyor, "ekli dosya" rozeti yanıyor ve
  yönlendirmede logo gerçek bir ek olarak yeniden gönderiliyordu
  (10.10.2026, HTML imza canlıya çıkar çıkmaz).

  Ölçüt ikisi birden: Content-ID VE inline. Karşı tarafın "inline"
  olarak gönderdiği ama gövdede çizilmeyen bir dosya (bazı istemciler
  PDF'i böyle yolluyor) Content-ID taşımadığı için ek sayılmaya devam
  ediyor — onu gizlemek, müşterinin gönderdiği belgeyi yok etmek olurdu.
*/
function govdeyeGomulu(parca: EkliParca): boolean {
  const basliktan = (ad: string) =>
    parca.headers?.find((baslik) => (baslik.name ?? "").toLowerCase() === ad)?.value ?? "";
  return Boolean(basliktan("content-id")) && basliktan("content-disposition").trim().toLowerCase().startsWith("inline");
}

export function mesajEkleri(payload: unknown): MesajEki[] {
  const topla = (parca: EkliParca | undefined, biriken: MesajEki[]) => {
    if (!parca) return biriken;
    if (parca.filename && parca.body?.attachmentId && !govdeyeGomulu(parca)) {
      biriken.push({
        ekId: parca.body.attachmentId,
        dosyaAdi: parca.filename,
        tur: parca.mimeType || "application/octet-stream",
        boyut: parca.body.size ?? 0,
      });
    }
    for (const alt of parca.parts ?? []) topla(alt, biriken);
    return biriken;
  };
  return topla(payload as EkliParca | undefined, []);
}

/**
 * Dosya adı indirme başlığına girmeden önce temizlenir.
 *
 * Ad gönderenden geliyor: içindeki satır sonu Content-Disposition
 * başlığını bölüp ikinci bir başlık enjekte etmeye yarar, eğik çizgi ise
 * kaydedilen dosyayı başka bir dizine yazdırmaya çalışır. Türkçe
 * harfler korunuyor; başlık zaten UTF-8 olarak kodlanıyor.
 */
export function guvenliDosyaAdi(ham: string): string {
  const sade = (ham ?? "")
    .replace(/[\r\n"\\]/g, " ")
    .replace(/[/\\]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
  return sade.slice(0, 180) || "ek";
}

/*
  ARAMA DESENİ.

  Liste PostgREST'in `or` süzgeciyle aranıyor ve o süzgeç virgülle
  ayrılmış bir METİN: terimdeki virgül ya da parantez süzgecin kendi
  dilbilgisini bozup sorguyu hataya düşürüyor — aranan kelimenin içinde
  olması yeterli. Yüzde ve alt çizgi ise LIKE joker karakterleri; "%"
  yazan biri bütün kutuyu getirirdi.

  İki karakterden kısa terim aranmıyor: tek harf bütün kutuyu getirir ve
  kullanıcıya arama yapılmamış gibi görünür.
*/
export function postaAramaDeseni(ham: string): string | null {
  const sade = (ham ?? "")
    .replace(/[,()%_*\\"']/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (sade.length < 2) return null;
  return sade.slice(0, 80);
}
