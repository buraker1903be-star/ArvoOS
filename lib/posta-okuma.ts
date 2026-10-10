/*
  GELEN POSTANIN OKUNMASI (saf).

  Panelde bir mesajın gövdesi olduğu gibi basılıyordu. Gerçek
  yazışmalarda bu, okunacak iki satırın altında yirmi turluk geçmiş
  demek: müşteri yanıt yazdığında istemcisi bizim önceki mesajımızı,
  imzamızı ve ondan önceki bütün alıntıları da gönderiyor. Ortak
  kutuda personelin gözü her mesajda aynı metni yeniden tarıyordu.

  Burada gövde üçe ayrılıyor: YENİ yazılan, imza ve alıntılanan geçmiş.
  Ekran alıntıyı katlanmış gösteriyor (ekranda bir satır), imzayı
  soluk. Hiçbir şey ATILMIYOR — ortak kutuda "ne yazıldığı" kadar "ne
  alıntılandığı" da kanıt.

  Ağ ve React yok: birim testten çağrılabilsin (tests/unit/posta-okuma.test.ts).
*/

/*
  ALINTININ BAŞLADIĞI SATIR.

  İstemcilerin ortak biçimleri: ">" ile alıntı, "… şöyle yazdı:" /
  "On … wrote:" başlığı, Outlook'un alt çizgi şeridi ve
  "-----Original Message-----". Hepsi tanınmak zorunda: kurumun
  müşterileri Gmail, Outlook ve telefon uygulamaları karışık kullanıyor.
*/
const ALINTI_DESENLERI: RegExp[] = [
  /^\s*>/,
  /^\s*-{2,}\s*(İletilen mesaj|Iletilen mesaj|Forwarded message|Original Message|Özgün ileti)/i,
  /^\s*-{5,}\s*$/,
  /^\s*_{10,}\s*$/,
  /yazdı\s*:\s*$/i,
  /^\s*On\b.+\bwrote:\s*$/i,
  /^\s*\d{1,2}[./]\d{1,2}[./]\d{2,4}.*(tarihinde|schrieb|a écrit)/i,
];

/* Outlook başlık bloğu ("Kimden: …" / "Gönderen: …") tek başına ölçüt
   değil: aynı satır postanın kendi metninde de geçebiliyor. Yakın
   satırlarda konu ya da tarih başlığı da varsa alıntı sayılıyor. */
const BLOK_BASI = /^\s*(Kimden|Gönderen|From|Sender)\s*:\s*\S/i;
const BLOK_DESTEGI = /^\s*(Konu|Subject|Tarih|Date|Kime|To)\s*:\s*\S/i;

export type OkunanGovde = {
  /** Mesajın kendisi: okunacak metin. */
  yeni: string;
  /** "-- " ayıracından sonrası; ekranda soluk. */
  imza: string | null;
  /** Alıntılanan geçmiş; ekranda katlı. */
  alinti: string | null;
};

function alintiBaslangici(satirlar: readonly string[]): number {
  for (let sira = 0; sira < satirlar.length; sira += 1) {
    const satir = satirlar[sira];
    if (ALINTI_DESENLERI.some((desen) => desen.test(satir))) return sira;
    if (BLOK_BASI.test(satir) && satirlar.slice(sira + 1, sira + 5).some((alt) => BLOK_DESTEGI.test(alt))) return sira;
  }
  return -1;
}

export function govdeyiBol(ham: string): OkunanGovde {
  const metin = (ham ?? "").replace(/\r\n?/g, "\n");
  const satirlar = metin.split("\n");
  const baslangic = alintiBaslangici(satirlar);

  let yeniSatirlar = baslangic >= 0 ? satirlar.slice(0, baslangic) : satirlar;
  let alinti = baslangic >= 0 ? satirlar.slice(baslangic).join("\n").trim() : "";

  /*
    YÖNLENDİRİLEN POSTA KATLANMIYOR. İletilen bir mesajda "yeni" kısım
    çoğu zaman boş ya da tek satırlık bir not; alıntıyı katlasaydık
    ekranda okunacak hiçbir şey kalmazdı.
  */
  if (alinti && yeniSatirlar.filter((satir) => satir.trim()).length === 0) {
    yeniSatirlar = satirlar;
    alinti = "";
  }

  /* İmza: RFC 3676 ayıracından sonrası. Yalnızca ALINTININ DIŞINDAKİ
     son ayıraç sayılıyor; alıntının içindeki imza zaten katlı gidiyor. */
  let imza: string | null = null;
  const ayirac = yeniSatirlar.map((satir) => /^--\s?$/.test(satir)).lastIndexOf(true);
  if (ayirac >= 0) {
    const aday = yeniSatirlar.slice(ayirac + 1).join("\n").trim();
    /* Uzun bir blok imza değildir; "--" bazen cümle ayıracı olarak da
       yazılıyor ve metnin yarısını soluklaştırmak okumayı bozardı. */
    if (aday && aday.split("\n").length <= 8) {
      imza = aday;
      yeniSatirlar = yeniSatirlar.slice(0, ayirac);
    }
  }

  return { yeni: yeniSatirlar.join("\n").trim(), imza, alinti: alinti || null };
}

/*
  Alıntı GÖSTERİLİRKEN bir düzey ">" işareti düşüyor: metnin solundaki
  şerit zaten "bu alıntı" diyor, her satırın başındaki işaret okumayı
  zorlaştırıyordu. İç içe alıntılarda kalan işaretler duruyor — kaç tur
  geriye gidildiği bilgi.
*/
export function alintiMetni(alinti: string): string {
  return alinti.split("\n").map((satir) => satir.replace(/^\s?>\s?/, "")).join("\n").trim();
}

/** Katlı alıntının başlığında kaç satır olduğu yazıyor: açmaya değer mi. */
export function alintiSatirSayisi(alinti: string): number {
  return alinti.split("\n").filter((satir) => satir.trim()).length;
}

/*
  TIKLANABİLİR BAĞLANTILAR.

  Gövde düz metin olarak basılıyor (gönderenin HTML'i panelde
  çalıştırılmıyor) ve bu, içindeki adresleri tıklanamaz bırakıyordu:
  müşterinin yolladığı bağlantıyı açmak için metni elle seçip
  kopyalamak gerekiyordu.

  Adres METİNDEN ÜRETİLİYOR, gönderenin verdiği bir nitelikten değil:
  yalnızca http(s), "www." ve e-posta biçimleri tanınıyor, başka şema
  (javascript:, data:) hiç eşleşmiyor.
*/
export type MetinParcasi =
  | { tip: "metin"; deger: string }
  | { tip: "baglanti"; deger: string; adres: string };

const BAGLANTI_DESENI = /(https?:\/\/[^\s<>()[\]]+|www\.[^\s<>()[\]]+|[^\s<>()[\],;:]+@[^\s<>()[\],;:]+\.[a-z]{2,})/gi;
/* Cümle sonundaki noktalama adresin dışında kalıyor: "…/teklif/abc."
   bağlantısı noktayla birlikte 404 veriyordu. */
const KUYRUK = /[.,;:!?)\]'"»]+$/;

export function metinParcalari(metin: string): MetinParcasi[] {
  const parcalar: MetinParcasi[] = [];
  let son = 0;
  for (const eslesme of (metin ?? "").matchAll(BAGLANTI_DESENI)) {
    const ham = eslesme[0];
    const bas = eslesme.index ?? 0;
    const kuyruk = ham.match(KUYRUK)?.[0] ?? "";
    const deger = ham.slice(0, ham.length - kuyruk.length);
    if (!deger) continue;
    const adres = deger.includes("@") && !/^https?:\/\//i.test(deger)
      ? `mailto:${deger}`
      : /^www\./i.test(deger) ? `https://${deger}` : deger;
    if (bas > son) parcalar.push({ tip: "metin", deger: metin.slice(son, bas) });
    parcalar.push({ tip: "baglanti", deger, adres });
    son = bas + deger.length;
  }
  if (son < (metin ?? "").length) parcalar.push({ tip: "metin", deger: metin.slice(son) });
  return parcalar;
}
