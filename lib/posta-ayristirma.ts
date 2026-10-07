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
    alici: baslik(basliklar, "To"),
    konu: baslik(basliklar, "Subject"),
    /* Gmail özeti HTML varlıklarıyla geliyor (&#39;, &amp;); ekranda ham
       görünüyordu. Listede okunan tek metin bu, çözmek gerekiyor. */
    ozet: htmlVarliklariniCoz(ham.snippet ?? ""),
    tarih: mesajTarihi(ham.internalDate),
    yon: mesajYonu({ etiketler: ham.labelIds, gonderenAdres: gonderen.adres, kutuAdresi }),
    okunmamis: Boolean(ham.labelIds?.includes("UNREAD")),
    ekliDosya: ekliDosyaVarMi(ham.payload),
  };
}

function htmlVarliklariniCoz(metin: string): string {
  return metin
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&");
}

function ekliDosyaVarMi(payload: GmailMesaji["payload"]): boolean {
  const parcalar = (payload?.parts ?? []) as { filename?: string; parts?: unknown[] }[];
  return parcalar.some((parca) => Boolean(parca.filename) || ekliDosyaVarMi(parca as GmailMesaji["payload"]));
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

/** Etiketleri atar, satır yapısını korur. Gösterim düz metin olacak. */
export function htmlDenMetin(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&")
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
export function kutudaGorunurMu(etiketler: readonly string[] | undefined): boolean {
  const kume = new Set(etiketler ?? []);
  if (kume.has("DRAFT") || kume.has("SPAM") || kume.has("TRASH")) return false;
  return kume.has("INBOX") || kume.has("SENT");
}
