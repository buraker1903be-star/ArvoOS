import { NextResponse } from "next/server";
import { hedefAdres } from "../kisa-baglanti";

/*
  Değişken sorgu parametresinde: /b/teklif?t=<anahtar>.

  Meta'nın şablon düzenleyicisi dinamik düğmenin tabanını bazı biçimlerde
  "geçerli bir adres değil" diye reddediyor; iki biçimi de tanımak, şablon
  onaylandıktan sonra biçim değiştirip yeni bir onay turuna girmekten
  ucuz. Gerekçenin tamamı: app/b/kisa-baglanti.ts
*/
export async function GET(request: Request, { params }: { params: Promise<{ tur: string }> }) {
  const { tur } = await params;
  const token = new URL(request.url).searchParams.get("t") ?? "";
  return NextResponse.redirect(await hedefAdres(tur, token), 307);
}
