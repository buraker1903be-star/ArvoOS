import Link from "next/link";
import type { PanelWorkspace } from "@/lib/panel-context";
import { WorkspaceSwitcher } from "../workspace-switcher";
import { basHarfler } from "./os-apps";
import { OsSimge } from "./os-icons";

/*
  Kullanıcı menüsü. Eskiden sağ üstteki çip KURUMUN baş harfini ve rolü
  gösteriyordu; kim olarak oturum açıldığı hiçbir yerde yazmıyordu.
  Kenar menüsünün altındaki "Güvenli oturum" süsü ve çıkış düğmesi de
  buraya taşındı. JavaScript'siz açılır (details): sunucuda çizilir.
*/
export function OsKullaniciMenusu({
  ad,
  rol,
  kurum,
  paket,
  workspaces,
  aktifKurumId,
  cikis,
}: {
  ad: string;
  rol: string;
  kurum: string;
  paket: string;
  workspaces: PanelWorkspace[];
  aktifKurumId: string;
  cikis: () => Promise<void>;
}) {
  return (
    <details className="os-user">
      <summary aria-label={`Hesap: ${ad}`}>
        <span className="os-avatar">{basHarfler(ad)}</span>
      </summary>
      <div className="os-user-menu">
        <div className="os-user-head">
          <span className="os-avatar os-avatar--lg">{basHarfler(ad)}</span>
          <div>
            <b>{ad}</b>
            <small>{rol} · {kurum}</small>
          </div>
        </div>
        {workspaces.length > 1 ? (
          <div className="os-user-section">
            <WorkspaceSwitcher workspaces={workspaces} activeOrganizationId={aktifKurumId} variant="card" />
          </div>
        ) : null}
        <nav className="os-user-links" aria-label="Hesap">
          <Link href="/panel/settings"><OsSimge ad="settings" boyut={16} />Ayarlar</Link>
          <Link href="/panel/notifications"><OsSimge ad="bell" boyut={16} />Bildirimler</Link>
        </nav>
        <form action={cikis} className="os-user-logout">
          <button type="submit"><OsSimge ad="logout" boyut={16} />Çıkış yap</button>
        </form>
        <p className="os-user-foot">{paket.toUpperCase()} paket</p>
      </div>
    </details>
  );
}
