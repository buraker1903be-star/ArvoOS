import { notFound } from "next/navigation";
import { getPanelContext } from "@/lib/panel-context";
import { getMemberDirectory } from "@/lib/member-directory";
import { UyeListesi } from "./uye-listesi";
import { StgIcon } from "../../settings/settings-ui";
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

    <section className="platform-serit" aria-label="Üye özeti">
      <span><b>{people.size}</b> kişi</span>
      <span><b>{rows.length - blocked.length}</b> erişimi açık</span>
      {individuals.length ? <span><b>{individuals.length}</b> bireysel</span> : null}
      {blocked.length ? <span data-tone="warning"><b>{blocked.length}</b> erişimi kapalı</span> : null}
    </section>

    <UyeListesi satirlar={rows} />

    <div className="platform-note"><span>i</span><p>Bir kişi birden fazla üründe görünebilir; aynı e-posta ArvoOS ve Arc&apos;ta ortak hesaptır, ArvoLab ayrı veritabanında kendi hesabını kullanır.</p></div>

    {!rows.length ? <div className="stg-empty"><StgIcon name="users" size={22} /><p>Henüz üye yok.</p></div> : null}
  </div>;
}
