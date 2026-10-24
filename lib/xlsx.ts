import { deflateRawSync } from "node:zlib";

/*
  EXCEL (.xlsx) YAZICISI — BAĞIMLILIKSIZ.

  Kurum sahibinin kararı (24.10.2026): rapor çıktısı CSV değil Excel
  olacak ("CSV ortalığı karıştırıyor"). Haklı — CSV'de ayırıcı,
  ondalık ve kodlama Türkçe Excel'de üç ayrı yerde bozuluyor:
  noktalı virgül mü virgül mü, "1.234,56" sayı mı metin mi, ve BOM
  yoksa "ş" yerine "Å".

  .xlsx aslında XML dosyalarından oluşan bir ZIP. Node'un kendi
  `zlib`'i yeterli, yani `exceljs` (~1 MB) ya da güvenlik geçmişi
  tartışmalı `xlsx` paketini eklemeye gerek yok. Bu depo zaten
  grafiği, pencereyi ve PDF'i elle yazıyor (AGENTS.md: mevcut
  altyapı yeterliyse yeni bağımlılık ekleme).

  SAYI SAYI OLARAK YAZILIYOR, metin olarak değil: yönetici sütunu
  seçip toplayabilmeli. Para ve yüzde biçimi hücre BİÇİMİNDEN
  geliyor, metne gömülmüş "₺" işaretinden değil — gömülü işaret
  hücreyi metne çevirir ve toplam alınamaz.

  Saf modül: testi tests/unit/xlsx.test.ts.
*/

export type HucreBicimi = "metin" | "sayi" | "para" | "yuzde";
export type Hucre = string | number | null;

export type Sutun = {
  baslik: string;
  bicim?: HucreBicimi;
  /** Karakter genişliği; verilmezse başlığa göre tahmin edilir. */
  genislik?: number;
};

export type Sayfa = {
  /** Excel sekme adı. 31 karakteri aşamaz ve : \ / ? * [ ] içeremez. */
  ad: string;
  sutunlar: Sutun[];
  satirlar: Hucre[][];
};

/* ---------- XML ---------- */

/** XML'e giren her metin kaçışlanır: tek bir "&" dosyayı açılamaz yapar. */
export function xmlKacis(metin: string): string {
  return metin
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
    /* Denetim karakterleri XML 1.0'da YASAK ve Excel dosyayı "bozuk"
       diye açmıyor. Kullanıcı notlarından gelebiliyor. */
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");
}

/** 0 → A, 25 → Z, 26 → AA. */
export function sutunHarfi(sira: number): string {
  let harf = "";
  let n = sira;
  while (n >= 0) {
    harf = String.fromCharCode(65 + (n % 26)) + harf;
    n = Math.floor(n / 26) - 1;
  }
  return harf;
}

/*
  SEKME ADI EXCEL'İN KURALINA UYMAK ZORUNDA: 31 karakter sınırı ve
  : \ / ? * [ ] karakterleri yasak. Uymayan ad dosyayı açılamaz
  yapıyor — hata da vermiyor, Excel "onarılamadı" diyor.
*/
export function sekmeAdi(ham: string): string {
  const temiz = ham.replace(/[:\\/?*[\]]/g, " ").trim();
  return (temiz || "Sayfa").slice(0, 31);
}

const BICIM_STILI: Record<HucreBicimi, number> = { metin: 0, sayi: 0, para: 2, yuzde: 3 };

function hucreXml(deger: Hucre, adres: string, bicim: HucreBicimi): string {
  if (deger === null || deger === "") return "";
  const stil = BICIM_STILI[bicim];
  const stilEk = stil ? ` s="${stil}"` : "";
  if (typeof deger === "number" && Number.isFinite(deger)) {
    return `<c r="${adres}"${stilEk}><v>${deger}</v></c>`;
  }
  /* inlineStr: paylaşılan dize tablosu kurmaya gerek yok. Rapor
     çıktısında aynı metin yüzlerce kez tekrar etmiyor. */
  return `<c r="${adres}" t="inlineStr"><is><t xml:space="preserve">${xmlKacis(String(deger))}</t></is></c>`;
}

function sayfaXml(sayfa: Sayfa): string {
  const sutunlar = sayfa.sutunlar
    .map((s, i) => `<col min="${i + 1}" max="${i + 1}" width="${s.genislik ?? Math.min(42, Math.max(12, s.baslik.length + 4))}" customWidth="1"/>`)
    .join("");

  const baslikSatiri = sayfa.sutunlar
    .map((s, i) => `<c r="${sutunHarfi(i)}1" t="inlineStr" s="1"><is><t>${xmlKacis(s.baslik)}</t></is></c>`)
    .join("");

  const govde = sayfa.satirlar
    .map((satir, y) => {
      const hucreler = satir
        .map((deger, x) => hucreXml(deger, `${sutunHarfi(x)}${y + 2}`, sayfa.sutunlar[x]?.bicim ?? "metin"))
        .join("");
      return `<row r="${y + 2}">${hucreler}</row>`;
    })
    .join("");

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><cols>${sutunlar}</cols><sheetData><row r="1">${baslikSatiri}</row>${govde}</sheetData></worksheet>`;
}

/*
  BİÇİM TABLOSU. Excel `fills` listesinde ilk ikisinin "none" ve
  "gray125" olmasını ŞART koşuyor; atlanırsa dosya açılmıyor.
  Para biçiminde ₺ işareti hücre biçiminde — metne gömülü olsaydı
  sütun toplanamazdı.
*/
const STILLER = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="2"><numFmt numFmtId="164" formatCode="#,##0.00\\ &quot;₺&quot;"/><numFmt numFmtId="165" formatCode="0.0%"/></numFmts><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs></styleSheet>`;

/* ---------- ZIP ---------- */

const CRC_TABLOSU = (() => {
  const tablo = new Int32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    tablo[i] = c;
  }
  return tablo;
})();

/** ZIP girişleri CRC32 ister; Node'un `zlib.crc32`'si yeni sürümlerde
 *  var ama bu depo eski Node ile de kurulabilmeli. */
export function crc32(veri: Buffer): number {
  let c = -1;
  for (let i = 0; i < veri.length; i++) c = CRC_TABLOSU[(c ^ veri[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

type ZipGirdisi = { ad: string; icerik: Buffer };

function zipYaz(girdiler: ZipGirdisi[]): Buffer {
  const yerel: Buffer[] = [];
  const merkez: Buffer[] = [];
  let konum = 0;

  for (const girdi of girdiler) {
    const ad = Buffer.from(girdi.ad, "utf8");
    const sikistirilmis = deflateRawSync(girdi.icerik);
    const crc = crc32(girdi.icerik);

    const baslik = Buffer.alloc(30);
    baslik.writeUInt32LE(0x04034b50, 0);
    baslik.writeUInt16LE(20, 4);
    /* Bit 11: ad UTF-8. Türkçe karakterli sayfa adları için şart. */
    baslik.writeUInt16LE(0x0800, 6);
    baslik.writeUInt16LE(8, 8); // deflate
    baslik.writeUInt32LE(0, 10); // tarih/saat: sabit (yeniden üretilebilir çıktı)
    baslik.writeUInt32LE(crc, 14);
    baslik.writeUInt32LE(sikistirilmis.length, 18);
    baslik.writeUInt32LE(girdi.icerik.length, 22);
    baslik.writeUInt16LE(ad.length, 26);
    baslik.writeUInt16LE(0, 28);
    yerel.push(baslik, ad, sikistirilmis);

    const merkezBasligi = Buffer.alloc(46);
    merkezBasligi.writeUInt32LE(0x02014b50, 0);
    merkezBasligi.writeUInt16LE(20, 4);
    merkezBasligi.writeUInt16LE(20, 6);
    merkezBasligi.writeUInt16LE(0x0800, 8);
    merkezBasligi.writeUInt16LE(8, 10);
    merkezBasligi.writeUInt32LE(0, 12);
    merkezBasligi.writeUInt32LE(crc, 16);
    merkezBasligi.writeUInt32LE(sikistirilmis.length, 20);
    merkezBasligi.writeUInt32LE(girdi.icerik.length, 24);
    merkezBasligi.writeUInt16LE(ad.length, 28);
    merkezBasligi.writeUInt32LE(0, 38);
    merkezBasligi.writeUInt32LE(konum, 42);
    merkez.push(merkezBasligi, ad);

    konum += 30 + ad.length + sikistirilmis.length;
  }

  const merkezGovde = Buffer.concat(merkez);
  const son = Buffer.alloc(22);
  son.writeUInt32LE(0x06054b50, 0);
  son.writeUInt16LE(girdiler.length, 8);
  son.writeUInt16LE(girdiler.length, 10);
  son.writeUInt32LE(merkezGovde.length, 12);
  son.writeUInt32LE(konum, 16);

  return Buffer.concat([...yerel, merkezGovde, son]);
}

/* ---------- Dışa aktarma ---------- */

/** Sayfaları tek bir .xlsx dosyasına yazar. */
export function xlsxUret(sayfalar: Sayfa[]): Buffer {
  if (sayfalar.length === 0) throw new Error("En az bir sayfa gerekli.");

  /* Aynı sekme adı iki kez geçerse Excel dosyayı açmıyor; kırpma
     sonrası çakışma olabildiği için burada ayrıştırılıyor. */
  const kullanilan = new Set<string>();
  const adlar = sayfalar.map((sayfa) => {
    let ad = sekmeAdi(sayfa.ad);
    let sira = 2;
    while (kullanilan.has(ad.toLocaleLowerCase("tr"))) {
      const ek = ` (${sira++})`;
      ad = sekmeAdi(ad.slice(0, 31 - ek.length) + ek);
    }
    kullanilan.add(ad.toLocaleLowerCase("tr"));
    return ad;
  });

  const sayfaGirisleri = sayfalar.map((sayfa, i) => ({
    ad: `xl/worksheets/sheet${i + 1}.xml`,
    icerik: Buffer.from(sayfaXml(sayfa), "utf8"),
  }));

  const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${adlar
    .map((ad, i) => `<sheet name="${xmlKacis(ad)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
    .join("")}</sheets></workbook>`;

  const workbookRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sayfalar
    .map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`)
    .join("")}<Relationship Id="rId${sayfalar.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;

  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sayfalar
    .map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`)
    .join("")}</Types>`;

  const kokRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;

  return zipYaz([
    { ad: "[Content_Types].xml", icerik: Buffer.from(contentTypes, "utf8") },
    { ad: "_rels/.rels", icerik: Buffer.from(kokRels, "utf8") },
    { ad: "xl/workbook.xml", icerik: Buffer.from(workbook, "utf8") },
    { ad: "xl/_rels/workbook.xml.rels", icerik: Buffer.from(workbookRels, "utf8") },
    { ad: "xl/styles.xml", icerik: Buffer.from(STILLER, "utf8") },
    ...sayfaGirisleri,
  ]);
}

/** Tarayıcıya indirtmek için başlıklar; dosya adı Türkçe karakter taşıyabilir. */
export function xlsxBasliklari(dosyaAdi: string): Record<string, string> {
  const ascii = dosyaAdi.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\w.\- ]/g, "_");
  return {
    "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    /* İki ad birden: eski istemciler ASCII olanı, yenileri UTF-8
       olanı okuyor. Yalnızca UTF-8 verilince bazı tarayıcılar dosyayı
       "indirme" yerine açmaya çalışıyor. */
    "Content-Disposition": `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(dosyaAdi)}`,
  };
}
