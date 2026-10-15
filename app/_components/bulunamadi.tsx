import Link from "next/link";
import "../bulunamadi.css";

/*
  Herkese açık 404 ekranı. Üç yerde kullanılıyor ve metni her birinde
  FARKLI: kök 404'ü yanlış adres yazan ziyaretçiye, belge 404'leri
  kurumun kendi müşterisine sesleniyor. Müşteriye "Arvo ana sayfasına
  git" demek yanlış olur — ona bağlantıyı Arvo değil, çalıştığı kurum
  gönderdi; o yüzden eylem isteğe bağlı.
*/
export function Bulunamadi({
  ust,
  baslik,
  aciklama,
  eylem,
}: {
  ust: string;
  baslik: string;
  aciklama: string;
  eylem?: { href: string; etiket: string };
}) {
  return (
    <main className="bul-shell">
      <section className="bul-kart">
        <span className="bul-isaret" aria-hidden="true" />
        <small className="bul-ust">{ust}</small>
        <h1>{baslik}</h1>
        <p>{aciklama}</p>
        {eylem ? (
          <Link className="bul-eylem" href={eylem.href}>
            {eylem.etiket}
          </Link>
        ) : null}
      </section>
    </main>
  );
}
