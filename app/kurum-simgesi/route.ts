import { kurumSimgesiYaniti } from "./yayin";

// Sayfa etiketlerinin gösterdiği adres (lib/kurum-simgesi SIMGE_YOLU).
export const dynamic = "force-dynamic";

export function GET() {
  return kurumSimgesiYaniti();
}
