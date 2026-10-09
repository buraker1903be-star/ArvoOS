import { NextResponse, type NextRequest } from "next/server";

/*
  Raporlar, Finans modülünün sekmesi oldu (/panel/finance/raporlar).
  Eski bağlantılar dönem filtresiyle (aralik, baslangic, bitis) birlikte
  yeni adrese gider.

  Sayfa (page.tsx) değil route handler: vinext 0.0.50 sayfayı asıl
  çizimden önce arama parametreleri BOŞ olarak bir kez deniyor ve o
  denemede atılan redirect yanıt oluyor (entries/app-rsc-entry.js
  probePage, "searchParamsObject" diye var olmayan bir alanı okuyor).
  Sayfa olarak yazıldığında /panel/reporting?aralik=30 filtresiz
  /panel/finance/raporlar'a düşüyordu. Route handler bu denemeden geçmiyor.
*/
const TASINAN = ["aralik", "baslangic", "bitis"] as const;

export function GET(request: NextRequest) {
  const gelen = request.nextUrl.searchParams;
  const hedef = request.nextUrl.clone();
  hedef.pathname = "/panel/finance/raporlar";
  hedef.search = "";
  for (const ad of TASINAN) {
    const deger = gelen.get(ad);
    if (deger) hedef.searchParams.set(ad, deger);
  }
  return NextResponse.redirect(hedef, 307);
}
