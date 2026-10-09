import Link from "next/link";
import { notFound } from "next/navigation";
import { getPanelContext } from "@/lib/panel-context";
import { formatPhone } from "@/lib/format-phone";
import { formatPersonName } from "@/lib/format-name";
import { waMeAdresi } from "@/lib/wa-me";
import { postaDurumu } from "@/lib/posta-hesabi";
import { ILETISIM_ALANLARI, KUNYE_ALANLARI, KUNYE_EN_UZUN, doluAlanlar, type Kunye } from "@/lib/musteri-kunyesi";
import { PostaAkisi, WhatsappAkisi, musteriPostalari, musteriWhatsapp, type PostaKonusmasi } from "../crm/musteri-yazismalari";
import { findCustomerHistory, LOOKUP_MAX_ITEMS, formatHistoryDate, type CustomerHistoryResult, type HistoryKind } from "../crm/customer-history-query";
import { buildAccountBalances } from "../finance/account-balances";
import { TalepAkis } from "../crm/kayit-detay/kayit-akis";
import { PanelModal } from "../components/panel-modal";
import { PanelDrawer } from "../components/panel-drawer";
import { CariHesapIcerigi } from "../accounts/cari-hesap";
import { musteriBilgileriniKaydet } from "./actions";
import { SatirTiklama } from "../crm/satir-tiklama";
import "../crm/crm.css";
import "../crm/kayit-detay/kayit-detay.css";
import "../finance/finance.css";

/*
  MÜŞTERİ DETAYI (2026-10): CRM'in müşteri sayfası ile Finans'ın
  "Müşteriler" detayı TEK sayfa. İki adresten açılıyor, içerik aynı:

    /panel/crm/musteri/[talep]   müşterinin bir talebinden
    /panel/finance/musteri/[cari] müşterinin carisinden (Müşteriler listesi)

  İki adres modül kapısı yüzünden: /panel/crm altı CRM'i, /panel/finance
  altı finansı istiyor; yalnızca finansı olan biri de müşteriyi
  görebilmeli. Adreste telefon ya da ad yazmıyor (kişisel veri URL'ye
  girmez): kayıt kimlikleri var.

  Eskiden cari hesap ayrı bir sayfaydı (/panel/accounts/[id]) ve müşteri
  sayfasıyla arasında gidip gelmek gerekiyordu; artık "Cari hesap"
  düğmesi ortada bir pencere açıyor ("Müşteri sorgula" gibi). Eski adres
  bu sayfaya, pencere açık olarak yönleniyor (?pencere=cari).

  Müşterinin bilgileri ve künyesi buradan düzenleniyor ("Bilgileri
  düzenle"): iletişim ve künye en son talebe, vergi/adres bilgisi cariye
  yazılıyor (bkz. ./actions.ts).
*/

type Mesaj = { id: string; sender_type: "customer" | "staff"; sender_name: string; body: string; created_at: string; read_at: string | null; contract_id: string | null; workflow_id: string | null };
type Talep = { id: string; customer_name: string; contact_phone: string | null; contact_email: string | null; request_details: Record<string, unknown> | null; source: string | null; created_at: string };
type Cari = { id: string; name: string; phone: string | null; email: string | null; tax_number: string | null; tax_office: string | null; address: string | null };

const TUR_SIRASI: HistoryKind[] = ["request", "proposal", "contract", "job"];
const TUR_ADLARI: Record<HistoryKind, string> = { request: "Talep", proposal: "Teklif", contract: "Sözleşme", job: "İş" };
const money = (kurus: number) => new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY" }).format(kurus / 100);
const TALEP_ALANLARI = "id,customer_name,contact_phone,contact_email,request_details,source,created_at";

export async function MusteriDetayi({ talepId, cariId, pencere, adres }: {
  talepId?: string;
  cariId?: string;
  /** ?pencere=cari: cari penceresi açık başlar (eski cari adresinden gelen). */
  pencere?: string;
  /** Sayfanın kendi adresi: pencere kapanınca parametresiz buraya dönülür. */
  adres: string;
}) {
  const context = await getPanelContext();
  const { supabase, membership, modules, izin } = context;
  const org = membership.organization_id;
  const crmVar = modules.some((m) => m.code === "crm");
  const cariModulu = modules.some((m) => m.code === "accounts");

  /* ---- Çapa: müşterinin bir talebi ve/veya carisi ---- */
  let talep: Talep | null = null;
  if (talepId) {
    if (!crmVar) throw new Error("CRM modülüne erişiminiz yok.");
    const { data } = await supabase.from("crm_opportunities").select(TALEP_ALANLARI).eq("id", talepId).eq("organization_id", org).maybeSingle();
    if (!data) notFound();
    talep = data as Talep;
  }
  let cariKaydi: Cari | null = null;
  if (cariId) {
    if (!cariModulu) throw new Error("Cari hesap modülüne erişiminiz yok.");
    const { data } = await supabase.from("account_parties").select("id,name,phone,email,tax_number,tax_office,address").eq("id", cariId).eq("organization_id", org).maybeSingle();
    if (!data) notFound();
    cariKaydi = data as Cari;
    /* Cariden açıldıysa CRM tarafı carinin en son sözleşmesinin talebinden:
       kayıtlar, künye ve yazışmalar oradan bulunuyor. */
    if (crmVar) {
      const { data: sozlesme } = await supabase.from("crm_contracts").select("opportunity_id").eq("organization_id", org).eq("party_id", cariId).order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (sozlesme?.opportunity_id) {
        const { data: t } = await supabase.from("crm_opportunities").select(TALEP_ALANLARI).eq("id", sozlesme.opportunity_id).eq("organization_id", org).maybeSingle();
        talep = (t as Talep | null) ?? null;
      }
    }
  }

  /* ---- Kayıtlar (CRM): sorgulama penceresiyle aynı sorgu ve yetki kuralı ---- */
  let gecmis: CustomerHistoryResult | null = null;
  if (crmVar && talep) {
    gecmis = await findCustomerHistory(context, { phone: talep.contact_phone, name: talep.customer_name }, { maxItems: LOOKUP_MAX_ITEMS });
  }
  const kayitlar = gecmis?.items ?? [];
  const sayilar = gecmis?.counts ?? { request: 0, proposal: 0, contract: 0, job: 0 };
  const kimlikIleri = (anahtar: string) => kayitlar.filter((k) => k.key.startsWith(`${anahtar}:`)).map((k) => k.key.slice(anahtar.length + 1));
  const sozlesmeIdleri = kimlikIleri("contract");
  const isIdleri = kimlikIleri("job");

  /*
    MÜŞTERİNİN CARİLERİ: açılan cari ve müşterinin sözleşmelerinin bağlı
    olduğu bütün cariler. Aynı müşteri için birden çok cari açılmış
    olabiliyor (09.10.2026'da bir müşterinin üç sözleşmesi iki cariye
    dağılmıştı); eskiden yalnızca ilk sözleşmenin carisi alınıyordu ve
    talepten açılan sayfa ile cariden açılan sayfa farklı bakiye
    gösteriyordu. Şeritteki bakiye hepsinin toplamı, pencerede her cari
    ayrı bölüm.
  */
  let cariIdleri: string[] = cariId ? [cariId] : [];
  if (cariModulu && sozlesmeIdleri.length) {
    const { data: partyRows } = await supabase.from("crm_contracts").select("party_id").eq("organization_id", org).in("id", sozlesmeIdleri).not("party_id", "is", null);
    cariIdleri = [...new Set([...cariIdleri, ...((partyRows ?? []) as { party_id: string }[]).map((r) => r.party_id)])];
  }

  /* ---- Cari özeti (şeritteki açık bakiye, bütün carilerin toplamı) ---- */
  let bakiye: number | null = null;
  let cariler: { id: string; name: string }[] = [];
  if (cariModulu && cariIdleri.length) {
    const [{ data: partyData }, { data: partyContracts }] = await Promise.all([
      supabase.from("account_parties").select("id,name,phone,email,tax_number,tax_office,address,account_entries(id,entry_type,amount,source_type,transaction_date,description)").eq("organization_id", org).in("id", cariIdleri),
      supabase.from("crm_contracts").select("party_id,amount").eq("organization_id", org).in("party_id", cariIdleri).in("status", ["signed", "completed"]),
    ]);
    // Açılan cari önce; sonra müşterinin diğer carileri.
    const partiler = ((partyData ?? []) as unknown as (Cari & { account_entries: unknown })[]).sort((a, b) => cariIdleri.indexOf(a.id) - cariIdleri.indexOf(b.id));
    if (partiler.length) {
      cariKaydi ??= partiler[0];
      cariler = partiler.map((p) => ({ id: p.id, name: p.name }));
      const { accounts } = buildAccountBalances(partiler as never[], (partyContracts ?? []) as { party_id: string | null; amount: number }[]);
      bakiye = (accounts as unknown as { balance: number }[]).reduce((toplam, a) => toplam + a.balance, 0);
    }
  }
  const cariKimligi = cariKaydi?.id ?? null;

  /* ---- Takip ekranı mesajları (sözleşmeler ve işler üzerinden) ---- */
  const [sozlesmeMesajlari, isMesajlari] = await Promise.all([
    sozlesmeIdleri.length ? supabase.from("customer_file_messages").select("id,sender_type,sender_name,body,created_at,read_at,contract_id,workflow_id").eq("organization_id", org).in("contract_id", sozlesmeIdleri) : Promise.resolve({ data: [] }),
    isIdleri.length ? supabase.from("customer_file_messages").select("id,sender_type,sender_name,body,created_at,read_at,contract_id,workflow_id").eq("organization_id", org).in("workflow_id", isIdleri) : Promise.resolve({ data: [] }),
  ]);
  const mesajlar = [...new Map([...((sozlesmeMesajlari.data ?? []) as Mesaj[]), ...((isMesajlari.data ?? []) as Mesaj[])].map((m) => [m.id, m])).values()]
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  const okunmamis = mesajlar.filter((m) => m.sender_type === "customer" && !m.read_at).length;

  /* ---- Kimlik: en güncel talepten, yoksa cariden ---- */
  const hamAd = gecmis?.kunye?.name ?? talep?.customer_name ?? cariKaydi?.name ?? "Müşteri";
  const musteri = formatPersonName(hamAd) || hamAd;
  const telefon = gecmis?.kunye?.phone ?? talep?.contact_phone ?? cariKaydi?.phone ?? null;
  const eposta = gecmis?.kunye?.email ?? talep?.contact_email ?? cariKaydi?.email ?? null;
  /* Künye: en güncel taleplerden derlenmiş hali (sorgulama penceresiyle
     aynı); yoksa çapa talebinki. Düzenleme EN SON talebe yazılır. */
  const kunye: Kunye = gecmis?.kunye?.alanlar && Object.keys(gecmis.kunye.alanlar).length ? gecmis.kunye.alanlar : ((talep?.request_details ?? {}) as Kunye);
  const kunyeSatirlari = doluAlanlar(kunye);
  const enSonTalep = gecmis?.musteriSayfasiTalepId ?? talep?.id ?? null;

  /* ---- Yazışmalar: kayıt sayfalarıyla aynı kural ---- */
  const { numara: waNumara, mesajlar: whatsapp } = crmVar ? await musteriWhatsapp(org, telefon) : { numara: null, mesajlar: [] };
  /* Posta sekmesinin koşulu menüdekiyle aynı (app/panel/layout.tsx):
     ortak kutuyu görebilen (posta.gor) ve kutu bağlı. */
  const postaGorur = izin("posta.gor") && (await postaDurumu(org)).durum === "bagli";
  const postalar: PostaKonusmasi[] = postaGorur
    ? await musteriPostalari(supabase, org, { talepIdleri: [...new Set([...(talep ? [talep.id] : []), ...kimlikIleri("request")])], eposta })
    : [];

  const ilkKayit = kayitlar.length ? kayitlar[kayitlar.length - 1]?.dateLabel : talep ? formatHistoryDate(talep.created_at) : null;
  const sonSatis = kayitlar.find((k) => k.personRole === "Satış")?.person ?? null;
  const sonOperasyon = kayitlar.find((k) => k.personRole === "Operasyon")?.person ?? null;

  /* ---- Düzenleme yetkisi: her kayıt kendi yetkisiyle ---- */
  const talepDuzenler = crmVar && Boolean(enSonTalep) && izin("crm.talep.yonet");
  const cariDuzenler = cariModulu && Boolean(cariKimligi) && izin("finance.cari.yonet");

  const sekmeler: { anahtar: string; ad: string; icerik: React.ReactNode }[] = [
    ...(crmVar ? [{
      anahtar: "mesajlar",
      ad: okunmamis ? `Mesajlar · ${okunmamis}` : "Mesajlar",
      icerik: (
        <div className="musteri-mesajlar">
          {mesajlar.length ? (
            <ul className="cari-hareketler">
              {mesajlar.map((m) => {
                const href = m.workflow_id ? `/panel/operations/${m.workflow_id}?pencere=mesajlar` : m.contract_id ? `/panel/crm/contracts/${m.contract_id}` : null;
                const icerik = (
                  <span className="cari-hareket-metin">
                    <b>{m.sender_type === "customer" ? musteri : formatPersonName(m.sender_name)}{m.sender_type === "customer" && !m.read_at ? " · yeni" : ""}</b>
                    <small className="musteri-mesaj-govde">{m.body}</small>
                    <small>{formatHistoryDate(m.created_at)}</small>
                  </span>
                );
                return <li key={m.id}>{href ? <Link href={href}>{icerik}</Link> : icerik}</li>;
              })}
            </ul>
          ) : (
            <p className="ic-akis-bos">Müşteri takip ekranından mesaj yazmamış.</p>
          )}
        </div>
      ),
    }, {
      anahtar: "whatsapp",
      ad: whatsapp.length && whatsapp[0].direction === "inbound" ? "WhatsApp · yeni" : "WhatsApp",
      icerik: <WhatsappAkisi mesajlar={whatsapp} numara={waNumara} musteri={musteri} />,
    }] : []),
    ...(postaGorur ? [{
      anahtar: "posta",
      ad: postalar.some((p) => p.okunmamis) ? "Posta · yeni" : "Posta",
      icerik: <PostaAkisi postalar={postalar} epostaVar={Boolean(eposta)} />,
    }] : []),
  ];

  return (
    <main className="talep musteri-sayfa">
      <header className="talep-bas">
        <div className="talep-bas-metin">
          <small className="panel-kicker">MÜŞTERİ</small>
          <h1>{musteri}</h1>
        </div>
        <div className="talep-bas-eylem">
          {cariKimligi ? (
            <PanelModal
              triggerLabel="Cari hesap"
              triggerClassName="panel-primary"
              kicker="CARİ HESAP"
              title={musteri}
                              description={bakiye !== null ? `Açık bakiye ${money(bakiye)}${cariler.length > 1 ? ` · ${cariler.length} cari` : ""}` : undefined}
              boy="tam"
              baslangicAcik={pencere === "cari"}
              kapaninca={pencere === "cari" ? adres : undefined}
            >
              {cariler.length > 1 ? (
                <p className="cari-coklu-not">Bu müşterinin {cariler.length} cari hesabı var; bakiye hepsinin toplamı. Aynı kişiye ait ise tek cariye taşınması önerilir.</p>
              ) : null}
              {cariler.map((c) => (
                <section key={c.id} className="cari-pencere-bolum" aria-label={c.name}>
                  {cariler.length > 1 ? <h3 className="cari-pencere-ad">{c.name}</h3> : null}
                  <CariHesapIcerigi partyId={c.id} />
                </section>
              ))}
            </PanelModal>
          ) : null}
          {talepDuzenler || cariDuzenler ? (
            <PanelDrawer triggerLabel="Bilgileri düzenle" triggerClassName="panel-secondary" kicker="MÜŞTERİ" title={`${musteri} · Bilgiler`} description="Ad, telefon ve e-posta CRM ile Finans arasında ortak; künye en son talebe yazılır.">
              <form className="panel-form" action={musteriBilgileriniKaydet}>
                {talepDuzenler && enSonTalep ? <input type="hidden" name="opportunity_id" value={enSonTalep} /> : null}
                {cariDuzenler && cariKimligi ? <input type="hidden" name="party_id" value={cariKimligi} /> : null}
                {talepDuzenler ? (
                  <>
                    {ILETISIM_ALANLARI.map((alan) => (
                      <label key={alan.anahtar} className={alan.anahtar === "customer_name" ? "wide" : undefined}>
                        {alan.etiket}
                        <input
                          name={alan.anahtar}
                          type={alan.tur ?? "text"}
                          required={alan.zorunlu}
                          maxLength={KUNYE_EN_UZUN}
                          defaultValue={(alan.anahtar === "customer_name" ? hamAd : alan.anahtar === "contact_phone" ? telefon : eposta) ?? ""}
                          placeholder={alan.ornek}
                        />
                      </label>
                    ))}
                    <h3 className="wide musteri-form-baslik">Künye</h3>
                    {KUNYE_ALANLARI.map((alan) => (
                      <label key={alan.anahtar}>
                        {alan.etiket}
                        <input name={alan.anahtar} maxLength={KUNYE_EN_UZUN} defaultValue={kunye[alan.anahtar] ?? ""} placeholder={alan.ornek} />
                      </label>
                    ))}
                  </>
                ) : null}
                {cariDuzenler ? (
                  <>
                    {/* Ad, telefon ve e-posta talep ile cari arasında SENKRON
                        (20261009082529): talep yetkisi varsa yukarıdaki alanlar
                        cariye de yansır, burada yalnızca cariye özgü bilgiler.
                        Talep yetkisi yoksa bu üç alan cariden düzenlenir ve
                        taleplere yansır. */}
                    <h3 className="wide musteri-form-baslik">Fatura bilgileri</h3>
                    {!talepDuzenler ? (
                      <>
                        <label className="wide">Ad soyad / unvan<input name="cari_ad" required minLength={2} maxLength={180} defaultValue={cariKaydi?.name ?? ""} /></label>
                        <label>Telefon<input name="cari_telefon" type="tel" maxLength={80} defaultValue={cariKaydi?.phone ?? ""} /></label>
                        <label>E-posta<input name="cari_eposta" type="email" maxLength={240} defaultValue={cariKaydi?.email ?? ""} /></label>
                      </>
                    ) : null}
                    <label>Vergi no<input name="tax_number" maxLength={40} defaultValue={cariKaydi?.tax_number ?? ""} /></label>
                    <label>Vergi dairesi<input name="tax_office" maxLength={120} defaultValue={cariKaydi?.tax_office ?? ""} /></label>
                    <label className="wide">Adres<textarea name="address" rows={2} maxLength={500} defaultValue={cariKaydi?.address ?? ""} /></label>
                  </>
                ) : null}
                <p className="fin-form-note wide">
                  {talepDuzenler ? "Künye en son talebe yazılır. Ad, telefon ve e-posta müşterinin taleplerinde, işlerinde ve carisinde birlikte güncellenir." : "Ad, telefon ve e-posta müşterinin taleplerinde ve işlerinde de güncellenir."}
                </p>
                <div className="panel-form-actions wide">
                  <button className="panel-primary">Kaydet</button>
                </div>
              </form>
            </PanelDrawer>
          ) : null}
          {talepId ? <Link className="panel-secondary" href={`/panel/crm/requests/${talepId}`}>Talebe dön</Link> : null}
          {cariId ? <Link className="panel-secondary" href="/panel/finance">Müşteriler</Link> : null}
        </div>
      </header>

      <nav className="kayit-serit" aria-label="Müşteri özeti">
        <dl>
          {crmVar && talep ? TUR_SIRASI.map((tur) => (
            <div key={tur}><dt>{tur === "request" ? "Teklifsiz talep" : TUR_ADLARI[tur]}</dt><dd>{sayilar[tur] ?? 0}</dd></div>
          )) : null}
          {gecmis?.contractedLabel ? <div><dt>Sözleşme değeri</dt><dd>{gecmis.contractedLabel}</dd></div> : null}
          {bakiye !== null ? <div className="cari-bakiye" data-tone={bakiye > 0 ? "warning" : "success"}><dt>Açık bakiye</dt><dd>{money(bakiye)}</dd></div> : null}
        </dl>
      </nav>

      <div className="talep-izgara">
        <section className="panel-card talep-musteri" aria-label="Müşteri">
          <div className="talep-musteri-kimlik">
            <span className="talep-avatar" aria-hidden="true">{musteri.split(/\s+/).slice(0, 2).map((p) => p[0]?.toLocaleUpperCase("tr")).join("")}</span>
            <div>
              <h2>{musteri}</h2>
              <small>{gecmis?.lastContactLabel ? `Son kayıt ${gecmis.lastContactLabel}` : cariKimligi ? "Müşteri · cari hesap" : "Müşteri"}</small>
            </div>
          </div>
          {telefon || eposta ? (
            <div className="talep-iletisim">
              {telefon ? <a className="panel-secondary" href={`tel:${telefon}`}>Ara</a> : null}
              {telefon ? <a className="panel-secondary" href={waMeAdresi(telefon, `Merhaba ${musteri},`)} target="_blank" rel="noreferrer">WhatsApp</a> : null}
              {eposta ? <a className="panel-secondary" href={`mailto:${eposta}`}>E-posta</a> : null}
            </div>
          ) : null}
          <dl className="talep-liste">
            <div><dt>Telefon</dt><dd>{formatPhone(telefon) || <em>Yok</em>}</dd></div>
            <div><dt>E-posta</dt><dd>{eposta || <em>Yok</em>}</dd></div>
            {crmVar ? <div><dt>Satış temsilcisi</dt><dd>{sonSatis ?? <em>—</em>}</dd></div> : null}
            {sonOperasyon ? <div><dt>Operasyon</dt><dd>{sonOperasyon}</dd></div> : null}
            {ilkKayit ? <div><dt>İlk kayıt</dt><dd>{ilkKayit}</dd></div> : null}
            {talep?.source ? <div><dt>Kaynak</dt><dd>{talep.source}</dd></div> : null}
            {cariKaydi?.tax_number ? <div><dt>Vergi no</dt><dd>{cariKaydi.tax_number}</dd></div> : null}
            {cariKaydi?.tax_office ? <div><dt>Vergi dairesi</dt><dd>{cariKaydi.tax_office}</dd></div> : null}
            {cariKaydi?.address ? <div><dt>Adres</dt><dd>{cariKaydi.address}</dd></div> : null}
          </dl>
          {kunyeSatirlari.length ? (
            <div className="talep-gecmis">
              <h3>Künye</h3>
              <dl className="talep-liste">
                {kunyeSatirlari.map((alan) => <div key={alan.anahtar}><dt>{alan.etiket}</dt><dd>{alan.deger}</dd></div>)}
              </dl>
            </div>
          ) : null}
          {gecmis?.matchedBy === "name" ? (
            <p className="talep-bos cari-not">Kayıtlar ad soyadla eşleşti; telefonu farklı kayıtlar başka bir kişiye ait olabilir.</p>
          ) : null}
        </section>

        <section className="panel-card talep-bilgi" aria-label="Müşterinin kayıtları">
          <div className="cari-baslik">
            <h2>Kayıtlar</h2>
            <small>{gecmis?.total ?? 0} kayıt{gecmis?.limited ? ` · son ${kayitlar.length}` : ""}</small>
          </div>
          {kayitlar.length ? (
            <div className="talep-tablo">
              {/* Satırın boş alanına tıklama da kaydı açar (crm/satir-tiklama.tsx). */}
              <SatirTiklama />
              <table className="crm-data-table" data-cols="musteri">
                <thead>
                  <tr>
                    <th>Tür</th>
                    <th>Kayıt</th>
                    <th className="crm-col-amount">Tutar</th>
                    <th>Durum</th>
                    <th className="crm-col-date">Tarih</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {kayitlar.map((k) => (
                    <tr key={k.key}>
                      <td className="crm-table-mono" data-label="Tür">
                        {k.canOpen ? <Link className="crm-row-link" href={k.href} aria-label={`${k.kindLabel}: ${k.title}`}>{k.kindLabel}</Link> : k.kindLabel}
                      </td>
                      <td data-label="Kayıt">
                        <span className="crm-table-title" title={k.title}>{k.title}</span>
                        <span className="crm-table-sub">{[k.detail, k.person ? `${k.personRole ?? ""} ${k.person}`.trim() : null].filter(Boolean).join(" · ")}</span>
                      </td>
                      <td className="crm-col-amount" data-label="Tutar">{k.amountLabel ?? "—"}</td>
                      <td data-label="Durum"><span className="status-pill" data-tone={k.tone}>{k.statusLabel}</span></td>
                      <td className="crm-col-date" data-label="Tarih">{k.dateLabel}</td>
                      <td className="crm-table-actions">{k.canOpen ? <span className="crm-row-chevron" aria-hidden="true">›</span> : null}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="ic-akis-bos">
              {!crmVar ? "Talep, teklif ve sözleşme kayıtlarını görmek için CRM modülü gerekiyor." : talep ? "Bu müşterinin görebildiğiniz başka kaydı yok." : "Bu cariye bağlı bir talep ya da sözleşme yok."}
            </p>
          )}
          {gecmis?.scopedToAssigned ? <p className="talep-bos cari-not">Yalnızca size atanmış kayıtlar listeleniyor.</p> : null}
        </section>

        {sekmeler.length ? (
          <TalepAkis sekmeler={sekmeler.map((sekme) => sekme.ad)} tembel={sekmeler.map((_, sira) => sira).filter((sira) => sira > 0)}>
            {sekmeler.map((sekme) => <div key={sekme.anahtar}>{sekme.icerik}</div>)}
          </TalepAkis>
        ) : null}
      </div>
    </main>
  );
}
