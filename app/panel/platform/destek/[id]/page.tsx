import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getPanelContext } from "@/lib/panel-context";
import { DURUM_ADI, KATEGORI_ADI, ONCELIK_ADI } from "@/lib/destek-kuyrugu";
import { replySupportTicket, updateSupportTicketStatus } from "../../../support/actions";
import { tarihSaat } from "../../bicim";
import { YanitKutusu } from "../yanit-kutusu";
import "../../platform.css";
import "../../../crm/crm.css";
import "../../../crm/kayit-detay/kayit-detay.css";
import "../../../hr/hr.css";
import "../../../components/kayit-formu.css";
import "../destek.css";

export const metadata: Metadata = { title: "Destek talebi", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Mesaj = { id: string; body: string; is_staff: boolean; created_at: string };

/*
  TEK TALEBİN KONUŞMASI (konsol). Yanıt ve durum işlemleri kiracı
  panelinin Destek ekranıyla AYNI sunucu işlemleri (support/actions):
  iki ayrı yazma yolu, birinin düzeltilip ötekinin geride kalması
  demekti. Mesaj eklenince durumu veritabanı çeviriyor ve kuruma
  bildirimi o yazıyor (private.touch_support_ticket).
*/
export default async function DestekTalebi({ params }: { params: Promise<{ id: string }> }) {
  const { supabase, isPlatformOwner } = await getPanelContext();
  if (!isPlatformOwner) notFound();
  const { id } = await params;
  if (!UUID.test(id)) notFound();

  const { data, error } = await supabase.from("support_tickets")
    .select("id,subject,category,priority,status,created_at,organization_id,organizations(name,display_name,contact_phone),support_messages(id,body,is_staff,created_at)")
    .eq("id", id).maybeSingle();
  if (error) throw new Error("Destek talebi okunamadı: " + error.message);
  if (!data) notFound();
  const org = (Array.isArray(data.organizations) ? data.organizations[0] : data.organizations) as { name: string | null; display_name: string | null; contact_phone: string | null } | null;
  const kurum = org?.display_name || org?.name || "Kurum";
  const mesajlar = [...((data.support_messages ?? []) as Mesaj[])].sort((a, b) => a.created_at.localeCompare(b.created_at));
  const kapali = data.status === "resolved" || data.status === "closed";
  /* Hazır yanıtlar (migration 20261102134522). Tablo yoksa ya da okunamazsa
     seçici çizilmiyor; yanıt yazmak bunsuz da çalışıyor. */
  /* sınırsız-tamam: kurucunun kendi şablon listesi, birkaç düzine satır. */
  const hazirSonuc = await supabase.from("platform_hazir_yanitlar").select("id,baslik,metin").order("baslik");
  if (hazirSonuc.error) console.error("[destek] hazır yanıtlar okunamadı", hazirSonuc.error.message);
  const hazirlar = (hazirSonuc.data ?? []) as { id: string; baslik: string; metin: string }[];

  return <main className="plt talep cari ekip destek-talebi">
    <header className="talep-bas">
      <div className="talep-bas-metin">
        <small className="panel-kicker"><Link href="/panel/platform/destek">DESTEK TALEPLERİ</Link></small>
        <h1>{data.subject}</h1>
        <p className="ek-alt">
          <Link href={`/panel/platform/musteriler/${data.organization_id}`}>{kurum}</Link>
          {" · "}{KATEGORI_ADI[data.category] ?? data.category}{" · "}{ONCELIK_ADI[data.priority] ?? data.priority} öncelik
          {" · "}açıldı {tarihSaat(data.created_at)}{org?.contact_phone ? ` · ${org.contact_phone}` : ""}
        </p>
      </div>
      <div className="talep-bas-eylem">
        <span className="status-pill" data-tone={kapali ? "neutral" : data.status === "waiting_customer" ? "info" : "gold"}>{DURUM_ADI[data.status] ?? data.status}</span>
      </div>
    </header>

    <section className="panel-card destek-konusma" aria-label="Konuşma">
      {mesajlar.length ? mesajlar.map((m) => (
        <article key={m.id} className="destek-mesaj" data-kim={m.is_staff ? "ekip" : "kurum"}>
          <header><b>{m.is_staff ? "ArvoOS Destek" : kurum}</b><small>{tarihSaat(m.created_at)}</small></header>
          <p>{m.body}</p>
        </article>
      )) : <p className="destek-bos">Bu talepte mesaj yok.</p>}
    </section>

    <section className="panel-card destek-yanit" aria-label="Yanıt">
      <form action={replySupportTicket} className="panel-form kayit-formu">
        <input type="hidden" name="ticket_id" value={data.id} />
        <YanitKutusu hazirlar={hazirlar} kurum={kurum}
          placeholder={kapali ? "Yanıt yazarsanız talep yeniden açılmaz; durumu aşağıdan değiştirin." : "Kuruma görünecek yanıt"} />
        <div className="wide panel-form-actions kayit-formu-eylem">
          <p>Gönderince talep &quot;Müşteri bekleniyor&quot; olur ve kuruma panel bildirimi gider.</p>
          <button className="panel-primary" type="submit">Yanıtı gönder</button>
        </div>
      </form>
      <form action={updateSupportTicketStatus} className="destek-durum">
        <input type="hidden" name="ticket_id" value={data.id} />
        <label>Durum
          <select name="status" defaultValue={data.status}>
            {Object.entries(DURUM_ADI).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        <button className="panel-secondary" type="submit">Durumu güncelle</button>
      </form>
    </section>
  </main>;
}
