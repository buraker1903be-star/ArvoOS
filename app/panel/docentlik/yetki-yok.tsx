/*
  Yetkisi olmayan kişiye gösterilen kapalı durum (PR6b). Veri OKUNMADAN
  çiziliyor: sayfa önce yetkiyi soruyor, yoksa hiçbir okuma yapmıyor.
  Hata ekranı ("Bir sorun oluştu") yerine anlaşılır bir cümle; kimin
  açabileceği de yazıyor — kurum Ayarlar → Yetkilendirme'den verir.
*/
export function YetkiYok({ bolum, anahtar }: { bolum: string; anahtar: string }) {
  return (
    <section className="panel-card docentlik-kart" role="status">
      <div className="panel-empty docentlik-bos">
        <b>{bolum} için yetkiniz yok</b>
        <p>Bu bölüm “{anahtar}” yetkisi verilmiş kişilere açık. Kurum sahibiniz Ayarlar → Yetkilendirme ekranından verebilir.</p>
      </div>
    </section>
  );
}
