import Link from "next/link";
import { notFound } from "next/navigation";
import { getPanelContext } from "@/lib/panel-context";
import "../../../../crm/crm.css";
import "../../../../crm/kayit-detay/kayit-detay.css";

/*
  BELGE ERİŞİM GEÇMİŞİ (10.10.2026): panelin liste kalıbında.

  Eskiden her erişim kaydı ayrı bir KART olarak çiziliyordu (crm-record
  + yan panel): bir kayıt yarım ekran kaplıyordu, oysa burada okunan şey
  "kim, ne zaman, nereden" — yani bir kütük. Kütük tabloda okunur.

  SAYILAR SORGUDAN: liste artık sayfalanıyor, sayfadaki satırları saymak
  sayfa boyunu toplam sanmak olurdu. "Tekil IP" kutusu kaldırıldı;
  distinct sayımı tek sorguda yapılamıyor ve sayfadan hesaplamak yanlış
  olurdu — adresler zaten tabloda.
*/

const SAYFA_BOYU = 50;

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

type BelgeKaydi = { id: string; title: string; proposal_no?: string; contract_no?: string };

const ERISIM_ADI: Record<string, { ad: string; ton: string }> = {
  panel_preview: { ad: "Panel önizleme", ton: "neutral" },
  public_view: { ad: "Public görüntüleme", ton: "success" },
  pdf_print: { ad: "PDF / yazdırma", ton: "warning" },
  share_link: { ad: "Paylaşım bağlantısı", ton: "neutral" },
};

const tarihSaat = (deger: string) => new Date(deger).toLocaleString("tr-TR");

/* User-agent uzun ve okunmuyor; tabloda tarayıcı adı, ipucunda tamamı. */
const tarayici = (ua: string | null) => {
  if (!ua) return "Bilinmiyor";
  if (ua.includes("Edg/")) return "Microsoft Edge";
  if (ua.includes("Chrome/")) return "Google Chrome";
  if (ua.includes("Safari/") && !ua.includes("Chrome/")) return "Safari";
  if (ua.includes("Firefox/")) return "Firefox";
  return ua.slice(0, 60);
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

  const tablo = sozlesmeMi ? "crm_contracts" : "crm_proposals";
  const noSutunu = sozlesmeMi ? "contract_no" : "proposal_no";
  const { data: belgeVerisi, error: belgeHatasi } = await supabase
    .from(tablo).select(`id,${noSutunu},title`)
    .eq("id", id).eq("organization_id", membership.organization_id).maybeSingle();
  if (belgeHatasi) throw new Error(`Belge okunamadı: ${belgeHatasi.message}`);
  if (!belgeVerisi) notFound();
  const belge = belgeVerisi as unknown as BelgeKaydi;

  const sayfaNo = Math.max(1, Number.parseInt(sayfa ?? "1", 10) || 1);
  const secilenTur = turSuzgeci && ERISIM_ADI[turSuzgeci] ? turSuzgeci : "";

  const kutuk = () => supabase.from("document_access_logs")
    .select("id,access_type,actor_user_id,access_ip,user_agent,referrer,metadata,created_at", { count: "exact" })
    .eq("organization_id", membership.organization_id)
    .eq("document_type", type)
    .eq("document_id", id);

  const say = (erisimTuru?: string) => {
    let q = supabase.from("document_access_logs").select("id", { count: "exact", head: true })
      .eq("organization_id", membership.organization_id).eq("document_type", type).eq("document_id", id);
    if (erisimTuru) q = q.eq("access_type", erisimTuru);
    return q;
  };

  let liste = kutuk().order("created_at", { ascending: false })
    .range((sayfaNo - 1) * SAYFA_BOYU, sayfaNo * SAYFA_BOYU - 1);
  if (secilenTur) liste = liste.eq("access_type", secilenTur);

  const [
    { data, error, count: suzgecSayisi },
    { count: toplam },
    { count: publicSayisi },
    { count: pdfSayisi },
    { count: paylasimSayisi },
  ] = await Promise.all([liste, say(), say("public_view"), say("pdf_print"), say("share_link")]);
  if (error) throw new Error(`Erişim kayıtları okunamadı: ${error.message}`);

  const satirlar = (data ?? []) as ErisimKaydi[];
  const sonSayfa = typeof suzgecSayisi === "number"
    ? Math.max(1, Math.ceil(suzgecSayisi / SAYFA_BOYU))
    : satirlar.length === SAYFA_BOYU ? sayfaNo + 1 : sayfaNo;
  const belgeNo = (sozlesmeMi ? belge.contract_no : belge.proposal_no) || "Belge";

  const adres = (degisen: { tur?: string; sayfa?: string }) => {
    const p = new URLSearchParams();
    const t = "tur" in degisen ? degisen.tur : secilenTur;
    const s = "sayfa" in degisen ? degisen.sayfa : "";
    if (t) p.set("tur", t);
    if (s) p.set("sayfa", s);
    const kuyruk = p.size ? `?${p}` : "";
    return `/panel/documents/${type}/${id}/access-logs${kuyruk}`;
  };

  return <main className="talep cari ekip talepler liste-sayfa">
    <header className="talep-bas">
      <div className="talep-bas-metin">
        <small className="panel-kicker">DOKÜMANLAR · ERİŞİM GEÇMİŞİ</small>
        <h1>{belgeNo}</h1>
        <p>{belge.title}</p>
      </div>
      <div className="talep-bas-eylem">
        <Link className="panel-secondary" href={`/panel/documents/${type}/${id}`}>← Yaşam döngüsü</Link>
        <Link className="panel-secondary" href={`/panel/documents/${type}/${id}/preview`}>Önizle / PDF</Link>
      </div>
    </header>

    {/* Şerit hem sayaç hem süzgeç; rakamlar sorgudan geliyor. */}
    <nav className="kayit-serit talep-serit" aria-label="Erişim türüne göre süz">
      <dl>
        <div className={!secilenTur ? "is-active" : undefined}>
          <dt>Toplam erişim</dt>
          <dd><Link href={adres({ tur: "", sayfa: "" })}>{toplam ?? 0}</Link></dd>
        </div>
        <div className={secilenTur === "public_view" ? "is-active" : undefined}>
          <dt>Public görüntüleme</dt>
          <dd><Link href={adres({ tur: "public_view", sayfa: "" })}>{publicSayisi ?? 0}</Link></dd>
        </div>
        <div className={secilenTur === "pdf_print" ? "is-active" : undefined}>
          <dt>PDF / yazdırma</dt>
          <dd><Link href={adres({ tur: "pdf_print", sayfa: "" })}>{pdfSayisi ?? 0}</Link></dd>
        </div>
        <div className={secilenTur === "share_link" ? "is-active" : undefined}>
          <dt>Paylaşım bağlantısı</dt>
          <dd><Link href={adres({ tur: "share_link", sayfa: "" })}>{paylasimSayisi ?? 0}</Link></dd>
        </div>
      </dl>
    </nav>

    <div className="talep-izgara kayit-tek-izgara">
      <section className="panel-card talep-bilgi" aria-label="Erişim kayıtları">
        {satirlar.length ? (
          <>
            <div className="talep-tablo">
              <table className="crm-data-table" data-cols="erisim">
                <thead><tr>
                  <th>Erişim</th>
                  <th>Tarayıcı</th>
                  <th>IP</th>
                  <th>Kullanıcı</th>
                  <th className="crm-col-date">Zaman</th>
                </tr></thead>
                <tbody>
                  {satirlar.map((satir) => {
                    const etiket = ERISIM_ADI[satir.access_type] ?? { ad: satir.access_type, ton: "neutral" };
                    const kaynak = String(satir.metadata?.source ?? "");
                    return (
                      <tr key={satir.id}>
                        <td data-label="Erişim">
                          <span className="status-pill" data-tone={etiket.ton}>{etiket.ad}</span>
                          {kaynak ? <span className="crm-table-sub">{kaynak}</span> : null}
                        </td>
                        <td data-label="Tarayıcı">
                          <span className="crm-table-title" title={satir.user_agent ?? ""}>{tarayici(satir.user_agent)}</span>
                          {satir.referrer ? <span className="crm-table-sub" title={satir.referrer}>Yönlendiren: {satir.referrer}</span> : null}
                        </td>
                        <td data-label="IP" className="crm-table-mono">{satir.access_ip || <span className="talep-bos">—</span>}</td>
                        <td data-label="Kullanıcı">
                          <span className="crm-table-sub">{satir.actor_user_id ? "Oturum açmış kullanıcı" : "Anonim / public"}</span>
                        </td>
                        <td data-label="Zaman" className="crm-table-mono">{tarihSaat(satir.created_at)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {sonSayfa > 1 ? (
              <nav className="liste-sayfalar" aria-label="Sayfalar">
                {sayfaNo > 1
                  ? <Link href={adres({ sayfa: sayfaNo === 2 ? "" : String(sayfaNo - 1) })}>← Önceki</Link>
                  : <span aria-hidden="true">← Önceki</span>}
                <b>{sayfaNo} / {sonSayfa}{typeof suzgecSayisi === "number" ? ` · ${suzgecSayisi} kayıt` : ""}</b>
                {sayfaNo < sonSayfa
                  ? <Link href={adres({ sayfa: String(sayfaNo + 1) })}>Sonraki →</Link>
                  : <span aria-hidden="true">Sonraki →</span>}
              </nav>
            ) : null}
          </>
        ) : (
          <div className="crm-empty-state talep-bos-kutu">
            <h2>{secilenTur ? "Bu türde erişim yok" : "Henüz erişim kaydı yok"}</h2>
            <p>{secilenTur
              ? "Başka bir erişim türü seçin ya da tümünü görün."
              : "Belge önizlendiğinde, müşteri bağlantısı açıldığında ve PDF alındığında kayıt buraya düşer."}</p>
            {secilenTur ? <div className="crm-empty-actions"><Link className="panel-secondary" href={adres({ tur: "", sayfa: "" })}>Tümünü göster</Link></div> : null}
          </div>
        )}
      </section>
    </div>
  </main>;
}
