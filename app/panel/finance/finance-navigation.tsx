import { finansBolumleri, finansRaporGorur, maliyetGorur, type BolumErisimi } from "../os/os-bolumler";
import { ModulSekmeleri } from "../os/modul-sekmeleri";

// Finans modülünün tek sekme dizisi. Liste ve görünürlük kuralları
// os/os-bolumler.ts'te (dock'un ikinci katı ve Ctrl+K ile ortak).
export type FinanceTabKey = "genel-bakis" | "cari" | "paytr" | "maliyet" | "raporlar";

/*
  Sekme görünürlüğü rol listesinden değil yetenek anahtarından geliyor.
  Eskiden "İş Maliyetleri" ve "Raporlar" sabit olarak Kurum Sahibi +
  Yönetici'ye açıktı; kurum kendi kuralını koyamıyordu.
*/
type PanelAccess = Pick<BolumErisimi, "modules" | "yetkiler">;

export const canManageCosts = (context: PanelAccess) => maliyetGorur(context);

/** Raporlar sekmesi: kurumda Raporlama modülü açık + rolde rapor yetkisi var. */
export const canSeeFinanceReports = (context: PanelAccess) => finansRaporGorur(context);

export function FinanceTabs({ active, context }: { active: FinanceTabKey; context: PanelAccess }) {
  return <ModulSekmeleri bolumler={finansBolumleri(context)} aktif={active} etiket="Finans bölümleri" />;
}
