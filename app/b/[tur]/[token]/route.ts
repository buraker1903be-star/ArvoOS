import { NextResponse } from "next/server";
import { hedefAdres } from "../../kisa-baglanti";

/* Değişken yol sonunda: /b/teklif/<anahtar>. Gerekçe: app/b/kisa-baglanti.ts */
export async function GET(_request: Request, { params }: { params: Promise<{ tur: string; token: string }> }) {
  const { tur, token } = await params;
  // 307: adres kalıcı değil (kurum alan adını sonra doğrulatabilir).
  return NextResponse.redirect(await hedefAdres(tur, token), 307);
}
