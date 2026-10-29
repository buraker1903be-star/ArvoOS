import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getPanelContext } from "@/lib/panel-context";
import { createAdminClient } from "@/lib/supabase/admin";
import { kimlikMi } from "@/lib/kimlik";
import { proformaGetir, satici } from "@/lib/faturalama-koprusu";
import { proformaGorunumu } from "@/lib/proforma";
import { productName } from "@/lib/products";
import { todayInIstanbul } from "@/lib/istanbul-date";
import { ProformaBelgesi } from "../../../../billing/proforma/proforma-belgesi";

export const metadata: Metadata = { title: "Proforma", robots: { index: false, follow: false } };

/*
  KURUCU KONSOLU — PROFORMA BELGESİ (29.10.2026). Konsol proformayı
  yalnızca liste satırı olarak gösteriyordu: kurucu müşteriye giden
  belgenin kendisini göremiyor, yazdırıp e-postayla gönderemiyordu.
  Belge müşterinin sayfasıyla AYNI bileşen (ProformaBelgesi) — kurucunun
  gördüğü, müşterinin gördüğüdür. İptal edilen de açılır (müşteri tarafı
  iptali göstermiyor).

  Yetki: yalnızca platform kurucusu; okuma servis rolüyle (tablo
  istemciye kapalı).
*/
export default async function KonsolProformaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!kimlikMi(id)) notFound();
  const { isPlatformOwner } = await getPanelContext();
  if (!isPlatformOwner) notFound();
  const admin = createAdminClient();
  if (!admin) throw new Error("Sunucu yapılandırması eksik; proforma okunamadı.");
  const [p, s] = await Promise.all([proformaGetir(admin, id), satici(admin)]);
  if (!p) notFound();
  const bugun = todayInIstanbul();
  const durum = proformaGorunumu(p.durum, p.gecerlilikTarihi, bugun);
  const urun = productName(p.urun);
  // Müşteri belgeyi nerede görüyor: ArvoLab proformasını ArvoLab'da, diğerlerini ArvoOS panelinde.
  const nerede = p.urun === "arvolab" ? "ArvoLab'daki Abonelik ve kredi sayfasında" : "ArvoOS panelindeki Abonelik ve faturalama sayfasında";

  return (
    <ProformaBelgesi
      p={p} s={s} urun={urun} durum={durum} bugun={bugun}
      geri={{ href: "/panel/platform/tahsilat?kanal=proforma", etiket: "Proformalar" }}
      ust={
        <div className="doc-konsol">
          <span>Müşteri bu belgeyi {nerede} görüyor. {durum === "bekliyor" ? "Ödeme geldiğinde Proformalar listesinden ödemeyle eşleştirin." : null}</span>
          {p.organizationId ? <Link className="panel-secondary" href={`/panel/platform/musteriler/${p.organizationId}`}>Müşteri kartı</Link> : null}
          <Link className="panel-secondary" href="/panel/platform/tahsilat?kanal=banka">Banka hesapları</Link>
        </div>
      }
    />
  );
}
