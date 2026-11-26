import Link from "next/link";

/*
  ÖNCELİKLİ İŞLER (26.11.2026, onaylı mockup).

  Kuyruğun kendisi "Bugünün işleri" kartında ve ONAY ORADA YAPILIYOR:
  bu kart onun yerine geçmez, ürün kırılımıyla kısa bir liste verir ve
  her satır İLGİLİ KAYDA açılır. Yetki ve onay akışı değişmedi —
  satırlar kuyruğun zaten okuduğu, çağıranın yetkisiyle gelen
  kayıtlardan türüyor; bu kart yeni bir sorgu açmıyor.

  Kaydı okunamayan bir kuyruk "iş yok" diye gösterilmez: sayısı
  bilinmeyen kalem ayrı bir satırla söylenir.
*/
export type OncelikliIs = {
  anahtar: string;
  /** Ürün adı; ürüne bağlı olmayan işte boş bırakılır. */
  urun?: string;
  baslik: string;
  alt?: string;
  href: string;
  eylem?: string;
};

export function OncelikliIslerKarti({ isler, okunamayan }: { isler: OncelikliIs[]; okunamayan: string[] }) {
  return (
    <article className="dash-card dash-col kup-kart">
      <header className="dash-card-head">
        <div>
          <h2>Öncelikli işler</h2>
          <p>Bekleyen kalemler; satır ilgili kayda açılır</p>
        </div>
      </header>
      <div className="dash-col-govde">
        {isler.length ? (
          <ul className="dash-col-list koi-liste">
            {isler.map((is) => (
              <li key={is.anahtar}>
                <Link href={is.href}>
                  <span className="pu-govde">
                    <b>{is.urun ? <><span className="koi-urun">{is.urun}</span> · </> : null}{is.baslik}</b>
                    {is.alt ? <small>{is.alt}</small> : null}
                  </span>
                  <span className="koi-eylem">{is.eylem ?? "İncele"}</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="pu-bos">Bekleyen iş yok.</p>
        )}
        {okunamayan.length ? (
          <p className="pu-bos" data-tone="danger">
            {okunamayan.join(", ")} okunamadı; bu kalemler listede eksik olabilir.
          </p>
        ) : null}
      </div>
      <Link className="dash-card-link" href="#bugunun-isleri">Bugünün işleri</Link>
    </article>
  );
}
