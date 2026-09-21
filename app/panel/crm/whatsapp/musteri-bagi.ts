import { getPanelContext } from "@/lib/panel-context";
import { phoneKey, parseLookupQuery } from "../customer-history-keys";
import { searchCustomers, type CustomerLookupSummary } from "../customer-lookup-query";

/*
  WhatsApp sohbetini CRM kaydıyla eşleştirme.

  Gelen kutusunu CRM'e taşımanın asıl kazancı bu: yalnızca yer değiştirmiş
  olsaydı sohbet yine bağlamsız kalırdı. Numara bir talep ya da müşteri
  kaydındaki numarayla tutuyorsa, satışçı yazışmayı açtığı anda kiminle
  konuştuğunu ve elinde kaç teklif/sözleşme olduğunu görür.

  Eşleşme bulunamazsa hiçbir şey gösterilmez — "kayıt yok" yazmak her yeni
  numarada gereksiz gürültü olurdu; yeni numara zaten normaldir.
*/

/*
  Yalnızca özet döner, bağlantı değil: müşteri geçmişi ayrı bir sayfa değil,
  CRM sayfasındaki bir arama penceresi (customer-lookup.tsx). Kullanıcıyı
  oraya yollayacak bir adres olmadığı için bilgi satır içinde gösteriliyor.
*/
export type SohbetMusterisi = CustomerLookupSummary;

/**
 * Telefon numarasına karşılık gelen CRM müşterisi; yoksa null.
 *
 * Arama kurumun kendi kayıtlarında yapılır (searchCustomers yetkiyi
 * çağıranın rolüne göre daraltır), bu yüzden satış personeli yalnızca
 * görebildiği kayıtları eşleştirir.
 */
export async function sohbetMusterisi(telefon: string): Promise<SohbetMusterisi | null> {
  /*
    WhatsApp numarası ülke koduyla geliyor (905XXXXXXXXX), CRM kayıtları
    ise çoğunlukla 0'lı yerel biçimde. phoneKey ikisini de son on haneye
    indiriyor; eşleştirme bunun üzerinden yapılıyor.
  */
  const anahtar = phoneKey(telefon);
  if (anahtar.length < 10) return null;

  const sorgu = parseLookupQuery(anahtar);
  if (!sorgu || sorgu.mode !== "phone") return null;

  try {
    const context = await getPanelContext();
    const sonuc = await searchCustomers(context, sorgu, anahtar);
    // "benzer" eşleşmeler yanlış kişiyi gösterip yazışmayı başka
    // müşteriye bağlayabilirdi; yalnızca birebir numara kabul edilir.
    // Yalnızca numarası birebir tutan kayıt döner (yukarıdaki gerekçe).
    return sonuc.customers.find((aday) => aday.match === "phone") ?? null;
  } catch {
    // Eşleştirme bir kolaylık; başarısızlığı gelen kutusunu kapatmamalı.
    return null;
  }
}
