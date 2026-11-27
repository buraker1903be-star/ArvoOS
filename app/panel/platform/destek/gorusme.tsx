import Link from "next/link";
import { DURUM_ADI, KATEGORI_ADI, ONCELIK_ADI } from "@/lib/destek-kuyrugu";
import { replySupportTicket, updateSupportTicketStatus } from "../../support/actions";
import { tarihSaat } from "../bicim";
import { YanitKutusu } from "./yanit-kutusu";
import type { getPanelContext } from "@/lib/panel-context";
/* Bileşen HER YERDE kullanılıyor (panelde ve tam sayfada): kullandığı
   düzen sınıflarının CSS'ini kendisi import ediyor, yoksa rotada
   stil hiç yüklenmiyor ve hata da vermiyor. */
import "../../components/kayit-formu.css";
import "./destek.css";

/*
  TEK TALEBİN KONUŞMASI — İKİ ROTANIN PAYLAŞTIĞI BÖLÜM (27.11.2026).

  Onaylı tasarımda seçili görüşme listenin SAĞ PANELİNDE açılıyor;
  `/panel/platform/destek/[id]` ise paylaşılmış/kaydedilmiş bağlantı
  olarak çalışmaya devam ediyor. İki kopya olsaydı biri ötekinden
  sapardı — bu depoda tam olarak bu sınıf hata birkaç kez yaşandı.

  YANIT VE DURUM İŞLEMLERİ DEĞİŞMEDİ: kiracı panelinin Destek
  ekranıyla AYNI sunucu işlemleri (support/actions). İki ayrı yazma
  yolu, birinin düzeltilip ötekinin geride kalması demekti. Mesaj
  eklenince durumu veritabanı çeviriyor ve kuruma bildirimi o yazıyor
  (private.touch_support_ticket).
*/

export type GorusmeMesaji = { id: string; body: string; is_staff: boolean; created_at: string };

export type GorusmeVerisi = {
  id: string;
  subject: string;
  category: string;
  priority: string;
  status: string;
  created_at: string;
  organization_id: string | null;
  kurum: string;
  telefon: string | null;
  mesajlar: GorusmeMesaji[];
  hazirlar: { id: string; baslik: string; metin: string }[];
};

const SECIM = "id,subject,category,priority,status,created_at,organization_id," +
  "organizations(name,display_name,contact_phone),support_messages(id,body,is_staff,created_at)";

/**
 * Bir talebin konuşmasını ve hazır yanıtları okur. Talep yoksa null
 * döner — çağıran taraf "bulunamadı" hâlini kendi bağlamına göre
 * gösteriyor (tam sayfada notFound, panelde uyarı).
 */
export async function gorusmeVerisi(
  /* Çağıran getPanelContext()'in istemcisini veriyor; tipi oradan
     türetiliyor ki `any` olmasın. */
  supabase: Awaited<ReturnType<typeof getPanelContext>>["supabase"],
  id: string,
): Promise<GorusmeVerisi | null> {
  const { data, error } = await supabase.from("support_tickets").select(SECIM).eq("id", id).maybeSingle();
  if (error) throw new Error("Destek talebi okunamadı: " + error.message);
  if (!data) return null;
  /* Gömülü seçimde istemcinin çıkardığı tip birleşim; satırın şekli
     SECIM'de yazılı ve burada tek yerde söyleniyor. */
  const satir = data as unknown as {
    id: string; subject: string; category: string; priority: string; status: string;
    created_at: string; organization_id: string | null;
    organizations: { name: string | null; display_name: string | null; contact_phone: string | null }
      | { name: string | null; display_name: string | null; contact_phone: string | null }[] | null;
    support_messages: GorusmeMesaji[] | null;
  };
  const org = (Array.isArray(satir.organizations) ? satir.organizations[0] : satir.organizations) as
    { name: string | null; display_name: string | null; contact_phone: string | null } | null;
  /* Hazır yanıtlar (migration 20261102134522). Tablo yoksa ya da
     okunamazsa seçici çizilmiyor; yanıt yazmak bunsuz da çalışıyor. */
  /* sınırsız-tamam: kurucunun kendi şablon listesi, birkaç düzine satır. */
  const hazirSonuc = await supabase.from("platform_hazir_yanitlar").select("id,baslik,metin").order("baslik");
  if (hazirSonuc.error) console.error("[destek] hazır yanıtlar okunamadı", hazirSonuc.error.message);
  return {
    id: satir.id,
    subject: satir.subject,
    category: satir.category,
    priority: satir.priority,
    status: satir.status,
    created_at: satir.created_at,
    organization_id: satir.organization_id,
    kurum: org?.display_name || org?.name || "Kurum",
    telefon: org?.contact_phone ?? null,
    mesajlar: [...((satir.support_messages ?? []) as GorusmeMesaji[])]
      .sort((a, b) => a.created_at.localeCompare(b.created_at)),
    hazirlar: (hazirSonuc.data ?? []) as { id: string; baslik: string; metin: string }[],
  };
}

/** Konuşmanın durum rozeti; liste ve panel aynı sözlüğü kullanıyor. */
export function gorusmeDurumu(status: string) {
  const kapali = status === "resolved" || status === "closed";
  return {
    etiket: DURUM_ADI[status] ?? status,
    ton: (kapali ? "neutral" : status === "waiting_customer" ? "info" : "gold") as "neutral" | "info" | "gold",
    kapali,
  };
}

/**
 * Konuşma gövdesi: mesajlar, yanıt kutusu ve durum formu.
 *
 * Başlık ÇİZİLMİYOR: tam sayfada `talep-bas`, panelde
 * `KonsolPanelBas` var ve ikisi aynı şeyi iki kez yazmamalı.
 */
export function Gorusme({ veri }: { veri: GorusmeVerisi }) {
  const { kapali } = gorusmeDurumu(veri.status);
  return (
    <>
      <section className="destek-konusma" aria-label="Konuşma">
        {veri.mesajlar.length ? veri.mesajlar.map((m) => (
          <article key={m.id} className="destek-mesaj" data-kim={m.is_staff ? "ekip" : "kurum"}>
            <header><b>{m.is_staff ? "ArvoOS Destek" : veri.kurum}</b><small>{tarihSaat(m.created_at)}</small></header>
            <p>{m.body}</p>
          </article>
        )) : <p className="destek-bos">Bu talepte mesaj yok.</p>}
      </section>

      <section className="destek-yanit" aria-label="Yanıt">
        <form action={replySupportTicket} className="panel-form kayit-formu">
          <input type="hidden" name="ticket_id" value={veri.id} />
          <YanitKutusu hazirlar={veri.hazirlar} kurum={veri.kurum}
            placeholder={kapali
              ? "Yanıt yazarsanız talep \"Müşteri bekleniyor\"a geçer; kapalı kalsın istiyorsanız durumu sonra yeniden kapatın."
              : "Kuruma görünecek yanıt"} />
          <div className="wide panel-form-actions kayit-formu-eylem">
            <p>Gönderince talep &quot;Müşteri bekleniyor&quot; olur ve kuruma panel bildirimi gider.</p>
            <button className="panel-primary" type="submit">Yanıtı gönder</button>
          </div>
        </form>
        <form action={updateSupportTicketStatus} className="destek-durum">
          <input type="hidden" name="ticket_id" value={veri.id} />
          <label>Durum
            <select name="status" defaultValue={veri.status}>
              {Object.entries(DURUM_ADI).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
          <button className="panel-secondary" type="submit">Durumu güncelle</button>
        </form>
      </section>
    </>
  );
}

/** Konuşmanın künyesi: kurum, kategori, öncelik, açılış, telefon. */
export function gorusmeAlanlari(veri: GorusmeVerisi) {
  return [
    {
      ad: "Kurum",
      deger: veri.organization_id
        ? <Link href={`/panel/platform/musteriler/${veri.organization_id}`}>{veri.kurum}</Link>
        : veri.kurum,
    },
    { ad: "Kategori", deger: KATEGORI_ADI[veri.category] ?? veri.category },
    { ad: "Öncelik", deger: ONCELIK_ADI[veri.priority] ?? veri.priority },
    { ad: "Açıldı", deger: tarihSaat(veri.created_at) },
    ...(veri.telefon ? [{ ad: "Telefon", deger: veri.telefon }] : []),
  ];
}
