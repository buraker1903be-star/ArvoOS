"use client";

import { useState, useTransition } from "react";
import { OnayPenceresi } from "../../components/onay-penceresi";
import { siteSil } from "../actions";

/* Silme geri alınamaz ve bütün ziyaret kayıtlarını götürür: önce sorulur. */
export function SiteSilDugmesi({ siteId, ad, alanAdi }: { siteId: string; ad: string; alanAdi: string }) {
  const [acik, setAcik] = useState(false);
  const [calisiyor, baslat] = useTransition();
  return (
    <>
      <button type="button" className="panel-danger" onClick={() => setAcik(true)}>Siteyi kaldır</button>
      <OnayPenceresi
        istek={acik ? {
          ust: alanAdi,
          baslik: `${ad} takipten çıkarılsın mı?`,
          metin: "Sitenin bütün ziyaret kayıtları da silinir ve geri alınamaz. Sitenizdeki takip kodu bundan sonra hiçbir şey yazmaz; kodu siteden de kaldırabilirsiniz.",
          onayEtiketi: "Siteyi ve kayıtlarını sil",
          tehlike: true,
        } : null}
        calisiyor={calisiyor}
        onIptal={() => setAcik(false)}
        onOnay={() => baslat(async () => {
          const veri = new FormData();
          veri.set("site_id", siteId);
          await siteSil(veri);
          setAcik(false);
        })}
      />
    </>
  );
}
