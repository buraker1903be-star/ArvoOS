import Link from "next/link";
import { getPanelContext } from "@/lib/panel-context";
import { formatPersonName } from "@/lib/format-name";
import { formatSubject } from "@/lib/table-format";
import { RepresentativeCell } from "../../crm/table-cells";
import { SatirTiklama } from "../../crm/satir-tiklama";
import { unarchiveWorkflow } from "../actions";
import { OpsIcon, shortDate } from "../ops-shared";
import "../../crm/crm.css";
import "../../crm/kayit-detay/kayit-detay.css";
import "../operations.css";

/*
  OPERASYON ARŞİVİ (10.10.2026): panelin liste kalıbında. Tamamlanıp
  arşive gönderilen işler; "Arşivden çıkar" işi tamamlandı durumuna
  geri alır.

  Eskiden panel-pagehead başlığı, ayrı bir süzgeç kartı ve
  crm-table-wrap içinde bir tablo vardı — İşler listesi tabloya
  geçtiğinde burası geride kalmıştı.

  ARAMA VE SAYFALAMA SUNUCUDA. Önceki sürüm en son 500 işi çekip
  JavaScript'te süzüyor, 500'ü aşınca da "daha eskisi için arama yapın"
  yazıyordu — ama arama da aynı 500 kaydın içinde yapıldığı için daha
  eskisini hiç bulamıyordu. Artık süzgeç sorguda ve liste sayfalanıyor.
*/

const SAYFA_BOYU = 50;

type ArsivIsi = {
  id: string;
  title: string;
  customer_name: string | null;
  due_date: string | null;
  archived_at: string | null;
  archived_by: string | null;
  assigned_employee_id: string | null;
};

export default async function OperasyonArsivi({ searchParams }: {
  searchParams: Promise<{ arama?: string; sayfa?: string }>;
}) {
  const { arama, sayfa } = await searchParams;
  const aranan = (arama ?? "").trim().slice(0, 80);
  const sayfaNo = Math.max(1, Number.parseInt(sayfa ?? "1", 10) || 1);

  const { supabase, membership, modules, userId, izin } = await getPanelContext();
  if (!modules.some((modul) => modul.code === "operations")) throw new Error("Operasyon modülüne erişiminiz yok.");
  const organizationId = membership.organization_id;

  let liste = supabase.from("operation_workflows")
    .select("id,title,customer_name,due_date,archived_at,archived_by,assigned_employee_id", { count: "exact" })
    .eq("organization_id", organizationId)
    .eq("status", "archived")
    .order("archived_at", { ascending: false })
    .range((sayfaNo - 1) * SAYFA_BOYU, sayfaNo * SAYFA_BOYU - 1);
  if (aranan) liste = liste.or(`title.ilike.*${aranan}*,customer_name.ilike.*${aranan}*`);

  const [
    { data, error, count: suzgecSayisi },
    { count: toplam },
    { data: personelVerisi, error: personelHatasi },
  ] = await Promise.all([
    liste,
    supabase.from("operation_workflows").select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId).eq("status", "archived"),
    // Pasif personel de dahil: arşivdeki eski işlerin sorumlusu ayrılmış olabilir
    supabase.from("hr_employees").select("id,full_name,user_id,employment_status").eq("organization_id", organizationId),
  ]);
  if (error) throw new Error("Arşiv okunamadı: " + error.message);
  if (personelHatasi) throw new Error("Personeller okunamadı: " + personelHatasi.message);

  const isler = (data ?? []) as ArsivIsi[];
  const personeller = (personelVerisi ?? []) as { id: string; full_name: string; user_id: string | null; employment_status: string }[];
  const adById = new Map(personeller.map((personel) => [personel.id, personel.full_name]));
  const adByUser = new Map(personeller.filter((p) => p.user_id).map((p) => [p.user_id as string, formatPersonName(p.full_name)]));
  const yonetebilir = izin("operations.arsiv.yonet");
  const kendiPersonelId = personeller.find((p) => p.user_id === userId && p.employment_status === "active")?.id ?? null;

  // Arşivdeki işe müşteri yeniden yazmış olabilir: satırda kırmızı belirteç
  const idler = isler.map((is) => is.id);
  const { data: okunmamisSatirlar } = idler.length
    ? await supabase.from("customer_file_messages").select("workflow_id")
        .eq("organization_id", organizationId).eq("sender_type", "customer").is("read_at", null).in("workflow_id", idler)
    : { data: [] as { workflow_id: string }[] };
  const okunmamis = new Map<string, number>();
  for (const satir of (okunmamisSatirlar ?? []) as { workflow_id: string | null }[]) {
    if (satir.workflow_id) okunmamis.set(satir.workflow_id, (okunmamis.get(satir.workflow_id) ?? 0) + 1);
  }

  const sonSayfa = typeof suzgecSayisi === "number"
    ? Math.max(1, Math.ceil(suzgecSayisi / SAYFA_BOYU))
    : isler.length === SAYFA_BOYU ? sayfaNo + 1 : sayfaNo;

  const adres = (degisen: { arama?: string; sayfa?: string }) => {
    const p = new URLSearchParams();
    const a = "arama" in degisen ? degisen.arama : aranan;
    const s = "sayfa" in degisen ? degisen.sayfa : "";
    if (a) p.set("arama", a);
    if (s) p.set("sayfa", s);
    return p.size ? `/panel/operations/arsiv?${p}` : "/panel/operations/arsiv";
  };

  return <main className="talep cari ekip talepler liste-sayfa">
    <header className="talep-bas">
      <div className="talep-bas-metin">
        <small className="panel-kicker">OPERASYON · ARŞİV</small>
        <h1>Arşiv</h1>
        <p>Tamamlanıp arşive gönderilen işler aktif listede görünmez.</p>
      </div>
      <div className="talep-bas-eylem">
        <Link className="panel-secondary" href="/panel/operations/isler">← Aktif işler</Link>
      </div>
    </header>

    <div className="talep-izgara kayit-tek-izgara">
      <section className="panel-card talep-bilgi" aria-label="Arşivlenmiş işler">
        <div className="ekip-suzgec talep-suzgec">
          <Link href={adres({ arama: "", sayfa: "" })} className={!aranan ? "is-active" : undefined}>
            Tümü <small>{toplam ?? 0}</small>
          </Link>
          {aranan ? <span className="talep-suzgec-etiket">{suzgecSayisi ?? isler.length} sonuç</span> : null}
          <form className="talep-ara" method="get" action="/panel/operations/arsiv" role="search">
            <input name="arama" defaultValue={aranan} placeholder="İş başlığı ya da müşteri adı" aria-label="Arşivde ara" />
          </form>
        </div>

        {isler.length ? (
          <>
            <div className="talep-tablo">
              <table className="crm-data-table" data-cols="ops-archive">
                <thead><tr>
                  <th>İş</th>
                  <th className="crm-col-rep">Sorumlu</th>
                  <th className="crm-col-date">Arşivlenme</th>
                  <th>Arşivleyen</th>
                  <th className="crm-col-date">Termin</th>
                  <th></th>
                </tr></thead>
                <tbody>
                  {isler.map((is) => {
                    const yeniMesaj = okunmamis.get(is.id) ?? 0;
                    const yetkili = yonetebilir || (Boolean(kendiPersonelId) && is.assigned_employee_id === kendiPersonelId);
                    return (
                      <tr key={is.id} className={yeniMesaj ? "has-alert" : undefined}>
                        {/* Satırın tamamı bu bağlantıyla tıklanır (kayit-detay.css, ilk hücre) */}
                        <td data-label="İş">
                          <Link className="crm-row-link" href={`/panel/operations/${is.id}`} aria-label={`${is.title} işini aç`}>
                            <span className="crm-table-title" title={is.title}>{formatSubject(is.title)}</span>
                            <span className="crm-table-sub">{is.customer_name || "Kurum içi iş"}</span>
                            {yeniMesaj ? <span className="crm-alert-chip">{yeniMesaj} yeni müşteri mesajı</span> : null}
                          </Link>
                        </td>
                        <RepresentativeCell label="Sorumlu" name={is.assigned_employee_id ? adById.get(is.assigned_employee_id) ?? "Pasif personel" : null} />
                        <td data-label="Arşivlenme" className="crm-col-date">{shortDate(is.archived_at)}</td>
                        <td data-label="Arşivleyen">
                          <span className="crm-table-sub">{is.archived_by ? adByUser.get(is.archived_by) ?? "Ekip üyesi" : "Otomatik (ödeme kapandı)"}</span>
                        </td>
                        <td data-label="Termin" className="crm-col-date">{shortDate(is.due_date)}</td>
                        <td className="crm-table-actions ops-row-actions">
                          {yetkili ? (
                            <form action={unarchiveWorkflow}>
                              <input type="hidden" name="workflow_id" value={is.id} />
                              <button type="submit" className="ops-unarchive-btn"><OpsIcon name="unarchive" size={15} />Arşivden çıkar</button>
                            </form>
                          ) : <span className="crm-row-chevron" aria-hidden="true">›</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <SatirTiklama />
            </div>

            {sonSayfa > 1 ? (
              <nav className="liste-sayfalar" aria-label="Sayfalar">
                {sayfaNo > 1
                  ? <Link href={adres({ sayfa: sayfaNo === 2 ? "" : String(sayfaNo - 1) })}>← Önceki</Link>
                  : <span aria-hidden="true">← Önceki</span>}
                <b>{sayfaNo} / {sonSayfa}{typeof suzgecSayisi === "number" ? ` · ${suzgecSayisi} iş` : ""}</b>
                {sayfaNo < sonSayfa
                  ? <Link href={adres({ sayfa: String(sayfaNo + 1) })}>Sonraki →</Link>
                  : <span aria-hidden="true">Sonraki →</span>}
              </nav>
            ) : null}
          </>
        ) : (
          <div className="crm-empty-state talep-bos-kutu">
            <h2>{aranan ? "Eşleşen arşiv kaydı yok" : "Arşiv boş"}</h2>
            <p>{aranan
              ? "Aramayı değiştirip yeniden deneyin."
              : "Tamamlanan işleri İşler sekmesinden “Arşivle” ile buraya gönderebilirsiniz."}</p>
            {aranan ? <div className="crm-empty-actions"><Link className="panel-secondary" href={adres({ arama: "", sayfa: "" })}>Aramayı temizle</Link></div> : null}
          </div>
        )}
      </section>
    </div>
  </main>;
}
