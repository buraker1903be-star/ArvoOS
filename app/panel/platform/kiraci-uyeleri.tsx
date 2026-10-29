"use client";

import { useState, useTransition } from "react";
import { uyeErisimiDegistir } from "./members/actions";
import { MobilSatir } from "../crm/table-cells";
import { basHarfleri } from "./bicim";
import { OnayPenceresi, type OnayIstegi } from "../components/onay-penceresi";

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

  /* Onay panelin kendi penceresinde (onay-penceresi): tarayıcının confirm
     kutusu susturulabiliyor ve susturulunca anahtara basmak sessizce
     hiçbir şey yapmıyordu. Gerekçe o dosyanın başında. */
  const [onay, setOnay] = useState<{ istek: OnayIstegi; uygula: () => void } | null>(null);

  const degistir = (uye: KiraciUyesi) => {
    const ad = uye.name || uye.email || "bu kullanıcı";
    const acilacak = !uye.active;
    setOnay({
      istek: acilacak
        ? { ust: kurumAdi, baslik: `${ad} için erişim açılsın mı?`, metin: `Kişi ${kurumAdi} paneline yeniden girebilir.`, onayEtiketi: "Aç" }
        : { ust: kurumAdi, baslik: `${ad} için erişim kapatılsın mı?`, metin: `Kişi ${kurumAdi} paneline giremez. Kaydı silinmez, erişim istendiğinde yeniden açılır.`, onayEtiketi: "Kapat", tehlike: true },
      uygula: () => basla(async () => {
        const veri = new FormData();
        veri.set("organization_id", organizationId);
        veri.set("user_id", uye.userId);
        veri.set("acik", acilacak ? "1" : "0");
        await uyeErisimiDegistir(veri);
        setOnay(null);
      }),
    });
  };

  const pencere = (
    <OnayPenceresi
      istek={onay?.istek ?? null}
      calisiyor={calisiyor}
      onIptal={() => { if (!calisiyor) setOnay(null); }}
      onOnay={() => onay?.uygula()}
    />
  );

  if (!uyeler.length) return <div className="crm-empty-state talep-bos-kutu ek-bos"><h2>Bu kurumda üye yok</h2><p>Davet kabul edildiğinde kurumun kullanıcıları burada listelenir.</p></div>;

  /* Panelin tablosu (29.10.2026, müşteri kartı sekmeleri): kişi, rol,
     durum ve erişim anahtarı kendi sütununda. 14.10.2026'dan beri iOS
     satırıydı; rol ile e-posta tek alt satırdaydı. */
  return (
    <>
    <div className="talep-tablo fn-ic-tablo">
      <table className="crm-data-table" data-cols="mk-uye">
        <thead><tr><th>Kişi</th><th>Rol</th><th>Durum</th><th>Erişim</th></tr></thead>
        <tbody>
          {uyeler.map((uye) => {
            const sonSahip = uye.role === "owner" && uye.active && aktifSahipSayisi < 2;
            const baslik = uye.name ?? uye.email ?? "Adı kayıtlı değil";
            const durum = { etiket: uye.active ? "Erişim açık" : "Erişim kapalı", ton: uye.active ? "success" : "neutral" };
            return (
              <tr key={uye.userId} className={uye.active ? undefined : "is-pasif"}>
                <td data-label="Kişi">
                  <span className="ek-kisi">
                    <span className="ek-avatar" data-tur="bireysel" aria-hidden="true">{basHarfleri(baslik)}</span>
                    {/* E-posta her zaman yazıyor: "Adı kayıtlı değil" yazan satırları ayırmanın yolu o. */}
                    <span className="ek-kisi-metin"><span className="crm-table-title" title={baslik}>{baslik}</span>{uye.name && uye.email ? <span className="crm-table-sub" title={uye.email}>{uye.email}</span> : null}</span>
                  </span>
                </td>
                <td data-label="Rol"><span className="crm-table-title">{ROL_ADI[uye.role] ?? uye.role}</span></td>
                <td data-label="Durum"><span className="status-pill" data-tone={durum.ton}>{durum.etiket}</span></td>
                <td className="crm-table-actions">
                  {sonSahip ? (
                    /* Yapılamayacak iş için anahtar gösterip hata vermektense nedenini baştan söylüyoruz. */
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
                <MobilSatir baslik={baslik} durum={durum} alt={[ROL_ADI[uye.role] ?? uye.role, uye.name ? uye.email : null]} />
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
    {pencere}
    </>
  );
}
