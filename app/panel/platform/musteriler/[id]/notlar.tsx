import type { createClient } from "@/lib/supabase/server";
import { todayInIstanbul } from "@/lib/istanbul-date";
import { zorunlu } from "../../konsol-oku";
import { KKart } from "../../konsol-ui";
import { tarih, tarihSaat } from "../../bicim";
import { notEkle, notSil, notTamamla } from "./not-actions";

type Supabase = Awaited<ReturnType<typeof createClient>>;
type Not = { id: string; metin: string; takip_tarihi: string | null; tamamlandi_at: string | null; olusturuldu: string };

/*
  MÜŞTERİ KARTININ NOTLAR SEKMESİ (02.11.2026). Kurucunun müşteri
  hakkındaki iç notları; takip tarihi verilen not o gün "Bugünün
  işleri"ne düşer. Kurumla sınırlı ve bilerek sınırsız: bir kurumun not
  sayısı küçük ve sekme hepsini gösteriyor. Okuma kurucunun oturumuyla.
*/
export async function NotBolumu({ supabase, organizationId }: { supabase: Supabase; organizationId: string }) {
  /* sınırsız-tamam: tek kurumun notları, sayısı küçük; sekme hepsini listeliyor. */
  const sonuc = await supabase.from("platform_musteri_notlari")
    .select("id,metin,takip_tarihi,tamamlandi_at,olusturuldu")
    .eq("organization_id", organizationId)
    .order("olusturuldu", { ascending: false });
  const notlar = (zorunlu(sonuc, "Müşteri notları") ?? []) as Not[];
  const bugun = todayInIstanbul();

  return (
    <KKart baslik="Notlar" aciklama="Müşteriyle ilgili iç notlarınız; müşteri görmez. Takip tarihi verilen not o gün Bugünün işleri'ne düşer.">
      <form action={notEkle} className="panel-form kayit-formu mu-not-form">
        <input type="hidden" name="organization_id" value={organizationId} />
        <label className="wide">Not
          <textarea name="metin" required minLength={2} maxLength={2000} rows={3} placeholder="Ör. Aradım, ödemeyi haftaya yapacak." />
        </label>
        <label>Takip tarihi (isteğe bağlı)
          <input type="date" name="takip_tarihi" min={bugun} />
        </label>
        <div className="panel-form-actions kayit-formu-eylem">
          <button className="panel-primary" type="submit">Notu kaydet</button>
        </div>
      </form>

      {notlar.length ? (
        <ul className="mu-notlar">
          {notlar.map((n) => {
            const acikTakip = n.takip_tarihi && !n.tamamlandi_at;
            const gecti = acikTakip && n.takip_tarihi! <= bugun;
            return (
              <li key={n.id} data-durum={n.tamamlandi_at ? "kapandi" : gecti ? "zamani" : undefined}>
                <p>{n.metin}</p>
                <div className="mu-not-alt">
                  <small>{tarihSaat(n.olusturuldu)}</small>
                  {n.takip_tarihi ? (
                    <span className="status-pill" data-tone={n.tamamlandi_at ? "neutral" : gecti ? "warning" : "info"}>
                      {n.tamamlandi_at ? `Takip tamamlandı · ${tarih(n.tamamlandi_at)}` : `Takip ${tarih(`${n.takip_tarihi}T12:00:00Z`)}`}
                    </span>
                  ) : null}
                  {acikTakip ? (
                    <form action={notTamamla}><input type="hidden" name="id" value={n.id} /><button type="submit" className="panel-secondary mu-kucuk">Tamamlandı</button></form>
                  ) : null}
                  <form action={notSil}><input type="hidden" name="id" value={n.id} /><button type="submit" className="panel-secondary mu-kucuk" title="Yanlış yazılan notu siler">Sil</button></form>
                </div>
              </li>
            );
          })}
        </ul>
      ) : <p className="pu-bos">Bu müşteri için henüz not yok.</p>}
    </KKart>
  );
}
