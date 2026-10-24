import type { CSSProperties, ReactNode } from "react";
import type { IkonAdi } from "@/lib/rapor-ikonlari";
import { PanelDrawer } from "../../components/panel-drawer";

/*
  RAPORLARIN ORTAK SUNUM PARÇALARI (2026-10-24).

  Bu parçalar raporlar sayfasının içinde duruyordu; sekiz rapor
  aynı kutuyu, aynı mini grafiği ve aynı defteri kullanacak. Her
  rapora kopyalansaydı kartlar yavaşça ayrışırdı: biri yüzdeyi
  "%-12", öteki "−%12" yazardı — aynı ekranda iki ayrı dil.

  Hepsi SUNUCUDA çiziliyor: SVG ve CSS, istemci kodu ve kütüphane yok.
  Veri mantığına dokunmuyorlar; aldıkları şeyi gösteriyorlar.
*/
export const money = (amount: number) => new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 0 }).format(amount / 100);
// Negatif oran "−%184" (eskiden "%-184" yazılıyordu).
export const percent = (value: number) => (Math.round(value) < 0 ? `−%${Math.abs(Math.round(value))}` : `%${Math.round(value)}`);
// ---------------------------------------------------------------
// Sunum yardımcıları (yalnızca görünüm; veri mantığına dokunmaz)
// ---------------------------------------------------------------
/** Satır içi CSS değişkeni (ör. --w, --h). CSS tarafında her zaman fallback'li okunur. */
export const cssVar = (name: string, value: string) => ({ [name]: value }) as CSSProperties;
export const clampPercent = (value: number) => Math.max(0, Math.min(100, value));
/** Düşülen kalemler için "−₺1.250"; sıfırsa işaretsiz "₺0". */
export const deduction = (amount: number) => (amount ? `−${money(amount)}` : money(0));
export const shareOf = (value: number, base: number) => (base ? (value / base) * 100 : null);

export type Tone = "brand" | "info" | "gold" | "success" | "warning" | "danger";
/*
  GRAFİKLİ KARTLAR (2026-10). Üstteki on kart eskiden yalnızca bir sayı ve
  bir cümleydi; dönemin gidişatı (artıyor mu, oranı ne, nereye gitti)
  görünmüyordu. Her kart kendi verisine uygun küçük bir grafik taşıyor:
    cubuk    son 6 ayın değeri (gelen lead, satış, iş maliyeti, tahsilat)
    halka    bir önceki aşamaya oran (ulaşılan, nitelikli, teklif)
    gosterge yarım daire oran (dönüşüm)
    yigin    satış değerinin maliyet / kâr bölünmesi (brüt kâr)
    selale   tahsilattan düşülenler ve kalan (net nakit)
  Grafikler sunucuda çizilen SVG ve CSS: istemci kodu, kütüphane yok.
*/
/*
  ÇUBUĞUN ALTINDAKİ ETİKET AYRI BİR ALAN (2026-10-24).

  `ad` hem ipucu/ekran okuyucu metni hem de eksen etiketi olarak
  kullanılıyordu. Ay kısaltmalarıyla ("Tem", "Ağu") sorun yoktu ama
  aynı grafik müşteri adı, kayıp sebebi ve sözleşme numarasıyla da
  kullanılınca etiketler ÜST ÜSTE BİNDİ ve kutudaki rakamın üstüne
  taştı — canlıda CRM raporunun "Müşteri başına" ve "Kaybedilen"
  kutularında görüldü.

  Artık eksen etiketi yalnızca `eksen` verildiğinde çiziliyor. `ad`
  tam adı taşımaya devam ediyor: ipucunda ve ekran okuyucuda eksiksiz
  görünüyor, kutuda yer kaplamıyor. Uzunluğa bakan bir tahmin
  yazılmadı — "kaç karakter sığar" sorusunun doğru cevabı yok,
  etiketin anlamlı olup olmadığına çağıran karar veriyor.
*/
export type SeriNoktasi = {
  /** Tam ad: ipucu ve ekran okuyucu. */
  ad: string;
  /** Çubuğun altındaki kısa etiket; verilmezse yazılmıyor. */
  eksen?: string;
  deger: number;
  /** Biçimlenmiş değer (ipucunda görünür). */
  etiket: string;
  simdiki?: boolean;
};
export type Grafik =
  | { tur: "cubuk"; seri: SeriNoktasi[] }
  | { tur: "halka"; oran: number | null; altyazi: string }
  | { tur: "gosterge"; oran: number }
  /*
    YIĞIN GRAFİĞİNDE BİÇİM ZORUNLU (2026-10-24). Değer her zaman
    `money()` ile yazılıyordu; grafik önce yalnızca para için
    kullanıldığı için fark edilmiyordu. Sayı taşıyan kutularda
    (tekrar eden müşteri, yanıtlanan teklif, aktif personel) 25 kişi
    ekranda **₺0** görünüyordu — money() kuruş bekliyor.
    Biçim isteğe bağlı olsaydı aynı hata sessizce geri gelirdi.
  */
  | { tur: "yigin"; bicim: "para" | "sayi"; parcalar: { ad: string; deger: number; ton: Tone }[] }
  | { tur: "selale"; adimlar: { ad: string; deger: number; ton: Tone }[] }
  /*
    DURUM ŞERİDİ (2026-10-24). "Bu dönem ne söylüyor?" kartının
    konusu rakam değil, DÖRT YARGIDAN her birinin iyi mi kötü mü
    olduğu; çubuk ya da halka bunu anlatamıyor. Şerit dört noktayı
    tonlarıyla gösteriyor — bakışta "bir uyarı, iki iyi, bir bilgi"
    okunuyor.
  */
  | { tur: "durum"; noktalar: { ad: string; ton: Tone }[] };
export type Widget = { label: string; value: string; note: string; icon: IkonAdi; tone: Tone; toned?: boolean; grafik: Grafik };
export type LedgerRow = { label: string; hint: string; amount: string; share: number | null; tone: Tone };

/* Record<IkonAdi, …>: eksik bir çizim ya da listede olmayan bir ad
   derleme hatası (lib/rapor-ikonlari). */
const iconPaths: Record<IkonAdi, ReactNode> = {
  inbox: <><path d="M3 13h5l1.5 3h5L16 13h5" /><path d="M5.5 5h13L21 13v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-5Z" /></>,
  chat: <><path d="M20 12a8 8 0 0 1-11.6 7.1L4 20l1-4.1A8 8 0 1 1 20 12Z" /></>,
  badge: <><circle cx="12" cy="12" r="9" /><path d="m8.5 12.3 2.4 2.4 4.7-5" /></>,
  doc: <><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z" /><path d="M14 3v5h5" /><path d="M9 13h6" /><path d="M9 17h4" /></>,
  seal: <><path d="M12 3.5 14.2 5l2.6-.2.9 2.5 2.2 1.4-.8 2.5.8 2.5-2.2 1.4-.9 2.5-2.6-.2L12 20.5 9.8 19l-2.6.2-.9-2.5-2.2-1.4.8-2.5-.8-2.5 2.2-1.4.9-2.5 2.6.2Z" /><path d="m9.2 12.2 2 2 3.7-4" /></>,
  spark: <><path d="M4 16.5 9 11l3.5 3.5L20 7" /><path d="M15 7h5v5" /></>,
  briefcase: <><rect x="3" y="7" width="18" height="13" rx="2.5" /><path d="M8.5 7V5.5A1.5 1.5 0 0 1 10 4h4a1.5 1.5 0 0 1 1.5 1.5V7" /><path d="M3 12.5h18" /></>,
  chart: <><path d="M4 20V10" /><path d="M10 20V4" /><path d="M16 20v-7" /><path d="M21 20H3" /></>,
  wallet: <><rect x="2.5" y="5.5" width="19" height="14" rx="2.5" /><path d="M16 12.5h2.5" /><path d="M2.5 9.5h19" /></>,
  flow: <><path d="M4 8h13" /><path d="m14 5 3 3-3 3" /><path d="M20 16H7" /><path d="m10 13-3 3 3 3" /></>,
  alert: <><path d="M10.3 4.2 2.6 17.5A2 2 0 0 0 4.3 20.5h15.4a2 2 0 0 0 1.7-3L13.7 4.2a2 2 0 0 0-3.4 0Z" /><path d="M12 9.5v4" /><path d="M12 17h.01" /></>,
  users: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0" /><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8" /><path d="M18 14.3a6.5 6.5 0 0 1 3.5 5.7" /></>,
  indir: <><path d="M12 4v10"/><path d="m8 11 4 4 4-4"/><path d="M5 19h14"/></>,
  heart: <><path d="M12 20s-7.5-4.4-7.5-10A4.3 4.3 0 0 1 12 7.3 4.3 4.3 0 0 1 19.5 10c0 5.6-7.5 10-7.5 10Z" /></>,
};
export function Icon({ name, size = 18 }: { name: IkonAdi; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {iconPaths[name]}
    </svg>
  );
}

export function MiniGrafik({ grafik }: { grafik: Grafik }) {
  if (grafik.tur === "cubuk") {
    const enBuyuk = Math.max(1, ...grafik.seri.map((n) => n.deger));
    /* Hiçbir noktada eksen etiketi yoksa çubuklar tam yüksekliği
       kullanıyor: etiket için ayrılan 16px boş yere duruyordu. */
    const eksenVar = grafik.seri.some((n) => n.eksen);
    return (
      <div
        className={`rpt-mini rpt-mini-cubuk${eksenVar ? "" : " is-eksensiz"}`}
        role="img"
        aria-label={grafik.seri.map((n) => `${n.ad} ${n.etiket}`).join(", ")}
      >
        {/* Anahtar sırayı da içeriyor: iki müşterinin adı aynı
            olabiliyor ve yalnızca ada dayanan anahtar çakışırdı. */}
        {grafik.seri.map((n, sira) => (
          <span key={`${n.ad}-${sira}`} className={n.simdiki ? "is-current" : undefined} title={`${n.ad}: ${n.etiket}`}>
            <i style={cssVar("--h", `${n.deger ? Math.max(8, (n.deger / enBuyuk) * 100) : 3}%`)} />
            {n.eksen ? <small>{n.eksen}</small> : null}
          </span>
        ))}
      </div>
    );
  }
  if (grafik.tur === "halka") {
    const cevre = 2 * Math.PI * 22;
    const oran = grafik.oran === null ? 0 : clampPercent(grafik.oran);
    return (
      <div className="rpt-mini rpt-mini-halka">
        <svg viewBox="0 0 56 56" width="56" height="56" aria-hidden="true">
          <circle className="rpt-halka-iz" cx="28" cy="28" r="22" />
          <circle className="rpt-halka-dolu" cx="28" cy="28" r="22" strokeDasharray={`${(oran / 100) * cevre} ${cevre}`} transform="rotate(-90 28 28)" />
          <text x="28" y="32" textAnchor="middle">{grafik.oran === null ? "—" : percent(grafik.oran)}</text>
        </svg>
        <span>{grafik.altyazi}</span>
      </div>
    );
  }
  if (grafik.tur === "gosterge") {
    const oran = clampPercent(grafik.oran);
    const uzunluk = Math.PI * 40;
    return (
      <div className="rpt-mini rpt-mini-gosterge" role="img" aria-label={`Dönüşüm ${percent(grafik.oran)}`}>
        <svg viewBox="0 0 100 56" width="100" height="56" aria-hidden="true">
          <path className="rpt-halka-iz" d="M10 50 A40 40 0 0 1 90 50" />
          <path className="rpt-halka-dolu" d="M10 50 A40 40 0 0 1 90 50" strokeDasharray={`${(oran / 100) * uzunluk} ${uzunluk}`} />
        </svg>
      </div>
    );
  }
  if (grafik.tur === "yigin") {
    const toplam = grafik.parcalar.reduce((t, p) => t + Math.max(0, p.deger), 0);
    return (
      <div className="rpt-mini rpt-mini-yigin">
        <div className="rpt-yigin-cubuk" aria-hidden="true">
          {toplam ? grafik.parcalar.map((p) => <i key={p.ad} data-tone={p.ton} style={cssVar("--w", `${(Math.max(0, p.deger) / toplam) * 100}%`)} />) : null}
        </div>
        <ul className="rpt-mini-lejant">
          {grafik.parcalar.map((p) => (
            <li key={p.ad} data-tone={p.ton}>
              <i />{p.ad} <b>{grafik.bicim === "para" ? money(p.deger) : p.deger}</b>
            </li>
          ))}
        </ul>
      </div>
    );
  }
  if (grafik.tur === "durum") {
    return (
      <div className="rpt-mini rpt-mini-durum" role="img" aria-label={grafik.noktalar.map((n) => n.ad).join(", ")}>
        {grafik.noktalar.map((n) => (
          <span key={n.ad} data-tone={n.ton} title={n.ad}><i /><small>{n.ad}</small></span>
        ))}
      </div>
    );
  }
  const taban = Math.max(1, ...grafik.adimlar.map((a) => Math.abs(a.deger)));
  return (
    <ul className="rpt-mini rpt-mini-selale">
      {grafik.adimlar.map((a) => (
        <li key={a.ad} data-tone={a.ton}>
          <span>{a.ad}</span>
          <span className="rpt-selale-iz"><i style={cssVar("--w", `${Math.max(a.deger ? 3 : 0, (Math.abs(a.deger) / taban) * 100)}%`)} /></span>
        </li>
      ))}
    </ul>
  );
}

/*
  KPI AYRINTISI (2026-10-24, kurum sahibinin önerisi).

  Kutudaki mini grafik ŞEKLİ gösteriyor, RAKAMI değil: altı aylık
  çubuklarda hangi ayın kaç olduğu okunmuyor, şelalenin adımları
  (tahsilat → maliyet → gider → kalan) minik bir çizimde kayboluyor.
  Pencere tam olarak o rakamları veriyor — yoksa rakamı büyütüp
  tekrar gösteren bir pencere olurdu ve kullanıcıya "tıklamaya değmez"
  dedirtirdi.
*/
export function WidgetDetay({ grafik, widget }: { grafik: Grafik; widget: Widget }) {
  if (grafik.tur === "cubuk") {
    const toplam = grafik.seri.reduce((sum, nokta) => sum + nokta.deger, 0);
    return <>
      <MiniGrafik grafik={grafik} />
      <table className="rpt-detay-tablo">
        <thead><tr><th>Ay</th><th>Değer</th></tr></thead>
        <tbody>
          {grafik.seri.map((nokta) => <tr key={nokta.ad} className={nokta.simdiki ? "is-current" : undefined}>
            <th scope="row">{nokta.ad}</th><td>{nokta.etiket}</td>
          </tr>)}
        </tbody>
        <tfoot><tr><th scope="row">Altı ay toplamı</th><td>{toplam}</td></tr></tfoot>
      </table>
    </>;
  }
  if (grafik.tur === "yigin" || grafik.tur === "selale") {
    const satirlar = grafik.tur === "yigin" ? grafik.parcalar : grafik.adimlar;
    return <>
      <MiniGrafik grafik={grafik} />
      <table className="rpt-detay-tablo">
        <tbody>
          {satirlar.map((satir) => <tr key={satir.ad} data-tone={satir.ton}>
            <th scope="row">{satir.ad}</th><td>{money(satir.deger)}</td>
          </tr>)}
        </tbody>
      </table>
    </>;
  }
  /* Oranlı kutular: pay ve payda zaten notta yazıyor, pencere onu
     büyük ve tek başına gösteriyor. Uydurma bir döküm eklenmedi. */
  return <>
    <MiniGrafik grafik={grafik} />
    <p className="rpt-detay-not">{widget.note}</p>
  </>;
}

/*
  ÖZET KARTI (2026-10-24).

  İlk hâlinde kart başlık + iki rakam + gri bir cümleden ibaretti ve
  kurum sahibi haklı olarak beğenmedi: üstte mini grafikli KPI
  kutuları dururken altta yalnızca sayı listesi kalıyordu, sayfa
  "pano" gibi değil "döküm" gibi okunuyordu.

  Her kart artık KENDİ VERİSİNİN İMZASINI taşıyor ve imza süs değil:
  huni daralan çubuklarla, kârlılık maliyet/kâr yığınıyla, kayıp
  sebepleri kendi çubuklarıyla, dönem yorumu dört yargının tonuyla
  görünüyor. Bakışta işin ŞEKLİ okunuyor, rakam pencerede.

  Grafik dili yeniden icat edilmedi: KPI kutularının kullandığı
  MiniGrafik'in aynısı. Tek eklenen tür "durum" şeridi.

  KARTIN TAMAMI TIKLANABİLİR — küçük bir "Ayrıntı" hapı yerine, KPI
  kutularıyla aynı kalıp (üste serili etiketli düğme). Tek bir
  etkileşim dili: panoda her şey tıklanır, ayrıntı pencerede açılır.
*/
export function OzetKart({
  baslik, altyazi, kicker, sayilar, grafik, cumle, genis, ton, children,
}: {
  baslik: string; altyazi: string; kicker: string;
  sayilar: { deger: string; etiket: string; ton?: Tone }[];
  grafik: Grafik; cumle: string; genis?: boolean; ton: Tone; children: ReactNode;
}) {
  return (
    <article className="rpt-card rpt-kart-ozet" data-tone={ton}>
      <header className="rpt-card-head">
        <div><h2>{baslik}</h2><p>{altyazi}</p></div>
      </header>
      <div className="rpt-ozet-sayilar">
        {sayilar.map((sayi) => (
          <div key={sayi.etiket} data-tone={sayi.ton}>
            <strong>{sayi.deger}</strong><span>{sayi.etiket}</span>
          </div>
        ))}
      </div>
      <MiniGrafik grafik={grafik} />
      <p className="rpt-kart-cumle">{cumle}</p>
      <PanelDrawer
        triggerLabel={`${baslik} ayrıntısı`}
        triggerClassName="rpt-kart-ac"
        kicker={kicker}
        title={baslik}
        description={altyazi}
        genis={genis}
      >
        {children}
      </PanelDrawer>
    </article>
  );
}

export function WidgetCard({ widget }: { widget: Widget }) {
  return (
    <article className="rpt-widget" data-tone={widget.tone}>
      <header className="rpt-widget-bas">
        <span className="rpt-widget-icon"><Icon name={widget.icon} /></span>
        <small>{widget.label}</small>
      </header>
      <strong className={widget.toned ? "is-toned" : undefined}>{widget.value}</strong>
      <MiniGrafik grafik={widget.grafik} />
      <span className="rpt-widget-note">{widget.note}</span>
      {/*
        Kutunun TAMAMI tıklanabilir ama düğme kutunun İÇİNDE, üstüne
        serilmiş durumda. Kutuyu düğmenin içine koymak geçersiz HTML
        olurdu (button yalnızca metin düzeyi içerik alır) ve ekran
        okuyucuda grafik de düğme adının parçası olurdu. Bu kalıp
        depoda zaten var (crm satır tıklaması).
      */}
      <PanelDrawer
        triggerLabel={`${widget.label} ayrıntısı`}
        triggerClassName="rpt-widget-ac"
        kicker="KPI"
        title={widget.label}
        description={widget.note}
      >
        <WidgetDetay grafik={widget.grafik} widget={widget} />
      </PanelDrawer>
    </article>
  );
}

export function Ledger({ title, caption, rows, total }: { title: string; caption: string; rows: LedgerRow[]; total: LedgerRow }) {
  const shareCell = (row: LedgerRow) => (
    <td className="rpt-share">
      <span className="rpt-share-bar" data-tone={row.tone} aria-hidden="true"><i style={cssVar("--w", `${row.share === null ? 0 : clampPercent(row.share)}%`)} /></span>
      <span className="rpt-share-value">{row.share === null ? "—" : percent(row.share)}</span>
    </td>
  );
  return (
    <div className="rpt-ledger">
      <h3>{title}</h3>
      <div className="rpt-table-wrap">
        <table className="rpt-table">
          <caption>{caption}</caption>
          <thead><tr><th scope="col">Kalem</th><th scope="col">Pay</th><th scope="col" className="rpt-money">Tutar</th></tr></thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.label}>
                <th scope="row"><b>{row.label}</b><small>{row.hint}</small></th>
                {shareCell(row)}
                <td className="rpt-money">{row.amount}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr data-tone={total.tone}>
              <th scope="row"><b>{total.label}</b><small>{total.hint}</small></th>
              {shareCell(total)}
              <td className="rpt-money">{total.amount}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
