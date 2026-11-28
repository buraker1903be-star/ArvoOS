import { konsolAlaniniAc } from "../../konsol-alani";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getPanelContext } from "@/lib/panel-context";
import { KATEGORI_ADI, ONCELIK_ADI } from "@/lib/destek-kuyrugu";
import { tarihSaat } from "../../bicim";
import { Gorusme, gorusmeDurumu, gorusmeVerisi } from "../gorusme";
import "../../platform.css";
import "../../../crm/crm.css";
import "../../../crm/kayit-detay/kayit-detay.css";
import "../../../hr/hr.css";
import "../../../components/kayit-formu.css";
import "../destek.css";

export const metadata: Metadata = { title: "Destek talebi", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;


/*
  TEK TALEBİN KONUŞMASI (konsol). Yanıt ve durum işlemleri kiracı
  panelinin Destek ekranıyla AYNI sunucu işlemleri (support/actions):
  iki ayrı yazma yolu, birinin düzeltilip ötekinin geride kalması
  demekti. Mesaj eklenince durumu veritabanı çeviriyor ve kuruma
  bildirimi o yazıyor (private.touch_support_ticket).
*/
export default async function DestekTalebi({ params }: { params: Promise<{ id: string }> }) {
  const { supabase, isPlatformOwner, konsolKapsami } = await getPanelContext();
  if (!isPlatformOwner) notFound();
  konsolAlaniniAc(konsolKapsami, "destek");
  const { id } = await params;
  if (!UUID.test(id)) notFound();

  /* Okuma ve çizim ORTAK (../gorusme): seçili görüşme artık listenin
     sağ panelinde de açılıyor ve iki kopya sapardı. Bu rota
     paylaşılmış/kaydedilmiş bağlantı olarak çalışmaya devam ediyor. */
  const veri = await gorusmeVerisi(supabase, id);
  if (!veri) notFound();
  const durum = gorusmeDurumu(veri.status);

  return <main className="plt talep cari ekip destek-talebi">
    <header className="talep-bas">
      <div className="talep-bas-metin">
        <small className="panel-kicker"><Link href="/panel/platform/destek">DESTEK TALEPLERİ</Link></small>
        <h1>{veri.subject}</h1>
        <p className="ek-alt">
          {veri.organization_id
            ? <Link href={`/panel/platform/musteriler/${veri.organization_id}`}>{veri.kurum}</Link>
            : veri.kurum}
          {" · "}{KATEGORI_ADI[veri.category] ?? veri.category}
          {" · "}{ONCELIK_ADI[veri.priority] ?? veri.priority} öncelik
          {" · "}açıldı {tarihSaat(veri.created_at)}{veri.telefon ? ` · ${veri.telefon}` : ""}
        </p>
      </div>
      <div className="talep-bas-eylem">
        <span className="status-pill" data-tone={durum.ton}>{durum.etiket}</span>
      </div>
    </header>

    <div className="panel-card destek-talebi">
      <Gorusme veri={veri} />
    </div>
  </main>;
}
