import Link from "next/link";
import { getPanelContext } from "@/lib/panel-context";
import { formatPersonName } from "@/lib/format-name";
import { kisiAdlari } from "@/lib/kisi-adlari";
import { formatSubject } from "@/lib/table-format";
import { MobilSatir, RepresentativeCell } from "../../crm/table-cells";
import { SatirTiklama } from "../../crm/satir-tiklama";
import { unarchiveWorkflow } from "../actions";
import { OpsIcon, shortDate, todayIstanbul } from "../ops-shared";
import { aramaDeseni } from "@/lib/liste-arama";
import { sayfaAraligi, sayfaNumarasi, sonSayfaNo } from "@/lib/liste-sayfalama";
import "../../crm/crm.css";
import "../../crm/kayit-detay/kayit-detay.css";
import "../operations.css";
import { modulGerek } from "@/lib/modul-kapisi";

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
  searchParams: Promise<{ arama?: string; sayfa?: string; donem?: string; kaynak?: string }>;
}) {
  const { arama, sayfa, donem, kaynak } = await searchParams;
  /* Arama deseni SÜZGECE GİRMEDEN temizleniyor: PostgREST'in `or`
     süzgeci virgülle ayrılmış bir metin, yani "Yılmaz, Ayşe" diye
     arayan kullanıcı sorguyu bozuyor ve sayfa hata veriyordu
     (lib/liste-arama.ts). */
  const desen = aramaDeseni(arama ?? "");
  const aranan = (arama ?? "").trim().slice(0, 80);
  const sayfaNo = sayfaNumarasi(sayfa);

  const { supabase, membership, modules, userId, izin } = await getPanelContext();
  modulGerek(modules, "operations");
  const organizationId = membership.organization_id;

  /*
    ŞERİT SÜZGEÇLERİ (12.10.2026). Sayfa yalnızca "Tümü" ve arama
    kutusu taşıyordu; arşivin asıl soruları ("bu ay neyi kapattık",
    "hangisi ödeme kapandığı için kendiliğinden kapandı") hiçbir yerde
    yanıtlanmıyordu.

    Şerit sayıları listeyle AYNI kümeden geliyor: aramaya saygılı,
    yalnızca kendi süzgeçleri farklı. Sayının gösterdiği küme ile
    tıklandığında açılan liste ayrı olursa rozet yanıltıcı olur
    (AGENTS.md "Liste sayfaları").
  */
  const seciliDonem = donem === "ay" ? "ay" : null;
  const seciliKaynak = kaynak === "otomatik" || kaynak === "elle" ? kaynak : null;
  const ayBasi = `${todayIstanbul().slice(0, 7)}-01`;

  const temel = (sayarak = false) => {
    let q = sayarak
      ? supabase.from("operation_workflows").select("id", { count: "exact", head: true })
      : supabase.from("operation_workflows")
          .select("id,title,customer_name,due_date,archived_at,archived_by,assigned_employee_id", { count: "exact" });
    q = q.eq("organization_id", organizationId).eq("status", "archived");
    if (desen) q = q.or(`title.ilike.*${desen}*,customer_name.ilike.*${desen}*`);
    return q;
  };
  /* "Otomatik" = arşivleyen kişi yok: ödeme kapandığında tetikleyici
     kapatıyor. "Elle" onun tersi. */
  const suzgecle = <T extends ReturnType<typeof temel>>(q: T) => {
    let s = q;
    if (seciliDonem === "ay") s = s.gte("archived_at", ayBasi) as T;
    if (seciliKaynak === "otomatik") s = s.is("archived_by", null) as T;
    else if (seciliKaynak === "elle") s = s.not("archived_by", "is", null) as T;
    return s;
  };

  const liste = suzgecle(temel())
    .order("archived_at", { ascending: false })
    .range(sayfaAraligi(sayfaNo)[0], sayfaAraligi(sayfaNo)[1]);

  const [
    { data, error, count: suzgecSayisi },
    { count: toplam },
    { count: buAy },
    { count: otomatik },
    { count: elle },
    { data: personelVerisi, error: personelHatasi },
  ] = await Promise.all([
    liste,
    temel(true),
    temel(true).gte("archived_at", ayBasi),
    temel(true).is("archived_by", null),
    temel(true).not("archived_by", "is", null),
    // Pasif personel de dahil: arşivdeki eski işlerin sorumlusu ayrılmış olabilir
    supabase.from("hr_employees").select("id,full_name,user_id,employment_status").eq("organization_id", organizationId),
  ]);
  if (error) throw new Error("Arşiv okunamadı: " + error.message);
  if (personelHatasi) throw new Error("Personeller okunamadı: " + personelHatasi.message);

  const isler = (data ?? []) as ArsivIsi[];
  const personeller = (personelVerisi ?? []) as { id: string; full_name: string; user_id: string | null; employment_status: string }[];
  const adById = new Map(personeller.map((personel) => [personel.id, personel.full_name]));
  /*
    Arşivleyenin adı personel kaydıyla SINIRLI DEĞİL. Eskiden yalnızca
    hr_employees'ten aranıyordu ve personel kaydı olmayan herkes — kurum
    sahibi dahil — "Ekip üyesi" diye yazılıyordu; kendi işini arşivleyen
    bir kurum sahibi arşiv listesinde isimsiz kalıyordu. Kural ve iki
    kaynağın sırası lib/kisi-adlari.ts'te.
  */
  const adByUser = await kisiAdlari(supabase, organizationId, isler.map((is) => is.archived_by));
  const yonetebilir = izin("operations.arsiv.yonet");
  const kendiPersonelId = personeller.find((p) => p.user_id === userId && p.employment_status === "active")?.id ?? null;

  // Arşivdeki işe müşteri yeniden yazmış olabilir: satırda kırmızı belirteç
  const idler = isler.map((is) => is.id);
  const { data: okunmamisSatirlar, error: okunmamisHatasi } = idler.length
    ? await supabase.from("customer_file_messages").select("workflow_id")
        .eq("organization_id", organizationId).eq("sender_type", "customer").is("read_at", null).in("workflow_id", idler)
    : { data: [] as { workflow_id: string }[], error: null };
  // Okunamazsa belirteç sessizce söner; "müşteri yazmamış" demek değil.
  if (okunmamisHatasi) throw new Error("Okunmamış müşteri mesajları okunamadı: " + okunmamisHatasi.message);
  const okunmamis = new Map<string, number>();
  for (const satir of (okunmamisSatirlar ?? []) as { workflow_id: string | null }[]) {
    if (satir.workflow_id) okunmamis.set(satir.workflow_id, (okunmamis.get(satir.workflow_id) ?? 0) + 1);
  }

  const sonSayfa = sonSayfaNo(suzgecSayisi, isler.length, sayfaNo);

  /* Süzgeç değişince sayfa başa dönüyor; arama korunuyor. */
  const adres = (degisen: { arama?: string; sayfa?: string; donem?: string; kaynak?: string }) => {
    const p = new URLSearchParams();
    const a = "arama" in degisen ? degisen.arama : aranan;
    const s = "sayfa" in degisen ? degisen.sayfa : "";
    const d = "donem" in degisen ? degisen.donem : seciliDonem ?? "";
    const k = "kaynak" in degisen ? degisen.kaynak : seciliKaynak ?? "";
    if (a) p.set("arama", a);
    if (d) p.set("donem", d);
    if (k) p.set("kaynak", k);
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

    <nav className="kayit-serit talep-serit" aria-label="Arşiv özeti">
      <dl>
        <div className={!seciliDonem && !seciliKaynak ? "is-active" : undefined}>
          <dt>Arşivdeki iş</dt>
          <dd><Link href={adres({ donem: "", kaynak: "", sayfa: "" })}>{toplam ?? 0}</Link></dd>
        </div>
        <div className={seciliDonem === "ay" ? "is-active" : undefined}>
          <dt>Bu ay arşivlenen</dt>
          <dd><Link href={adres({ donem: "ay", sayfa: "" })}>{buAy ?? 0}</Link></dd>
        </div>
        <div className={seciliKaynak === "otomatik" ? "is-active" : undefined}>
          <dt>Ödeme kapandı</dt>
          <dd><Link href={adres({ kaynak: "otomatik", sayfa: "" })}>{otomatik ?? 0}</Link></dd>
        </div>
        <div className={seciliKaynak === "elle" ? "is-active" : undefined}>
          <dt>Elle arşivlenen</dt>
          <dd><Link href={adres({ kaynak: "elle", sayfa: "" })}>{elle ?? 0}</Link></dd>
        </div>
      </dl>
    </nav>

    <div className="talep-izgara kayit-tek-izgara">
      <section className="panel-card talep-bilgi" aria-label="Arşivlenmiş işler">
        <div className="ekip-suzgec talep-suzgec">
          {aranan ? <span className="talep-suzgec-etiket">“{aranan}” · {suzgecSayisi ?? isler.length} sonuç</span> : null}
          <form className="talep-ara" method="get" action="/panel/operations/arsiv" role="search">
            {seciliDonem ? <input type="hidden" name="donem" value={seciliDonem} /> : null}
            {seciliKaynak ? <input type="hidden" name="kaynak" value={seciliKaynak} /> : null}
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
                        <MobilSatir
                          href={`/panel/operations/${is.id}`}
                          baslik={formatSubject(is.title)}
                          alt={[is.customer_name || "Kurum içi iş", is.assigned_employee_id ? formatPersonName(adById.get(is.assigned_employee_id) ?? "Pasif personel") : "Atanmamış"]}
                          isaretler={[
                            yeniMesaj ? { metin: `${yeniMesaj} yeni mesaj`, ton: "tehlike" } : null,
                            { metin: `Arşiv ${shortDate(is.archived_at)}`, ton: "bilgi" },
                            { metin: is.archived_by ? adByUser.get(is.archived_by) ?? "Ekip üyesi" : "Otomatik (ödeme kapandı)", ton: "sessiz" },
                          ]}
                        />
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
