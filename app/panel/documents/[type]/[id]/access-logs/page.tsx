import Link from "next/link";
import { MobilSatir } from "@/app/panel/crm/table-cells";
import { notFound } from "next/navigation";
import { getPanelContext } from "@/lib/panel-context";
import { formatPersonName } from "@/lib/format-name";
import { summarizeUserAgent } from "@/app/_components/legal/format";
import { sayfaAraligi, sayfaNumarasi, sonSayfaNo } from "@/lib/liste-sayfalama";
import { IstatistikKarti } from "../../../../crm/istatistik-karti";
import "../../../../crm/crm.css";
import "../../../../crm/kayit-detay/kayit-detay.css";

/*
  BELGE ERİŞİM GEÇMİŞİ (10.10.2026): panelin liste kalıbında; kütük
  tabloda okunur.

  12.10.2026: Belge Merkezi ve yaşam döngüsüyle aynı kalite.
  - "Kim" sütunu personelin ADINI yazıyor (hr_employees); eskiden yalnızca
    "Oturum açmış kullanıcı" diyordu. Müşteri erişimi "Müşteri".
  - Kaynak ham adla (public_proposal_pdf …) yazılıyordu; artık Türkçe.
  - Cihaz: tarayıcı, sürüm ve işletim sistemi (summarizeUserAgent, imza
    kaydıyla aynı özet); eskiden yalnızca tarayıcı adı.
  - Saat Türkiye saatiyle (sunucu UTC'de çalışıyor).
  - Panelde önizleme de sayılıyor; sağda özet kartı: müşterinin ilk ve son
    açılışı belgenin kendi kaydından (view_count, first/last_viewed_at),
    tür dağılımı head sorgularından.

  SAYILAR SORGUDAN: liste sayfalanıyor, sayfadaki satırları saymak sayfa
  boyunu toplam sanmak olurdu. Tekil IP sayısı yok: distinct sayım tek
  sorguda yapılamıyor, sayfadan hesaplamak yanlış olurdu.
*/

type ErisimKaydi = {
  id: string;
  access_type: string;
  actor_user_id: string | null;
  access_ip: string | null;
  user_agent: string | null;
  referrer: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

type BelgeKaydi = {
  id: string; title: string | null; proposal_no?: string; contract_no?: string;
  view_count: number | null; first_viewed_at: string | null; last_viewed_at: string | null;
};

const TURLER = ["public_view", "pdf_print", "share_link", "panel_preview"] as const;
const ERISIM_ADI: Record<string, { ad: string; ton: string }> = {
  public_view: { ad: "Müşteri görüntüledi", ton: "success" },
  pdf_print: { ad: "PDF / yazdırma", ton: "warning" },
  share_link: { ad: "Bağlantı paylaşıldı", ton: "info" },
  panel_preview: { ad: "Panelde önizleme", ton: "neutral" },
};
/* Kaydı yazan yer (metadata.source); bilinmeyen kaynak gösterilmez. */
const KAYNAK_ADI: Record<string, string> = {
  public_contract: "Müşterinin sözleşme sayfası",
  public_proposal_pdf: "Müşterinin teklif PDF'i",
  pdf_download_link: "PDF indirme düğmesi",
  document_center_shared_renderer: "Belge Merkezi önizlemesi",
};

const tarihSaat = (deger: string | null) =>
  deger ? new Date(deger).toLocaleString("tr-TR", { timeZone: "Europe/Istanbul", dateStyle: "medium", timeStyle: "short" }) : "—";
/* Yönlendiren adresin yalnızca alan adı: tam adres sorgu dizesi taşıyabiliyor. */
const alanAdi = (adres: string | null) => {
  if (!adres) return null;
  try { return new URL(adres).host || null; } catch { return null; }
};

export default async function BelgeErisimGecmisi({ params, searchParams }: {
  params: Promise<{ type: string; id: string }>;
  searchParams: Promise<{ tur?: string; sayfa?: string }>;
}) {
  const { type, id } = await params;
  const { tur: turSuzgeci, sayfa } = await searchParams;
  if (!["proposal", "contract"].includes(type)) notFound();
  const sozlesmeMi = type === "contract";

  const { supabase, membership, modules } = await getPanelContext();
  if (!modules.some((modul) => ["documents", "crm"].includes(modul.code))) {
    throw new Error("Belge erişim geçmişine erişiminiz yok.");
  }
  const org = membership.organization_id;

  const noSutunu = sozlesmeMi ? "contract_no" : "proposal_no";
  const { data: belgeVerisi, error: belgeHatasi } = await supabase
    .from(sozlesmeMi ? "crm_contracts" : "crm_proposals").select(`id,${noSutunu},title,view_count,first_viewed_at,last_viewed_at`)
    .eq("id", id).eq("organization_id", org).maybeSingle();
  if (belgeHatasi) throw new Error(`Belge okunamadı: ${belgeHatasi.message}`);
  if (!belgeVerisi) notFound();
  const belge = belgeVerisi as unknown as BelgeKaydi;

  const sayfaNo = sayfaNumarasi(sayfa);
  const secilenTur = turSuzgeci && ERISIM_ADI[turSuzgeci] ? turSuzgeci : "";
  const say = (erisimTuru?: string) => {
    let q = supabase.from("document_access_logs").select("id", { count: "exact", head: true })
      .eq("organization_id", org).eq("document_type", type).eq("document_id", id);
    if (erisimTuru) q = q.eq("access_type", erisimTuru);
    return q;
  };
  let liste = supabase.from("document_access_logs")
    .select("id,access_type,actor_user_id,access_ip,user_agent,referrer,metadata,created_at", { count: "exact" })
    .eq("organization_id", org).eq("document_type", type).eq("document_id", id)
    .order("created_at", { ascending: false })
    .range(...sayfaAraligi(sayfaNo));
  if (secilenTur) liste = liste.eq("access_type", secilenTur);

  const [{ data, error, count: suzgecSayisi }, toplamSonucu, ...turSonuclari] = await Promise.all([liste, say(), ...TURLER.map((tur) => say(tur))]);
  if (error) throw new Error(`Erişim kayıtları okunamadı: ${error.message}`);
  const sayimHatasi = toplamSonucu.error ?? turSonuclari.find((sonuc) => sonuc.error)?.error;
  if (sayimHatasi) throw new Error(`Erişim sayıları okunamadı: ${sayimHatasi.message}`);
  const turSayisi = (tur: string) => turSonuclari[TURLER.indexOf(tur as (typeof TURLER)[number])]?.count ?? 0;

  const satirlar = (data ?? []) as ErisimKaydi[];
  const sonSayfa = sonSayfaNo(suzgecSayisi, satirlar.length, sayfaNo);

  /* Kim: sayfadaki personelin adı; panel hesabı personel kaydına bağlı. */
  const kullaniciIdleri = [...new Set(satirlar.map((satir) => satir.actor_user_id).filter((v): v is string => Boolean(v)))];
  const { data: personel } = kullaniciIdleri.length
    ? await supabase.from("hr_employees").select("user_id,full_name").eq("organization_id", org).in("user_id", kullaniciIdleri)
    : { data: [] };
  const personelAdi = new Map(((personel ?? []) as { user_id: string; full_name: string }[]).map((p) => [p.user_id, formatPersonName(p.full_name) || p.full_name]));

  const belgeNo = (sozlesmeMi ? belge.contract_no : belge.proposal_no) || "Belge";
  const adres = (degisen: { tur?: string; sayfa?: number }) => {
    const p = new URLSearchParams();
    const t = "tur" in degisen ? degisen.tur : secilenTur;
    if (t) p.set("tur", t);
    if (degisen.sayfa && degisen.sayfa > 1) p.set("sayfa", String(degisen.sayfa));
    return `/panel/documents/${type}/${id}/access-logs${p.size ? `?${p}` : ""}`;
  };
  const seritKutusu = (ad: string, deger: number, kod: string) => (
    <div className={secilenTur === kod ? "is-active" : undefined}>
      <dt>{ad}</dt>
      <dd><Link href={adres({ tur: kod })} aria-current={secilenTur === kod ? "page" : undefined}>{deger}</Link></dd>
    </div>
  );

  return <main className="talep cari ekip talepler liste-sayfa">
    <header className="talep-bas">
      <div className="talep-bas-metin">
        <small className="panel-kicker">{belgeNo} · ERİŞİM GEÇMİŞİ</small>
        <h1>{belge.title || belgeNo}</h1>
      </div>
      <div className="talep-bas-eylem">
        <Link className="panel-primary" href={`/panel/documents/${type}/${id}/preview`}>Önizle / PDF</Link>
        <details className="os-menu talep-menu">
          <summary className="panel-secondary" aria-label="Diğer işlemler">⋯</summary>
          <div className="os-menu-list" role="menu">
            <Link className="os-menu-item" href={`/panel/documents/${type}/${id}`}>Yaşam döngüsü</Link>
            <Link className="os-menu-item" href={sozlesmeMi ? `/panel/crm/contracts/${id}` : `/panel/crm/proposals/${id}`}>{sozlesmeMi ? "Sözleşmeye git" : "Teklife git"}</Link>
            <Link className="os-menu-item" href="/panel/documents">Belge Merkezi</Link>
          </div>
        </details>
      </div>
    </header>

    {/* Şerit hem sayaç hem süzgeç; rakamlar head sorgularından. */}
    <nav className="kayit-serit talep-serit" aria-label="Erişim türüne göre süz">
      <dl>
        {seritKutusu("Toplam erişim", toplamSonucu.count ?? 0, "")}
        {TURLER.map((tur) => <div key={tur} className={secilenTur === tur ? "is-active" : undefined}>
          <dt>{ERISIM_ADI[tur].ad}</dt>
          <dd><Link href={adres({ tur })} aria-current={secilenTur === tur ? "page" : undefined}>{turSayisi(tur)}</Link></dd>
        </div>)}
      </dl>
    </nav>

    <div className="talep-izgara personel-iki ekip-izgara">
      <section className="panel-card talep-bilgi" aria-label="Erişim kayıtları">
        <div className="ekip-suzgec talep-suzgec">
          <Link href={adres({ tur: "" })} className={!secilenTur ? "is-active" : undefined}>Tümü <small>{toplamSonucu.count ?? 0}</small></Link>
          {secilenTur ? <span className="talep-suzgec-etiket">{ERISIM_ADI[secilenTur].ad}</span> : null}
        </div>
        {satirlar.length ? (
          <div className="talep-tablo">
            <table className="crm-data-table" data-cols="erisim">
              <thead><tr>
                <th>Erişim</th>
                <th>Kim</th>
                <th>Cihaz</th>
                <th>IP</th>
                <th className="crm-col-date">Zaman</th>
              </tr></thead>
              <tbody>
                {satirlar.map((satir) => {
                  const etiket = ERISIM_ADI[satir.access_type] ?? { ad: satir.access_type, ton: "neutral" };
                  const kaynak = KAYNAK_ADI[String(satir.metadata?.source ?? "")];
                  const yonlendiren = alanAdi(satir.referrer);
                  const kim = satir.actor_user_id ? personelAdi.get(satir.actor_user_id) ?? "Panel kullanıcısı" : "Müşteri";
                  return (
                    <tr key={satir.id}>
                      <td data-label="Erişim">
                        <span className="status-pill" data-tone={etiket.ton}>{etiket.ad}</span>
                        {kaynak ? <span className="crm-table-sub">{kaynak}</span> : null}
                      </td>
                      <td data-label="Kim">
                        <span className="crm-table-title">{kim}</span>
                        {yonlendiren ? <span className="crm-table-sub" title={satir.referrer ?? ""}>{yonlendiren} üzerinden</span> : null}
                      </td>
                      <td data-label="Cihaz">
                        <span className="crm-table-sub" title={satir.user_agent ?? ""}>{summarizeUserAgent(satir.user_agent) ?? "Bilinmiyor"}</span>
                      </td>
                      <td data-label="IP" className="crm-table-mono">{satir.access_ip || <span className="talep-bos">—</span>}</td>
                      <td data-label="Zaman" className="crm-table-mono">{tarihSaat(satir.created_at)}</td>
                      <MobilSatir
                        baslik={kim}
                        durum={{ etiket: etiket.ad, ton: etiket.ton }}
                        alt={[summarizeUserAgent(satir.user_agent) ?? "Cihaz bilinmiyor", yonlendiren ? `${yonlendiren} üzerinden` : null]}
                        isaretler={[
                          { metin: tarihSaat(satir.created_at), ton: "bilgi" },
                          kaynak ? { metin: kaynak, ton: "sessiz" } : null,
                          satir.access_ip ? { metin: satir.access_ip, ton: "sessiz" } : null,
                        ]}
                      />
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {sonSayfa > 1 ? (
              <nav className="liste-sayfalar" aria-label="Sayfalar">
                {sayfaNo > 1
                  ? <Link className="panel-secondary" href={adres({ sayfa: sayfaNo - 1 })}>← Önceki</Link>
                  : <span className="panel-secondary is-disabled" aria-disabled="true">← Önceki</span>}
                <small>{sayfaNo} / {sonSayfa}{typeof suzgecSayisi === "number" ? ` · ${suzgecSayisi} kayıt` : ""}</small>
                {sayfaNo < sonSayfa
                  ? <Link className="panel-secondary" href={adres({ sayfa: sayfaNo + 1 })}>Sonraki →</Link>
                  : <span className="panel-secondary is-disabled" aria-disabled="true">Sonraki →</span>}
              </nav>
            ) : null}
          </div>
        ) : (
          <div className="crm-empty-state talep-bos-kutu">
            <h2>{secilenTur ? "Bu türde erişim yok" : "Henüz erişim kaydı yok"}</h2>
            <p>{secilenTur
              ? "Başka bir erişim türü seçin ya da tümünü görün."
              : "Belge önizlendiğinde, müşteri bağlantısı açıldığında ve PDF alındığında kayıt buraya düşer."}</p>
            {secilenTur ? <div className="crm-empty-actions"><Link className="panel-secondary" href={adres({ tur: "" })}>Tümünü göster</Link></div> : null}
          </div>
        )}
      </section>

      <IstatistikKarti
        kapsam="bu belge"
        kutular={[
          { ad: "Müşteri açılışı", deger: String(belge.view_count ?? 0), alt: belge.view_count ? "bağlantıdan görüntülenme" : "henüz açılmadı", ton: belge.view_count ? "arti" : undefined },
          { ad: "PDF / yazdırma", deger: String(turSayisi("pdf_print")), alt: "indirme ve yazdırma" },
          { ad: "İlk açılış", deger: belge.first_viewed_at ? new Date(belge.first_viewed_at).toLocaleDateString("tr-TR", { timeZone: "Europe/Istanbul", day: "numeric", month: "short" }) : "—", alt: belge.first_viewed_at ? tarihSaat(belge.first_viewed_at) : "müşteri açmadı" },
          { ad: "Son açılış", deger: belge.last_viewed_at ? new Date(belge.last_viewed_at).toLocaleDateString("tr-TR", { timeZone: "Europe/Istanbul", day: "numeric", month: "short" }) : "—", alt: belge.last_viewed_at ? tarihSaat(belge.last_viewed_at) : "müşteri açmadı" },
        ]}
        gruplar={[
          { baslik: "Erişim türüne göre", satirlar: TURLER.map((tur) => ({ ad: ERISIM_ADI[tur].ad, adet: turSayisi(tur) })).filter((satir) => satir.adet > 0) },
        ]}
      />
    </div>
  </main>;
}
