import type { ReactNode } from "react";
import { getPanelContext } from "@/lib/panel-context";
import { assertModuleAccess } from "@/lib/role-permissions";

// Finans, cari ve banka sayfalarının ortak kapısı. Tahsilat, iade ve cari
// işlemlerini yalnızca Kurum Sahibi ve Yönetici yapabiliyor; diğer roller
// eskiden yine de tüm müşterilerin bakiyelerini, cari hareketlerini ve
// iletişim bilgilerini görebiliyordu. Erişimi olmayan rol, çökme ekranı
// yerine açıklayıcı bir kart görür.
export async function FinanceAccessGate({ pathname, children }: { pathname: string; children: ReactNode }) {
  const { membership, hiddenModuleKeys, isPlatformOwner, izin } = await getPanelContext();
  assertModuleAccess(membership.role, pathname, hiddenModuleKeys);
  // Eskiden finans ekranlarını yalnızca Kurum Sahibi ve Yönetici görebiliyordu
  // ve bu kural koddaydı: modül matrisinde Finans'ı Satış Personeli'ne açmak
  // hiçbir şeye yaramıyordu. Artık karar kurumda.
  if (!isPlatformOwner && !izin("finance.gor")) {
    return <>
      <div className="panel-pagehead"><div><small className="panel-kicker">FİNANS</small><h1>Finans ve Cari Hesaplar</h1></div></div>
      <div className="panel-card panel-empty">Finans ve cari hesap bilgilerini yalnızca Kurum Sahibi ve Yönetici görüntüleyebilir.</div>
    </>;
  }
  return <>{children}</>;
}
