import { kurumSimgesiYaniti } from "../kurum-simgesi/yayin";

/*
  Kök /favicon.ico: tarayıcılar ve arama motorları sayfa etiketine
  bakmadan buradan istiyor. Eskiden hiçbir hostta yoktu (404); kurumun
  alan adında kurumun simgesi, Arvo adreslerinde Arvo simgesi.
*/
export const dynamic = "force-dynamic";

export function GET() {
  return kurumSimgesiYaniti();
}
