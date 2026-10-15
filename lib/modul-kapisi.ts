import { redirect } from "next/navigation";

/*
  SAYFA KAPISI: KAPALI MODÜL ÇÖKME DEĞİLDİR.

  Sayfalar kapıyı `throw new Error("… erişiminiz yok")` ile tutuyordu.
  Next bunu hata sınırına düşürüyor ve üretimde mesajı soyuyor; kullanıcı
  "İŞLEM TAMAMLANAMADI · Bir sorun oluştu · Hata kodu: 3223241041"
  görüyordu. Sebebi söylemeyen bir ekran, ürünün bozulduğu izlenimi
  bırakıyor — oysa olan şey "bu modül sizde kapalı" (16.10.2026,
  başlangıç paketindeki bir kurumda Finans → Raporlar'da görüldü).

  Yönlendirme, fırlatmanın yerine geçiyor: /panel/modul-kapali hangi
  modülün kapalı olduğunu, kimin açabileceğini ve pakette hangi
  modüllerin açık olduğunu yazıyor.

  SUNUCU İŞLEMLERİ (actions) BU KAPIYI KULLANMAZ: orada fırlatmak doğru,
  çünkü işlem bir sayfa çizmiyor ve runPanelAction mesajı kullanıcıya
  bildirim olarak gösteriyor.
*/
type Modul = { code: string };

/** Modül kurumda kapalıysa açıklama ekranına yönlendirir. */
export function modulGerek(modules: readonly Modul[], kod: string): void {
  modulGerekKosullu(modules.some((m) => m.code === kod), kod);
}

/**
 * Kapı ölçütü tek bir koddan ibaret değilse (ör. Belge Merkezi
 * "documents YA DA crm" istiyor, Mesajlar kodu normalleştiriyor)
 * koşul çağırandan gelir; `kod` yalnızca ekranda yazacak adı seçer.
 */
export function modulGerekKosullu(acikMi: boolean, kod: string): void {
  if (!acikMi) redirect(`/panel/modul-kapali?modul=${encodeURIComponent(kod)}`);
}

/**
 * Modül açık ama rolün yeteneği yoksa: aynı ekran, "yetki" sebebiyle.
 * `kod` yalnızca ekranda hangi bölümün adının yazılacağını seçiyor.
 */
export function yetkiGerek(izinVar: boolean, kod: string): void {
  if (!izinVar) redirect(`/panel/modul-kapali?modul=${encodeURIComponent(kod)}&sebep=yetki`);
}
