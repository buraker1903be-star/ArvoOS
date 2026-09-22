import { notFound } from "next/navigation";
import { getPanelContext } from "@/lib/panel-context";
import { getMemberDirectory } from "@/lib/member-directory";
import { UyeListesi } from "./uye-listesi";
import { StgIcon, StgWidget } from "../../settings/settings-ui";
import "../../settings/settings.css";
import "../platform.css";

export default async function MembersPage() {
  const { isPlatformOwner } = await getPanelContext();
  if (!isPlatformOwner) notFound();

  const { rows, arvolabReachable } = await getMemberDirectory();
  const people = new Set(rows.map((row) => row.email ?? row.userId));
  const individuals = rows.filter((row) => row.individual);
  const blocked = rows.filter((row) => !row.access);

  return <div className="stg plt">
    <div className="panel-pagehead">
      <div><small className="panel-kicker">PLATFORM · ÜYELER</small><h1>Tüm Üyeler</h1><p>ArvoOS, ArvoLab ve Arc&apos;ı kullanan herkesin tek listesi; kurum üyeleri ve bireysel aboneler birlikte.</p></div>
      
    </div>


    {!arvolabReachable ? (
      <div className="platform-note"><span>!</span><p>ArvoLab veritabanına ulaşılamadı; aşağıdaki listede ArvoLab üyeleri eksik. Bağlantı ayarlarını kontrol edin.</p></div>
    ) : null}

    <section className="stg-widgets" aria-label="Üye özeti">
      <StgWidget tone="gold" icon="users" label="Kişi" value={people.size} note="Ürünler arası tekil" />
      <StgWidget tone="success" icon="check" label="Erişimi açık" value={rows.length - blocked.length} note={`${rows.length} üyelik kaydı`} />
      <StgWidget tone={individuals.length ? "info" : "neutral"} icon="box" label="Bireysel" value={individuals.length} note="Kuruma bağlı olmayan" />
      <StgWidget tone={blocked.length ? "warning" : "neutral"} icon="lock" label="Erişimi kapalı" value={blocked.length} note="Lisans, abonelik ya da üyelik kapalı" />
    </section>

    <UyeListesi satirlar={rows} />

    <div className="platform-note"><span>i</span><p>Bir kişi birden fazla üründe görünebilir; aynı e-posta ArvoOS ve Arc&apos;ta ortak hesaptır, ArvoLab ayrı veritabanında kendi hesabını kullanır.</p></div>

    {!rows.length ? <div className="stg-empty"><StgIcon name="users" size={22} /><p>Henüz üye yok.</p></div> : null}
  </div>;
}
