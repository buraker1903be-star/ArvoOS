import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { donemDegisimi, type GunlukSeri } from "@/lib/gunluk-seri";
import { TamMetinDugmesi } from "./tam-metin-dugmesi";
import "../dashboard.css";

/*
  GENEL BAKIŞ ŞABLONU (2026-10).

  Kurum sahibinin ana ekran için çizdiği düzen bütün modüllerin genel
  bakış sayfasının şablonu: (ana ekranda selamlama) · tam genişlikte bir grafik kartı ·
  altında yan yana dört liste kartı, her biri en fazla 6 satır ve kendi
  sayfasına bağlantı. Tek ekrana sığar (dashboard.css, .dash-v2).

  Ana ekran (app/panel/page.tsx) ve modül genel bakışları bu parçaları
  kullanır; düzen tek yerde değişir.
*/

export const GENEL_BAKIS_SATIR = 6;

export function GenelBakis({ baslik, gizliBaslik, ust, uyari, sinif, children }: {
  /* sinif="dash-sabit": sayfa kaymaz, kartlar kalan yüksekliği paylaşır
     (os/gorunum-secici.tsx ile; dashboard.css). */
  /** Görünen başlık (ana ekranda selamlama). Modül genel bakışlarında yok. */
  baslik?: ReactNode;
  /*
    Modül genel bakışlarında görünür başlık, düğmeler ve sekme çubuğu yok
    (kurum sahibinin isteği, 2026-10): uygulamanın adı durum çubuğunda,
    bölümler dock'un ikinci katında. Ekran okuyucu için sayfa başlığı
    yine verilir.
  */
  gizliBaslik?: string;
  /** Başlığın üstündeki küçük etiket; ana ekranda telefonda tarih. */
  ust?: ReactNode;
  /** Okunamayan veriler için uyarı satırı. */
  uyari?: string[];
  /** Ek sınıf: kendi düzenini kuran ekranlar (ör. Analitik, tek ekrana sabit). */
  sinif?: string;
  children: ReactNode;
}) {
  return (
    <div className={sinif ? `dash dash-v2 ${sinif}` : "dash dash-v2"}>
      {baslik ? (
        <header className="dash-hero">
          <div>
            {ust ? <small className="panel-kicker">{ust}</small> : null}
            <h1>{baslik}</h1>
          </div>
        </header>
      ) : <h1 className="dash-gizli-baslik">{gizliBaslik}</h1>}
      {uyari?.length ? (
        <p className="dash-uyari" data-tone="danger" role="alert">
          <span aria-hidden="true"><Simge ad="alert" /></span>
          <span>
            <b>Bazı veriler okunamadı</b>
            <small>{uyari.join(", ")} yüklenemedi; aşağıdaki listeler eksik olabilir. Sorun sürerse destek kaydı açın.</small>
          </span>
        </p>
      ) : null}
      {children}
    </div>
  );
}

/** Tam genişlikte grafik: son 14 gün çubukları, toplam ve önceki döneme göre değişim. */
/** Grafik başlığındaki küçük özet (Finans genel bakış: bu ay tahsilat, tahsil oranı…). */
export type SeriOzeti = { ad: string; deger: string; ton?: string; href?: string };

export function SeriKarti({ baslik, alt, seri, birim = (n) => String(n), adet, href, ozet, bos, hata = false, eylem }: {
  baslik: string;
  alt: string;
  seri: GunlukSeri;
  /** Toplamın ve çubuk etiketinin biçimi (ör. para). */
  birim?: (deger: number) => string;
  /** Çubuk ipucundaki ad: "talep", "tahsilat"… */
  adet: string;
  href?: string;
  /* Başlığın ortasında birkaç rakam: ayrı bir satır yerine buraya, ki
     genel bakış ekrana sığmaya devam etsin. */
  ozet?: SeriOzeti[];
  /*
    Pencerede HİÇ kayıt yoksa çubukların yerine yazılan cümle
    (15.10.2026). On dört çubuğun hepsi sıfırken ızgara 190 piksel yer
    kaplayıp gri kütüklerden başka bir şey göstermiyordu — genel bakışın
    EN GENİŞ bloğu, hiçbir şey söylemeden. Sıfır bir cevaptır ama
    cevabın boyutu söylediği şey kadar olmalı.

    Başlık, özet rakamları ve toplam DURUYOR: onlar boşken de bilgi
    taşıyor. Değişen yalnızca çubuk ızgarası.

    Cümle çağırandan geliyor: "tahsilat yok" ile "talep yok" farklı
    şeyler ve ikisinin de ne zaman dolacağı farklı. Verilmezse eski
    davranış sürüyor.
  */
  bos?: string;
  /*
    Seri okunamadı (OS-02, 09.11.2026): eskiden boş diziden çizilip
    "0 · son 14 günde talep yok" diyordu — okunamayan veri gerçek sıfırla
    aynı görünüyordu. Hata varken toplam "—", çubuklar yerine açıklama.
  */
  hata?: boolean;
  /*
    Boş durumda tek eylem (10.11.2026, ana ekran): çağıran yalnızca kişinin
    YAPABİLDİĞİ mevcut bir işleme götüren bağlantıyı verir; burada yetki
    hesaplanmaz. Hata durumunda gösterilmez — veri okunamadı, "boş" değil.
  */
  eylem?: { href: string; etiket: string };
}) {
  const bosSeri = !hata && Boolean(bos) && seri.total === 0 && seri.days.every((gun) => !gun.count);
  const degisim = donemDegisimi(seri, { adet, gun: seri.days.length, hata });
  const icerik = (
    <>
      <header className="dash-card-head">
        <div>
          <h2>{baslik}</h2>
          {/* Etiketteki aralık hesaplanan günlerin kendisi (OS-02). */}
          <p>{alt} · {seri.aralik}</p>
        </div>
        {ozet?.length ? (
          <dl className="dash-ozet">
            {ozet.map((o) => (
              <div key={o.ad} data-tone={o.ton}>
                <dt>{o.ad}</dt>
                <dd>{o.href ? <Link href={o.href}>{o.deger}</Link> : o.deger}</dd>
              </div>
            ))}
          </dl>
        ) : null}
        <div className="dash-stat">
          <strong>{hata ? "—" : birim(seri.total)}</strong>
          <span data-tone={degisim.ton} title={hata ? undefined : `Önceki dönem: ${seri.oncekiAralik} · ${birim(seri.previous)} ${adet}`}>{degisim.metin}</span>
        </div>
      </header>
      {hata ? <p className="dash-seri-bos">{baslik} yüklenemedi. Sayfayı yenileyin; sorun sürerse destek kaydı açın.</p> : bosSeri ? (
        <div className="dash-seri-bos">
          <p>{bos}</p>
          {eylem ? <Link className="dash-bos-eylem" href={eylem.href}>{eylem.etiket}</Link> : null}
        </div>
      ) : (
      <div className="dash-bars" role="img" aria-label={`${alt}: toplam ${birim(seri.total)} ${adet}`}>
        {seri.days.map((gun) => (
          <div className={`dash-bar${gun.isToday ? " is-today" : ""}${gun.count ? "" : " is-empty"}`} key={gun.key} title={`${gun.title}: ${birim(gun.count)} ${adet}`}>
            <span className="dash-bar-value">{gun.count ? birim(gun.count) : ""}</span>
            <span className="dash-bar-fill" style={{ "--h": `${gun.count ? Math.max(10, (gun.count / seri.max) * 100) : 4}%` } as CSSProperties} />
            <small>{gun.day}</small>
          </div>
        ))}
      </div>
      )}
    </>
  );
  return (
    <article className="dash-card dash-chart">
      {icerik}
      {href ? <Link className="dash-card-link" href={href}>Ayrıntılar <Chevron /></Link> : null}
    </article>
  );
}

/** Liste kartı: başlık, alt başlık, liste (ya da gruplar) ya da boş/hata durumu, alt bağlantı. */
export type ListeGrubu = { anahtar: string; baslik: string; ton?: "danger" | "neutral"; satirlar: ReactNode[] };

export function ListeKarti({ baslik, alt, bos, href, hrefEtiket, sayi, hata = false, gruplar, not, children }: {
  baslik: string;
  alt: string;
  bos: string;
  href?: string;
  hrefEtiket?: string;
  sayi: number;
  /*
    Okuma hatası (10.11.2026): eskiden sorgu düşünce kart boş cümlesini
    ("Açık operasyon yok.") yazıyordu; sayfanın üstündeki uyarı satırı
    olsa da kartın kendisi "yok" diyordu — okunamayan veri gerçek
    boşlukla aynı görünüyordu. Hata varken boş cümlesi değil hata yazılır.
  */
  hata?: boolean;
  /*
    Satırlar başlıklı gruplara bölünebilir (ana ekran: Gecikmiş / Yaklaşan).
    Boş grup çizilmez. Verilirse children kullanılmaz.
  */
  gruplar?: ListeGrubu[];
  /** Listenin altında kısa açıklama (ör. yalnızca ilk N satırın gösterildiği). */
  not?: string;
  children?: ReactNode;
}) {
  const doluGruplar = gruplar?.filter((g) => g.satirlar.length) ?? [];
  return (
    <article className="dash-card dash-col">
      <header className="dash-card-head"><div><h2>{baslik}</h2><p>{alt}</p></div></header>
      {/* Gövde: sabit yükseklikli genel bakışta (dashboard.css · .dash-cols--sabit)
          kartın TEK kaydırma alanı; başlık ve alt bağlantı yerinde kalır. */}
      <div className="dash-col-govde">
      {hata ? (
        <p className="dash-empty dash-empty--hata" role="status">{baslik} yüklenemedi. Sayfayı yenileyin; sorun sürerse destek kaydı açın.</p>
      ) : !sayi ? (
        <p className="dash-empty">{bos}</p>
      ) : doluGruplar.length ? (
        doluGruplar.map((g) => (
          <section key={g.anahtar} className="dash-col-grup" aria-label={`${baslik}: ${g.baslik}`}>
            <h3 data-tone={g.ton}>{g.baslik} <span>{g.satirlar.length}</span></h3>
            <ul className="dash-col-list">{g.satirlar}</ul>
          </section>
        ))
      ) : (
        <ul className="dash-col-list">{children}</ul>
      )}
      {not && sayi && !hata ? <p className="dash-col-not">{not}</p> : null}
      </div>
      {href ? <Link className="dash-card-link" href={href}>{hrefEtiket} <Chevron /></Link> : null}
    </article>
  );
}

/*
  Liste ızgarası. Varsayılan: dört sütun, kartlar eşit boy (modül genel
  bakışları, "tek ekrana sığar" kuralı). `esnek` (10.11.2026, ana ekran):
  sütun sayısı genişliğe göre (kart en az ~340px), kartlar içerikleri
  kadar uzun, başlıklar iki satıra kadar. Dört eşit dar sütunda rozetli
  satırda ada 150px kalıyor ve iş/müşteri adı kesiliyordu; boş kart da
  en uzun kardeşinin boyuna çekilip ortasında tek cümle yüzüyordu.
*/
export function ListeIzgarasi({ children, etiket = "Güncel işler", esnek = false }: { children: ReactNode; etiket?: string; esnek?: boolean }) {
  return <section className={esnek ? "dash-cols dash-cols--esnek" : "dash-cols"} aria-label={etiket}>{children}</section>;
}

/*
  Liste satırı. "yeni": son birkaç dakikada gelen kayıt kurum renginde
  belirir (anlık tazeleme); "okunmamis": kalın ad ve nokta.
*/
export function ListeSatiri({ href, baslik, baslikIpucu, alt, onizleme, sag, zaman, okunmamis, yeni }: {
  href: string;
  baslik: ReactNode;
  baslikIpucu?: string;
  alt?: ReactNode;
  /** Alt satır bir mesaj önizlemesiyse (tek satıra kırpılır). */
  onizleme?: boolean;
  /** Sağdaki rozet (status-pill) ya da tutar. */
  sag?: ReactNode;
  /** Sağ üstte göreli zaman ("3 gün önce"). */
  zaman?: string;
  okunmamis?: boolean;
  yeni?: boolean;
}) {
  const sinif = [okunmamis ? "is-unread" : "", yeni ? "is-new" : ""].filter(Boolean).join(" ") || undefined;
  return (
    <li className={sinif}>
      <Link className="dash-col-row" href={href}>
        <span className="dash-col-main">
          <b title={baslikIpucu}>{baslik}</b>
          {alt ? <small className={onizleme ? "dash-col-preview" : undefined}>{alt}</small> : null}
        </span>
        {sag}
        {zaman ? <small className="dash-col-time">{zaman}</small> : null}
        {/*
          SAĞI BOŞ KALAN SATIRA OK (15.10.2026, kurum sahibinin isteği).

          Pano satırlarının hepsi bağlantı ama hiçbiri bunu göstermiyordu.
          Rozeti ya da zamanı olan satırda sağ uç zaten dolu ve bakış
          oraya gidiyor; sağı boş kalan satır ise düz metin gibi duruyor
          ve dokunulabilir olduğunu söylemiyordu. Konsolun liste satırı
          (konsol-ui, k-ios) aynı kuralı kullanıyor: bağlantı var ve sağda
          özel bir içerik yoksa ok çizilir.

          Bugün bu yalnızca ana sayfadaki "Bölümler" kartına denk geliyor
          — ürünün tamamında sağı boş olan tek satır tipi o. Kural satır
          bileşeninde olduğu için sonra eklenen her gezinti satırı da
          kendiliğinden aynı işareti alır.
        */}
        {!sag && !zaman ? <Chevron /> : null}
      </Link>
      {/* Kısaltılmış adın tamamı dokunmayla da açılır; bağlantının dışında (NAV-01). */}
      <TamMetinDugmesi />
    </li>
  );
}

const Chevron = () => (
  <svg className="dash-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6" /></svg>
);

function Simge({ ad }: { ad: "alert" }) {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {ad === "alert" ? <><path d="M10.3 4.2 2.6 17.5A2 2 0 0 0 4.3 20.5h15.4a2 2 0 0 0 1.7-3L13.7 4.2a2 2 0 0 0-3.4 0Z" /><path d="M12 9.5v4" /><path d="M12 17h.01" /></> : null}
    </svg>
  );
}

/** Son 3 dakikadaki kayıt "yeni" sayılır. Saat bileşen gövdesinde okunmaz. */
export const yeniMi = (zaman: string | null | undefined) => Boolean(zaman) && Date.now() - Date.parse(zaman!) < 3 * 60_000;
/** Grafik penceresi: son 28 gün (14 gün + önceki 14 günle kıyas). */
export const seriBaslangici = (gun = 14) => new Date(Date.now() - 2 * gun * 24 * 60 * 60 * 1000).toISOString();
export const simdi = () => Date.now();
