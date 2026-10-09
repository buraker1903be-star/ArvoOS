import { redirect } from "next/navigation";

/*
  Eski personel hareketleri sayfası (2026-10'a kadar): oturum geçmişi artık
  personel detayındaki "Hareketler" sekmesinde; anlık durum İK Genel
  Bakış'taki "Son görülenler" kartında ve ekip listesinde.
*/
export default function EskiHareketSayfasi() {
  redirect("/panel/hr");
}
