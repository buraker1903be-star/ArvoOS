import { notFound } from "next/navigation";
import { getPanelContextErisimdenBagimsiz as getPanelContext } from "@/lib/panel-context";
import { createAdminClient } from "@/lib/supabase/admin";
import { proformalar, satici } from "@/lib/faturalama-koprusu";
import { proformaGorunumu } from "@/lib/proforma";
import { productName } from "@/lib/products";
import { todayInIstanbul } from "@/lib/istanbul-date";
import { ProformaBelgesi } from "../proforma-belgesi";

/*
  KURUMUN PROFORMASI (28.10.2026). ArvoLab'daki yazdırma sayfasının
  ArvoOS'taki ikizi: ArvoOS ve ArvoCal lisansı için kesilen proforma
  kurumun görebileceği hiçbir yerde yoktu. Panel çerçevesi yazdırırken
  zaten gizleniyor (panel.css @media print); bu sayfa yalnızca belgeyi
  çiziyor.

  Yetki: lisans yönetme yetkisi ve proformanın BU kuruma ait olması.
  Tablo istemciye kapalı, okuma servis rolüyle; kurum kimliği sorguda
  bağlı olduğu için başka kurumun kimliğini adrese yazan kişi 404 alır.
  Sınıflar doc- önekli: müşteriye giden belgede ad- öneki reklam
  engelleyicilere takılıyor (AGENTS.md).
*/


export default async function KurumProformaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { organization, membership, izin } = await getPanelContext();
  if (!membership || !izin("finance.lisans.yonet")) notFound();
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const admin = createAdminClient();
  if (!admin) throw new Error("Sunucu yapılandırması eksik; proforma okunamadı.");

  const p = (await proformalar(admin, "organization_id", organization.id)).find((x) => x.id === id);
  if (!p) notFound();
  const s = await satici(admin);
  const bugun = todayInIstanbul();
  const durum = proformaGorunumu(p.durum, p.gecerlilikTarihi, bugun);
  const { data: urunSatiri } = await admin.from("platform_proformalari").select("product").eq("id", id).maybeSingle();
  // hata-tamam: ürün adı yalnızca başlık süsü; okunamazsa yazılmıyor.
  const urun = urunSatiri?.product ? productName(urunSatiri.product) : null;

  return <ProformaBelgesi p={p} s={s} urun={urun} durum={durum} bugun={bugun} geri={{ href: "/panel/billing", etiket: "Abonelik ve faturalama" }} />;
}
