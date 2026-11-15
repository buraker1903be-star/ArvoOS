/*
  Panel bildirimini HEMEN yoklatır (app/panel/flash-toast.tsx dinliyor).

  runPanelAction sonucu çereze yazıyor; bildirim bileşeni çerezi bir form
  gönderiminden sonraki 15 saniye boyunca yokluyor. İstemciden ardışık
  çağrılan işlemler (doçentlik belgesi: hazırla → kovaya yükle → kaydet)
  bu pencereyi aşabiliyor ve geç gelen hata hiç görünmüyordu. İşlemin
  yanıtı geldiğinde bunu çağırmak, mesajı ne kadar geç gelirse gelsin
  gösterir. Sunucuda (window yokken) hiçbir şey yapmaz.
*/
export function panelBildiriminiYokla(): void {
  if (typeof window !== "undefined") window.dispatchEvent(new Event("arvo:flash-check"));
}
