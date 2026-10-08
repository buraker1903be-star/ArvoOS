import Link from "next/link";
import type { PanelWorkspace } from "@/lib/panel-context";
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
          /*
            ÇALIŞMA ALANLARI: liste. Eskiden kenar menüsünün koyu zemini için
            yazılmış açılır seçici (beyaz yazı) buraya konmuştu; beyaz menüde
            görünmüyor, telefonda da tamamen gizleniyordu.

            Bilerek düz <a>, Link DEĞİL: Link bağlantıyı önceden yükler ve
            /panel/switch GET isteği çalışma alanını çerezle değiştirir — menü
            açılınca kişi fark etmeden başka kuruma geçerdi. Üyelik kontrolü
            yolun kendisinde (app/panel/switch/route.ts).
          */
          <div className="os-user-section">
            <small className="os-user-label">Çalışma alanı</small>
            <ul className="os-ws-list">
              {workspaces.map((alan) => {
                const ad = alan.organization.display_name || alan.organization.name;
                const aktif = alan.organizationId === aktifKurumId;
                const icerik = (
                  <>
                    <span className="os-ws-mark" aria-hidden="true">{ad.slice(0, 1).toLocaleUpperCase("tr")}</span>
                    <span className="os-ws-text"><b>{ad}</b><small>{alan.organization.plan_code} paket</small></span>
                    {aktif ? <span className="os-ws-check" aria-hidden="true">✓</span> : null}
                  </>
                );
                return (
                  <li key={alan.organizationId}>
                    {aktif
                      ? <span className="os-ws-item is-active" aria-current="true">{icerik}</span>
                      : <a className="os-ws-item" href={`/panel/switch?organization_id=${encodeURIComponent(alan.organizationId)}`}>{icerik}</a>}
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}
        <nav className="os-user-links" aria-label="Hesap">
          <Link href="/panel/settings"><OsSimge ad="settings" boyut={16} />Ayarlar</Link>
          <Link href="/panel/notifications"><OsSimge ad="bell" boyut={16} />Bildirimler</Link>
        </nav>
        <form action={cikis} className="os-user-logout">
          <button type="submit"><OsSimge ad="logout" boyut={16} />Çıkış yap</button>
        </form>
        {/* Birden çok çalışma alanında paket listede yazıyor; tekrar etme. */}
        {workspaces.length > 1 ? null : <p className="os-user-foot">{paket.toUpperCase()} paket</p>}
      </div>
    </details>
  );
}
