import { finansRaporGorur, maliyetGorur, type BolumErisimi } from "../os/os-bolumler";

/*
  Finans görünürlük kuralları. Bölümlerin listesi os/os-bolumler.ts'te
  (dock'un ikinci katı ve Ctrl+K). Sayfa içi sekme çubuğu 2026-10'da
  kalktı: bölümlere dock'tan gidiliyor.

  Görünürlük rol listesinden değil yetenek anahtarından geliyor. Eskiden
  "İş Maliyetleri" ve "Raporlar" sabit olarak Kurum Sahibi + Yönetici'ye
  açıktı; kurum kendi kuralını koyamıyordu.
*/
type PanelAccess = Pick<BolumErisimi, "modules" | "yetkiler">;

export const canManageCosts = (context: PanelAccess) => maliyetGorur(context);

/** Raporlar: kurumda Raporlama modülü açık + rolde rapor yetkisi var. */
export const canSeeFinanceReports = (context: PanelAccess) => finansRaporGorur(context);
