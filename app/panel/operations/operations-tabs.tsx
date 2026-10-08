import { operasyonBolumleri } from "../os/os-bolumler";
import { ModulSekmeleri } from "../os/modul-sekmeleri";

// Operasyon modülünün sekmeleri. Liste os/os-bolumler.ts'te (dock'un ikinci
// katı ve Ctrl+K ile ortak). "Genel bakış" modülün giriş sayfası
// (/panel/operations); aktif işler /isler'de, arşiv /arsiv'de.
export type OperationsTabKey = "genel-bakis" | "is-akisi" | "pano" | "takvim" | "arsiv" | "sablon";

export function OperationsTabs({ active }: { active: OperationsTabKey }) {
  return <ModulSekmeleri bolumler={operasyonBolumleri()} aktif={active} etiket="Operasyon bölümleri" />;
}
