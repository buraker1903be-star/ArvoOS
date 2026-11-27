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
