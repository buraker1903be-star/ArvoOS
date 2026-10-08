/*
  Müşteri portalından gelen mesajın gönderen adı.

  Portal mesajı kaydederken sender_name'e müşterinin adını değil düz
  "Müşteri" yazıyor. Eskiden ana ekran ve operasyon genel bakışı önce
  sender_name'e bakıyordu; dolu olduğu için müşterinin adına hiç
  düşmüyor, her mesaj "Müşteri" diye görünüyordu (sözleşme sayfası bu
  yüzden adı zaten müşteri kaydından alıyordu).

  Kural: işin/sözleşmenin müşteri adı; yoksa genel olmayan bir gönderen
  adı; o da yoksa "Müşteri".
*/
const GENEL_ADLAR = new Set(["müşteri", "musteri", "customer", ""]);

export function musteriMesajGondereni(musteriAdi: string | null | undefined, gonderenAdi: string | null | undefined): string {
  const musteri = (musteriAdi ?? "").trim();
  if (musteri) return musteri;
  const gonderen = (gonderenAdi ?? "").trim();
  if (!GENEL_ADLAR.has(gonderen.toLocaleLowerCase("tr"))) return gonderen;
  return "Müşteri";
}
