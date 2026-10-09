import { redirect } from "next/navigation";

/*
  Eski gizlilik sözleşmeleri arşivi (2026-10'a kadar): sözleşme artık her
  personelin özlük dosyasında (personel detayı, sağ sütun); imzasızlar
  İK Genel Bakış'taki "Gizlilik sözleşmesi eksik" kartında.
*/
export default function EskiGizlilikSayfasi() {
  redirect("/panel/hr");
}
