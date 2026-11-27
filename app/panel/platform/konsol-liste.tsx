import Link from "next/link";
import type { ReactNode } from "react";
import type { StgTone } from "../settings/settings-ui";
import "./konsol-liste.css";

/*
  KONSOLUN ORTAK LİSTE–PANEL DÜZENİ (27.11.2026, onaylı tasarım).

  Onaylı referans Müşteriler ekranı: solda gezinme, ortada liste,
  sağda SEÇİLİ KAYIT. Aynı düzen Finans (ödeme onayları), Destek
  (görüşme) ve öteki liste ekranlarında da kullanılacak — bu yüzden
  tek bileşen.

  SEÇİM ADRESTE (`?secili=<id>`). İstemci durumu YOK; bunun üç
  karşılığı var ve üçü de briefte isteniyor:
    - detay adresi paylaşılabilir,
    - yenileme aynı kaydı getirir,
    - tarayıcı geri/ileri liste ile detay arasında gezer.
  Süzgeçler ve sıralama aynı adreste durduğu için kayıttan kayda
  geçerken liste bağlamı da kaybolmuyor.

  TELEFONDA TEK SÜTUN. Kayıt seçiliyken liste gizlenir, detay tam
  genişlikte açılır ve başında listeye dönüş düğmesi olur; dönüş
  seçimi adresten düşürür, süzgeçleri korur. İki sütunu 390 px'e
  sıkıştırmak ikisini de okunmaz yapıyordu.

  SEÇİLİ KAYIT YOKSA panel bir boş durum gösterir — kart kabuğu
  boş durmaz. Kayıt silinmiş, erişilemez ya da süzgecin dışında
  kaldıysa çağıran taraf `bulunamadi` veriyor: "kayıt yok" ile
  "bu süzgeçte yok" aynı şey değil.
*/

/*
  DÜZENİN İŞARETLEMESİ SAYFADA, SÖZLEŞMESİ BU CSS'TE. Prop tabanlı bir
  sarmalayıcı denendi ve her ekranın listesini/panelini dev JSX
  prop'larına sokmak gerekti; üç satırlık bir ızgarayı bileşene
  kapatmanın kazancı yok. Sayfalar şu iskeleti kullanıyor:

    <div className="kl-duzen" data-secim={secimVar ? "var" : "yok"}>
      <section className="kl-liste">
        …araç çubuğu…
        <div className="kl-liste-govde">…satırlar…</div>
      </section>
      <aside className="kl-panel">
        {secimVar ? <Link className="kl-geri" …>‹ Listeye dön</Link> : null}
        …panel ya da boş durum…
      </aside>
    </div>

  `data-secim` telefonda hangi sütunun görüneceğini belirliyor;
  `kl-geri` yalnızca telefonda çiziliyor.
*/

/** Sağ panelin boş/uyarı durumu. Tek yerde: her ekran aynı görünsün. */
export function KonsolPanelBos({ baslik, aciklama, ton, eylem }: {
  baslik: string;
  aciklama: string;
  /** "uyari": kayıt vardı ama artık erişilemiyor. */
  ton?: "notr" | "uyari";
  eylem?: ReactNode;
}) {
  return (
    <div className="kl-panel-bos" data-tone={ton ?? "notr"}>
      <p className="kl-panel-bos-baslik">{baslik}</p>
      <p className="kl-panel-bos-aciklama">{aciklama}</p>
      {eylem}
    </div>
  );
}

/*
  PANEL BAŞLIĞI: ad, durum ve kapat. Kapat masaüstünde de var —
  kullanıcı paneli kapatıp listeyi tam genişlikte görebilmeli
  (onaylı tasarımda sağ üstte ×).
*/
export function KonsolPanelBas({ baslik, durum, kapatAdresi, altBilgi }: {
  baslik: string;
  /*
    TON PANELİN KENDİ LİSTESİ DEĞİL, PANELİN DİLİ. Konsolun durum
    tonları tek yerde (settings-ui · StgTone) ve ödeme durumları da
    onu kullanıyor; paneli dar bir listeye bağlamak çağıranı tip
    dönüşümüne zorluyordu. CSS bilmediği bir tonu nötr çiziyor.
  */
  durum?: { etiket: string; ton: StgTone };
  kapatAdresi: string;
  altBilgi?: ReactNode;
}) {
  return (
    <header className="kl-panel-bas">
      <div className="kl-panel-bas-metin">
        <h2>{baslik}</h2>
        {durum ? <p className="kl-panel-durum" data-tone={durum.ton}>{durum.etiket}</p> : null}
        {altBilgi}
      </div>
      <Link className="kl-panel-kapat" href={kapatAdresi} aria-label="Paneli kapat">×</Link>
    </header>
  );
}

/*
  PANEL SEKMELERİ. Ürün detayındaki şeridin (urd-serit) aynı
  görünümü: ince alt çizgi, seçilide 2 px vurgu. Orada TalepAkis
  kullanılıyor; burada sekmeler ADRESTE olduğu için bağlantı.
*/
export function KonsolPanelSekmeleri({ sekmeler, etkin }: {
  sekmeler: { anahtar: string; etiket: string; adres: string }[];
  etkin: string;
}) {
  return (
    <nav className="kl-panel-sekmeler" aria-label="Kayıt bölümleri">
      {sekmeler.map((s) => (
        <Link key={s.anahtar} href={s.adres}
          className={s.anahtar === etkin ? "is-active" : undefined}
          aria-current={s.anahtar === etkin ? "page" : undefined}>
          {s.etiket}
        </Link>
      ))}
    </nav>
  );
}

/** Panelin alan–değer listesi (onaylı tasarımdaki "Genel Bilgiler"). */
export function KonsolPanelAlanlar({ alanlar }: {
  alanlar: { ad: string; deger: ReactNode }[];
}) {
  return (
    <dl className="kl-panel-alanlar">
      {alanlar.map((a) => (
        <div key={a.ad}>
          <dt>{a.ad}</dt>
          <dd>{a.deger}</dd>
        </div>
      ))}
    </dl>
  );
}

/*
  BİRİNCİL ARAÇ SATIRI (27.11.2026 ara kontrolü).

  Onaylı tasarımda listeye hemen ulaşılıyor. Müşteriler'de üst etiket
  ("MÜŞTERİLER") başlığı, başlık altındaki sayılar da özet şeridini
  tekrar ediyordu; şeritteki tür sayaçları ÜÇÜNCÜ kez araç satırındaki
  sekmelerde vardı. Üçü birden ekranın ilk 460 pikselini yiyor, liste
  katlanmanın altına düşüyordu.

  Kural: araç satırında yalnızca HER GÜN kullanılanlar — arama, tür
  sekmeleri ve ekranın birincil eylemi. Geri kalan süzgeçler
  "Filtreler" altında; ETKİN olanlar çip olarak görünür kalıyor, yoksa
  kapalı bir kutunun arkasında listeyi daraltan bir süzgeç unutuluyor.
*/
export function KonsolArac({ segment, ara, filtreler, eylem }: {
  /** Sık kullanılan süzgeç: bağlantılardan oluşan sekme rayı. */
  segment?: ReactNode;
  /** Arama kutusu ve gizli alanlar — kendi formunu taşır. */
  ara?: ReactNode;
  /** "Filtreler" altına girecek alanlar. Aynı formda olmalı. */
  filtreler?: ReactNode;
  /** Ekranın birincil eylemi (Yeni müşteri gibi). */
  eylem?: ReactNode;
  /** Açık süzgeç sayısı; sıfırsa rozet çizilmiyor. */
  etkinSayisi?: number;
}) {
  return (
    /* `ek-arac` de taşınıyor: tür sekmelerinin (ek-segment) biçimi
       hr.css'te o atanın altına yazılı ve sekmeler onsuz düz yazıya
       dönüyordu. */
    <div className="kl-arac ek-arac">
      {segment}
      {ara}
      {filtreler}
      {eylem ? <div className="kl-arac-eylem">{eylem}</div> : null}
    </div>
  );
}

/**
 * "Filtreler" kutusu.
 *
 * AÇIKLIK ADRESTE (`?filtre=1`), istemci durumunda değil — ekranın
 * geri kalanıyla aynı kural. `<details>` denendi ve iki ayrı yoldan
 * düştü: kendi kutusu içinde açılınca gövde dar bir sütuna sıkışıyor,
 * `display:contents` ile satıra yayılınca da tarayıcı kapalı gövdeyi
 * ARTIK GİZLEMİYOR (ölçüldü: kapalıyken yükseklik 186 px).
 *
 * Alanlar KAPALIYKEN DE forma dahil (`hidden` bir kapsayıcı içindeler;
 * gizli alanlar da gönderilir): açık bir süzgeç kutu kapalıyken de
 * uygulanmaya devam ediyor — çipler bunun için var.
 */
export function KonsolFiltreler({ etkinSayisi, acik, degistirAdresi, children }: {
  etkinSayisi: number;
  acik: boolean;
  /** Kutuyu açan/kapatan adres; süzgeçleri ve seçimi korur. */
  degistirAdresi: string;
  children: ReactNode;
}) {
  return (
    <>
      <Link className="panel-secondary kl-filtre-dugme" href={degistirAdresi} aria-expanded={acik}>
        Filtreler{etkinSayisi ? <span className="kl-filtre-rozet">{etkinSayisi}</span> : null}
      </Link>
      <div className="kl-filtre-govde" hidden={!acik}>{children}</div>
    </>
  );
}

/**
 * Etkin süzgeçlerin çipleri. Her çip kendi süzgecini kaldıran bir
 * bağlantı: süzgeci kaldırmak için kutuyu açıp "Bütün …"i seçmek
 * gerekmiyor.
 */
export function KonsolEtkinFiltreler({ cipler, temizleAdresi }: {
  cipler: { ad: string; deger: string; adres: string }[];
  /** Hepsini birden kaldıran adres; seçim korunur. */
  temizleAdresi: string;
}) {
  if (!cipler.length) return null;
  return (
    <div className="kl-cipler" aria-label="Etkin filtreler">
      {cipler.map((c) => (
        <Link key={c.ad} className="kl-cip" href={c.adres}>
          <span className="kl-cip-ad">{c.ad}:</span> {c.deger}
          <span className="kl-cip-x" aria-hidden="true">×</span>
          <span className="kl-gizli">filtresini kaldır</span>
        </Link>
      ))}
      {cipler.length > 1 ? <Link className="kl-cip-hepsi" href={temizleAdresi}>Hepsini temizle</Link> : null}
    </div>
  );
}
