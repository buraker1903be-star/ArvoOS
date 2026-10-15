import Link from "next/link";

/*
  Panel içinde `notFound()` çağıran otuz kadar sayfa (silinmiş kayıt,
  yetkisi olmayan platform sayfası, bozuk kimlik) Next'in gömülü
  İngilizce 404'üne düşüyordu: menü, üst bar, tema — hepsi kayboluyor,
  kullanıcı panelden ATILMIŞ gibi oluyordu. Buradaki ekran panel
  yerleşiminin içinde çizilir, kabuk yerinde kalır.

  Biçim hata ekranıyla aynı (.panel-hata, panel-page-system.css):
  iki ekran da "sayfa gelmedi" diyor, farklı görünmelerinin bir
  gerekçesi yok.
*/
export default function PanelBulunamadi() {
  return (
    <section className="panel-card panel-hata">
      <small className="panel-kicker">SAYFA BULUNAMADI</small>
      <h1>Bu sayfa açılamıyor</h1>
      <p>
        Aradığınız kayıt silinmiş ya da bu sayfaya erişim yetkiniz olmayabilir.
        Adres doğruysa yöneticinizden yetki isteyin.
      </p>
      <div className="panel-page-actions">
        <Link className="panel-primary" href="/panel">
          Panele Dön
        </Link>
      </div>
    </section>
  );
}
