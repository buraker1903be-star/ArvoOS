import type { createClient } from "@/lib/supabase/server";
import { beklemeSuresi, DURUM_ADI, gecikmisMi, kuyrukHali, kuyrukSirala, KATEGORI_ADI, ONCELIK_ADI } from "@/lib/destek-kuyrugu";
import { zorunlu } from "../../konsol-oku";
import { KBos, KKart, KListe, KOge } from "../../konsol-ui";
import { sayi, tarihSaat } from "../../bicim";

type Supabase = Awaited<ReturnType<typeof createClient>>;
type Talep = { id: string; subject: string; category: string; priority: string; status: string; last_message_at: string; created_at: string };

/*
  MÜŞTERİ KARTININ DESTEK SEKMESİ (02.11.2026). Kurumun açtığı bütün
  talepler; sıralama ve durum dili konsolun destek kuyruğuyla aynı
  (lib/destek-kuyrugu). Kurumla sınırlı ve bilerek sınırsız: bir kurumun
  talep sayısı küçük ve "kaç talebi var" sorusunun yanıtı bu liste.
  Okuma kurucunun oturumuyla (RLS kurucuya bütün kurumları açıyor).
*/
// Şimdiki zaman bileşen dışında okunur (react-hooks/purity).
const simdiOku = () => new Date();

export async function DestekBolumu({ supabase, organizationId }: { supabase: Supabase; organizationId: string }) {
  /* sınırsız-tamam: tek kurumun talepleri, sayısı küçük; sekme bunların tamamını listeliyor. */
  const sonuc = await supabase.from("support_tickets")
    .select("id,subject,category,priority,status,last_message_at,created_at")
    .eq("organization_id", organizationId)
    .order("last_message_at", { ascending: false });
  const talepler = kuyrukSirala((zorunlu(sonuc, "Destek talepleri") ?? []) as Talep[]);
  const an = simdiOku();
  const acik = talepler.filter((t) => kuyrukHali(t.status) !== "kapandi").length;

  return (
    <KKart baslik="Destek talepleri" aciklama="Kurumun açtığı talepler; yanıt bekleyen ve en uzun bekleyen başta." sag={<span className="status-pill">{sayi(acik)} açık / {sayi(talepler.length)}</span>}>
      {talepler.length ? (
        <KListe>
          {talepler.map((t) => {
            const hal = kuyrukHali(t.status);
            const bekliyor = hal === "yanit";
            return (
              <KOge key={t.id} href={`/panel/platform/destek/${t.id}`} baslik={t.subject}
                alt={[KATEGORI_ADI[t.category] ?? t.category, ONCELIK_ADI[t.priority], `açıldı ${tarihSaat(t.created_at)}`].filter(Boolean).join(" · ")}
                durum={{
                  etiket: bekliyor ? `${beklemeSuresi(t.last_message_at, an)} bekliyor` : DURUM_ADI[t.status] ?? t.status,
                  ton: bekliyor ? (gecikmisMi(t.last_message_at, an) ? "danger" : "warning") : hal === "musteri" ? "info" : "neutral",
                }} />
            );
          })}
        </KListe>
      ) : <KBos baslik="Destek talebi yok" aciklama="Kurum panelin Destek ekranından talep açtığında burada görünür." />}
    </KKart>
  );
}
