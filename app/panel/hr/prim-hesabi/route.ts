import { NextResponse, type NextRequest } from "next/server";

/*
  Eski prim sayfası (2026-10'a kadar): Prim Hesaplama ve Prim Hesabı
  personel detayındaki "Prim" penceresinde birleşti. Eski bağlantılar
  (yer imi, bildirim) seçili personelin penceresine, personel yoksa ekip
  listesine gider. /panel/hr/commissions da buraya bağlanıyor.

  Sayfa (page.tsx) değil route handler: vinext 0.0.50 sayfayı asıl
  çizimden önce arama parametreleri BOŞ olarak bir kez deniyor ve o
  denemede atılan redirect yanıt oluyor (entries/app-rsc-entry.js
  probePage, "searchParamsObject" diye var olmayan bir alanı okuyor).
  Sayfa olarak yazıldığında ?personel= hiç görülmüyor, herkes ekip
  listesine düşüyordu. Route handler bu denemeden geçmiyor.
*/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function GET(request: NextRequest) {
  const personel = request.nextUrl.searchParams.get("personel");
  const hedef = request.nextUrl.clone();
  hedef.search = "";
  if (personel && UUID.test(personel)) {
    hedef.pathname = `/panel/hr/${personel}`;
    hedef.searchParams.set("pencere", "prim");
  } else {
    hedef.pathname = "/panel/hr";
  }
  return NextResponse.redirect(hedef, 307);
}
