import Link from "next/link";
import { OsSimge } from "./os-icons";

/*
  ÜST ÇUBUKTA POSTA.

  Posta dock'tan kaldırılınca okunmamış sayısı hiçbir yerde görünmez
  oldu: kutuya yeni mesaj geldiğini anlamanın tek yolu posta ekranını
  açmaktı. Mesajlar ve bildirimler zaten burada duruyor; posta da aynı
  sıraya giriyor.

  Çekmece değil düz bağlantı: mesajlar ve bildirimler kısa kayıtlar,
  üstüne tıklayınca okunup kapatılıyor. Posta ise okunacak bir yazışma —
  dar bir çekmecede göstermek, kutuyu açmaktan daha zahmetli olurdu.

  Sayı KUTUNUN tamamı için, kişinin kendisine göre değil: kutu ortak, bir
  konuşmayı kim açarsa ekibin tamamı için okundu oluyor.
*/
export function OsPostaDugmesi({ okunmamis }: { okunmamis: number }) {
  return (
    <Link
      className="panel-icon-button os-posta-dugmesi"
      href="/panel/posta"
      aria-label={okunmamis ? `Posta, ${okunmamis} okunmamış` : "Posta"}
      title="Posta"
    >
      <OsSimge ad="posta" />
      {okunmamis ? <b className="os-bar-badge">{okunmamis > 99 ? "99+" : okunmamis}</b> : null}
    </Link>
  );
}
