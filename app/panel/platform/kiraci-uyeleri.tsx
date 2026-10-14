"use client";

import { useTransition } from "react";
import { uyeErisimiDegistir } from "./members/actions";
import { KBaslik, KBos, KDurum, KTablo } from "./konsol-ui";

/*
  Seçili kiracının üyeleri, kiracı dosyasının içinde.

  Eskiden üyeler ayrı bir sekmedeydi ve tüm kurumların üyeleri tek listede
  duruyordu: bir kiracı hakkında karar vermek için sekme değiştirip o
  kurumu yeniden bulmak gerekiyordu. Kurucu kiracı ekseninde çalışıyor,
  ekran da öyle olmalı.

  E-posta satırda yazıyor. "Adı kayıtlı değil" yazan üç satır arasında
  kimin kim olduğunu ayırmanın yolu yoktu; ad her zaman girilmiş olmuyor
  ama e-posta hesabın kendisi.

  Satır başına tek işlem var: erişimi aç/kapat. Rol değiştirme ve silme
  bilerek yok — biri geri alınamaz, diğeri kurumun kendi kararı.
*/

export type KiraciUyesi = {
  userId: string;
  name: string | null;
  email: string | null;
  role: string;
  active: boolean;
};

const ROL_ADI: Record<string, string> = {
  owner: "Kurum sahibi", admin: "Yönetici", manager: "Müdür",
  member: "Satış personeli", operasyoncu: "Operasyon personeli", viewer: "İzleyici",
};

export function KiraciUyeleri({
  organizationId,
  kurumAdi,
  uyeler,
}: {
  organizationId: string;
  kurumAdi: string;
  uyeler: KiraciUyesi[];
}) {
  const [calisiyor, basla] = useTransition();

  // Son aktif sahibin erişimi kapatılamaz; anahtar yerine sebebini yazıyoruz.
  const aktifSahipSayisi = uyeler.filter((uye) => uye.role === "owner" && uye.active).length;

  const degistir = (uye: KiraciUyesi) => {
    const ad = uye.name || uye.email || "bu kullanıcı";
    const acilacak = !uye.active;
    if (!window.confirm(acilacak
      ? `${ad} için ${kurumAdi} erişimi açılsın mı?`
      : `${ad} için ${kurumAdi} erişimi kapatılsın mı? Kişi kurumun paneline giremez.`)) return;

    basla(async () => {
      const veri = new FormData();
      veri.set("organization_id", organizationId);
      veri.set("user_id", uye.userId);
      veri.set("acik", acilacak ? "1" : "0");
      await uyeErisimiDegistir(veri);
    });
  };

  if (!uyeler.length) return <KBos baslik="Bu kurumda üye yok." />;

  /* Panel tablosu (14.10.2026). Eskiden kendi satır listesiydi
     (.plt-uyeler) ve pasif üye yalnızca soluk görünüyordu; artık durumu
     panelin rozetiyle yazıyor. Telefon satırı (MobilSatir) yok: anahtar
     hücrede ve tek kompakt satır onu gizlerdi. */
  return (
    <KTablo kolonlar={[{ ad: "Üye" }, { ad: "Rol" }, { ad: "Durum" }, { ad: "Erişim" }]}>
      {uyeler.map((uye) => {
        const sonSahip = uye.role === "owner" && uye.active && aktifSahipSayisi < 2;
        return (
          <tr key={uye.userId}>
            <KBaslik etiket="Üye" baslik={uye.name ?? uye.email ?? "Adı kayıtlı değil"} alt={uye.name && uye.email ? uye.email : ROL_ADI[uye.role] ?? uye.role} />
            <td data-label="Rol">{ROL_ADI[uye.role] ?? uye.role}</td>
            <KDurum etiket={uye.active ? "Erişim açık" : "Erişim kapalı"} ton={uye.active ? "success" : "neutral"} />
            <td data-label="Erişim">
              {sonSahip ? (
                /* Yapılamayacak iş için anahtar gösterip hata vermektense
                   nedenini baştan söylüyoruz. */
                <span className="crm-table-sub">son sahip</span>
              ) : (
                <button
                  type="button"
                  className={uye.active ? "plt-switch is-on" : "plt-switch is-off"}
                  role="switch"
                  aria-checked={uye.active}
                  aria-label={`${uye.name ?? uye.email ?? "Üye"} erişimi: ${uye.active ? "kapat" : "aç"}`}
                  disabled={calisiyor}
                  onClick={() => degistir(uye)}
                ><i /></button>
              )}
            </td>
          </tr>
        );
      })}
    </KTablo>
  );
}
