import { crmBolumleri } from "../os/os-bolumler";
import { ModulSekmeleri } from "../os/modul-sekmeleri";

// CRM modülünün sekmeleri. Liste os/os-bolumler.ts'te (dock'un ikinci katı
// ve Ctrl+K ile ortak). "Genel Bakış" satışçının günlük özet ekranı;
// talepler tablosu modülün giriş adresinde (/panel/crm).
export type CrmTabKey = "genel-bakis" | "talepler" | "whatsapp" | "teklifler" | "sozlesmeler" | "takvim";

export function CrmTabs({ active }: { active: CrmTabKey }) {
  return <ModulSekmeleri bolumler={crmBolumleri()} aktif={active} etiket="CRM bölümleri" />;
}
