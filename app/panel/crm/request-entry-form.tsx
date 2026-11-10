"use client";

import { TarihSecici } from "@/app/panel/components/tarih-secici";
import { FormAlani, alanaGit, formuDenetle } from "@/app/panel/components/form-alani";
import { GonderDugmesi } from "@/app/panel/components/gonder-dugmesi";
import { startTransition, useActionState, useEffect, useRef, useState, type FormEvent } from "react";
import { talepOlusturDurumlu } from "./actions";
import { hataOzeti } from "@/lib/form-hatalari";
import { CustomerHistoryNotice } from "./customer-history";
import { NEW_REQUEST_PREFILL_EVENT, type NewRequestPrefill } from "./customer-history-keys";
// Bileşen stilini kendisi alıyor (AGENTS.md: sınıfın CSS'i rotaya kendi importuyla girer).
import "../components/kayit-formu.css";

import { DIGER, VARSAYILAN_HIZMET_TURLERI, formSecenekleri } from "@/lib/hizmet-turleri";
import { calismaTuruBul } from "@/lib/is-adimlari";

/* Hizmet türleri kurumun listesinden (Ayarlar → Hizmet türleri,
   lib/hizmet-turleri). Eskiden burada sabit bir akademik liste vardı;
   başka işi yapan kurum her talepte "Diğer"i seçip elle yazıyordu. */
type SalesRepresentative={id:string;full_name:string;job_title:string|null};
/*
  Çalışma türü: işin görev listesini belirliyor. Türü satışçı seçiyor
  çünkü tezle makaleyi bilen kişi odur;
  eskiden tür yalnızca iş açılırken seçilebiliyor ve makale işi kurumun
  öntanımlı seti (tez) ile açılıyordu.
*/
type CalismaTuru={code:string;name:string;is_default:boolean;hizmet_turleri?:string[]};

export function RequestEntryForm({ academicMode, salesRepresentatives, canAssign, calismaTurleri = [], hizmetTurleri = formSecenekleri(VARSAYILAN_HIZMET_TURLERI) }: { academicMode: boolean; salesRepresentatives: SalesRepresentative[]; canAssign: boolean; calismaTurleri?: CalismaTuru[]; hizmetTurleri?: string[] }) {
  const [serviceType, setServiceType] = useState("");
  /* Çalışma türü hizmet türünden kendiliğinden seçiliyor (Şablon sayfasındaki
     eşleme, 20261013104639); satışçı yine değiştirebilir. Eşleme yoksa
     seçim "Öntanımlı"da kalır. */
  const [calismaTuru, setCalismaTuru] = useState("");
  const [otomatikTur, setOtomatikTur] = useState(false);
  const hizmetSecildi = (deger: string) => {
    setServiceType(deger);
    const kod = calismaTuruBul(calismaTurleri, deger);
    setCalismaTuru(kod ?? "");
    setOtomatikTur(Boolean(kod));
  };
  // Geri dönen müşteri kontrolü için ad ve telefon izlenir (alanlar yine kontrolsüz)
  const [customerName, setCustomerName] = useState("");
  const [phone, setPhone] = useState("");
  const [lookupField, setLookupField] = useState<"name" | "phone" | null>(null);
  const [formVersion, setFormVersion] = useState(0);
  // "Müşteri sorgula"dan doldurulduysa geçmiş penceresi kendiliğinden açılmaz
  const [prefilled, setPrefilled] = useState(false);
  /* Postadan açılan talep: kaydedilince yazışma bu talebe bağlanacak
     (createOpportunity). Gizli alan olarak gidiyor; kullanıcıya da
     söyleniyor, yoksa "neden burada bir yazışma yazıyor" sorusu doğar. */
  const [postaThreadId, setPostaThreadId] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  // Kayıttan sonra React formu sıfırlıyor; geçmiş uyarısı da sıfırlansın
  const resetLookup = () => { setHatalar({}); setOzet(null); setCustomerName(""); setPhone(""); setLookupField(null); setPrefilled(false); setPostaThreadId(null); setFormVersion((version) => version + 1); setServiceType(""); setCalismaTuru(""); setOtomatikTur(false); };

  // Müşteri sorgulama penceresindeki "+ Bu müşteri için yeni talep"
  useEffect(() => {
    const onPrefill = (event: Event) => {
      const detail = (event as CustomEvent<NewRequestPrefill>).detail;
      const form = formRef.current;
      if (!form || !detail) return;
      const fill = (field: string, value: string | null) => {
        const input = form.elements.namedItem(field);
        if (input instanceof HTMLInputElement) input.value = value ?? "";
      };
      fill("customer_name", detail.name);
      fill("contact_phone", detail.phone);
      fill("contact_email", detail.email);
      if (detail.title) fill("title", detail.title);
      setPostaThreadId(detail.postaThreadId ?? null);
      setCustomerName(detail.name);
      setPhone(detail.phone ?? "");
      setPrefilled(true);
      /* Pencere açılış animasyonundan sonra ilk BOŞ zorunlu alana geç.
         Postadan gelen talepte konu zaten dolu; oraya odaklanmak
         kullanıcıyı doldurulmuş bir alana bakar hâlde bırakıyordu. */
      window.setTimeout(() => {
        const title = form.elements.namedItem("title");
        if (title instanceof HTMLInputElement && !title.value) {
          title.focus({ preventScroll: true });
          return;
        }
        const ilkBos = [...form.elements].find(
          (alan): alan is HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement =>
            (alan instanceof HTMLInputElement || alan instanceof HTMLSelectElement || alan instanceof HTMLTextAreaElement)
            && alan.required && !alan.value,
        );
        ilkBos?.focus({ preventScroll: true });
      }, 80);
    };
    window.addEventListener(NEW_REQUEST_PREFILL_EVENT, onPrefill);
    return () => window.removeEventListener(NEW_REQUEST_PREFILL_EVENT, onPrefill);
  }, []);

  /*
    GÖNDERİM (10.11.2026, ortak form kontrolleri).

    Eskiden form `action={createOpportunity}` ile gönderiliyordu. Sunucu
    hatası (runPanelAction) fırlatılmadığı için React işlemi BAŞARILI sayıp
    formu sıfırlıyordu: kayıt düştüğünde kullanıcının yazdığı her şey
    siliniyor, hata yalnızca köşede bir bildirim olarak kalıyordu. Düğmede
    bekleme kilidi de yoktu; yavaş bağlantıda ikinci tıklama ikinci talebi
    açabiliyordu.

    Şimdi:
    - gönderim elle (useActionState + startTransition): form yalnızca
      sunucu "tamam" dediğinde sıfırlanır, hata olunca değerler yerinde;
    - önce tarayıcının kendi kuralları (required, minLength, type=email)
      sorulur; geçersiz alanların metni alanın ALTINA yazılır ve ilk
      hatalıya gidilir (components/form-alani);
    - sunucunun doğrulama mesajı tanınıyorsa o alanın altına, değilse
      kaydet çubuğundaki hata kutusuna düşer;
    - düğme gerçek bekleme durumuyla kilitli (süre dolunca açılmaz).
    Arayüz kilidi veritabanı tekilliği değildir: talep eklemede tekillik
    anahtarı yok (docs/takip-yerlesim-kurallari.md, ayrı takip).
  */
  const [sonuc, eylem, bekliyor] = useActionState(talepOlusturDurumlu, null);
  const [hatalar, setHatalar] = useState<Record<string, string>>({});
  const [ozet, setOzet] = useState<{ tur: "alan"; sayi: number; ilk: string } | { tur: "sunucu"; metin: string } | null>(null);
  const gonderiliyor = useRef(false);
  const islenenSonuc = useRef<number | null>(null);

  useEffect(() => {
    if (!sonuc || islenenSonuc.current === sonuc.kimlik) return;
    islenenSonuc.current = sonuc.kimlik;
    gonderiliyor.current = false;
    const form = formRef.current;
    if (sonuc.tamam) {
      setHatalar({}); setOzet(null);
      form?.reset();
      // Pencere bildirimle de kapanıyor (flash-toast); uzun işlemde bildirimin yoklaması bitmiş olabilir.
      window.dispatchEvent(new CustomEvent("arvo:action-success", { detail: "Talep sisteme girildi" }));
      return;
    }
    if (sonuc.alan) {
      setHatalar((onceki) => ({ ...onceki, [sonuc.alan as string]: sonuc.hata }));
      setOzet({ tur: "alan", sayi: 1, ilk: sonuc.alan });
      if (form) alanaGit(form, sonuc.alan);
    } else {
      setOzet({ tur: "sunucu", metin: sonuc.hata });
    }
  }, [sonuc]);
  useEffect(() => { if (!bekliyor) gonderiliyor.current = false; }, [bekliyor]);

  const gonder = (olay: FormEvent<HTMLFormElement>) => {
    olay.preventDefault();
    const form = olay.currentTarget;
    if (bekliyor || gonderiliyor.current) return;
    const bulunan = formuDenetle(form);
    if (bulunan.size) {
      setHatalar(Object.fromEntries(bulunan));
      const ilk = bulunan.keys().next().value as string;
      setOzet({ tur: "alan", sayi: bulunan.size, ilk });
      alanaGit(form, ilk);
      return;
    }
    setHatalar({}); setOzet(null);
    gonderiliyor.current = true;
    const veri = new FormData(form);
    startTransition(() => eylem(veri));
  };
  /* Düzeltilen alanın hatası yazarken kalkar (alan artık geçerliyse). */
  const alanDegisti = (olay: FormEvent<HTMLFormElement>) => {
    const alan = olay.target;
    if (!(alan instanceof HTMLInputElement || alan instanceof HTMLSelectElement || alan instanceof HTMLTextAreaElement) || !alan.name || !hatalar[alan.name]) return;
    if (!alan.validity.valid) return;
    setHatalar((onceki) => { const sonraki = { ...onceki }; delete sonraki[alan.name]; return sonraki; });
  };
  const hata = (ad: string) => hatalar[ad] ?? null;

  /*
    DÜZEN (10.11.2026): üç bölüm — Müşteri bilgileri, Talep bilgileri, İç
    not (akademik kurumda Akademik künye de). Eskiden Talep önce geliyordu
    ve iç not "Kapsam ve plan"ın içinde, müşteriye giden alanların hemen
    altındaydı. Alan adları (name), varsayılanlar ve yetki dalı (canAssign)
    aynı: createOpportunity__impl değişmedi.
  */
  const ontanimli = calismaTurleri.find((tur) => tur.is_default);
  return <form ref={formRef} className="panel-form request-entry-form kayit-formu" noValidate onSubmit={gonder} onInput={alanDegisti} onChange={alanDegisti} onReset={resetLookup} aria-busy={bekliyor || undefined}>
    {postaThreadId ? <>
      <input type="hidden" name="posta_thread_id" value={postaThreadId} />
      <p className="wide kayit-formu-not">Bu talep bir posta yazışmasından açılıyor; kaydedilince yazışma talebe bağlanacak.</p>
    </> : null}

    <div className="kayit-formu-grup is-ilk" role="group" aria-labelledby="talep-grup-musteri">
      <h3 className="kayit-formu-grup-bas" id="talep-grup-musteri">Müşteri bilgileri</h3>
      <FormAlani etiket="Müşteri / kurum" zorunlu genis={!academicMode} hata={hata("customer_name")}>
        {(alan) => <input {...alan} name="customer_name" minLength={2} maxLength={180} autoComplete="off" placeholder="Ad soyad ya da kurum adı" onChange={(event) => { setCustomerName(event.target.value); setPrefilled(false); }} onFocus={() => setLookupField("name")} onBlur={() => setLookupField(null)} />}
      </FormAlani>
      {academicMode ? (
        <FormAlani etiket="Müşteri türü">
          {(alan) => <select {...alan} name="customer_type" defaultValue="Bireysel"><option>Bireysel</option><option>Kurumsal</option></select>}
        </FormAlani>
      ) : null}
      {/* autocomplete kapalı: alanlara personel MÜŞTERİNİN bilgisini yazıyor; tarayıcı kendi bilgisini önermesin. */}
      <FormAlani etiket="Telefon" hata={hata("contact_phone")}>
        {(alan) => <input {...alan} name="contact_phone" type="tel" inputMode="tel" autoComplete="off" maxLength={80} placeholder="05xx xxx xx xx" onChange={(event) => { setPhone(event.target.value); setPrefilled(false); }} onFocus={() => setLookupField("phone")} onBlur={() => setLookupField(null)} />}
      </FormAlani>
      <FormAlani etiket="E-posta" hata={hata("contact_email")}>
        {(alan) => <input {...alan} name="contact_email" type="email" inputMode="email" autoComplete="off" maxLength={240} placeholder="ornek@eposta.com" />}
      </FormAlani>
      <CustomerHistoryNotice key={formVersion} name={customerName} phone={phone} editing={lookupField !== null} autoOpen={!prefilled} />
    </div>

    <div className="kayit-formu-grup" role="group" aria-labelledby="talep-grup-talep">
      <h3 className="kayit-formu-grup-bas" id="talep-grup-talep">Talep bilgileri</h3>
      {academicMode ? <>
        <FormAlani etiket="Hizmet türü" zorunlu hata={hata("service_type")}>
          {(alan) => <select {...alan} name="service_type" value={serviceType} onChange={(event) => hizmetSecildi(event.target.value)}><option value="" disabled>Seçin</option>{hizmetTurleri.map((item) => <option value={item} key={item}>{item}</option>)}</select>}
        </FormAlani>
        {serviceType === DIGER ? (
          <FormAlani etiket="Diğer hizmet" zorunlu genis sinif="request-other-service" hata={hata("other_service_type")}>
            {(alan) => <input {...alan} name="other_service_type" minLength={2} maxLength={120} autoComplete="off" placeholder="Hizmet türünü yazın" />}
          </FormAlani>
        ) : null}
      </> : null}
      {/* Hizmet türünün ARDINDA: seçilen hizmet bu alanı dolduruyor. */}
      {calismaTurleri.length ? (
        <FormAlani etiket="Çalışma türü" yardim={otomatikTur ? "Hizmet türüne göre seçildi; adımlar bu türün listesinden gelir." : undefined}>
          {(alan) => (
            <select {...alan} name="step_template_set" value={calismaTuru} onChange={(event) => { setCalismaTuru(event.target.value); setOtomatikTur(false); }}>
              <option value="">Öntanımlı{ontanimli ? ` (${ontanimli.name})` : ""}</option>
              {calismaTurleri.map((tur) => <option value={tur.code} key={tur.code}>{tur.name}</option>)}
            </select>
          )}
        </FormAlani>
      ) : null}
      <FormAlani etiket="Talep konusu" zorunlu genis hata={hata("title")}>
        {(alan) => <input {...alan} name="title" minLength={2} maxLength={180} autoComplete="off" placeholder={academicMode ? "Örn. Yüksek lisans tezi analiz desteği" : "Talebin kısa başlığı"} />}
      </FormAlani>
      {academicMode ? (
        <FormAlani etiket="Beklenen kapsam ve teslimler" zorunlu genis hata={hata("scope")} yardim="Müşteriye gidecek teklifin kapsamına aktarılır.">
          {(alan) => <textarea {...alan} name="scope" maxLength={4000} placeholder="Hangi bölümler, hangi teslimler, özel istekler…" />}
        </FormAlani>
      ) : null}
      <FormAlani etiket="Planlanan teslim tarihi" hata={hata("expected_close_date")}>
        {(alan) => <TarihSecici id={alan.id} name="expected_close_date" />}
      </FormAlani>
      <FormAlani etiket="Talep kaynağı" yardim="Listeden seçin ya da yazın.">
        {(alan) => <input {...alan} name="source" list="talep-kaynagi" maxLength={160} autoComplete="off" />}
      </FormAlani>
      <datalist id="talep-kaynagi"><option value="WhatsApp" /><option value="Telefon" /><option value="Instagram" /><option value="Web sitesi" /><option value="E-posta" /><option value="Referans" /></datalist>
      {canAssign ? (
        <FormAlani etiket="Satış temsilcisi" genis hata={hata("assigned_employee_id")}>
          {(alan) => <select {...alan} name="assigned_employee_id" defaultValue=""><option value="">Atanmamış</option>{salesRepresentatives.map((employee)=><option value={employee.id} key={employee.id}>{employee.full_name}{employee.job_title?` · ${employee.job_title}`:""}</option>)}</select>}
        </FormAlani>
      ) : <p className="wide kayit-formu-not">Bu talep otomatik olarak size atanacak.</p>}
    </div>

    {academicMode ? (
      <div className="kayit-formu-grup" role="group" aria-labelledby="talep-grup-kunye">
        <h3 className="kayit-formu-grup-bas" id="talep-grup-kunye">Akademik künye</h3>
        <FormAlani etiket="Üniversite">{(alan) => <input {...alan} name="university" maxLength={180} autoComplete="off" placeholder="Örn. İstanbul Üniversitesi" />}</FormAlani>
        <FormAlani etiket="Bölüm / alan">{(alan) => <input {...alan} name="department" maxLength={180} autoComplete="off" placeholder="Örn. İşletme" />}</FormAlani>
        {/* Öneri listesi: sık değerler hazır, kayıtlı eski değerler gibi serbest metin de girilebilir. */}
        <FormAlani etiket="Akademik düzey" yardim="Listeden seçin ya da yazın.">{(alan) => <input {...alan} name="academic_level" list="talep-akademik-duzey" maxLength={80} autoComplete="off" />}</FormAlani>
        <FormAlani etiket="Çalışma dili">{(alan) => <input {...alan} name="language" list="talep-calisma-dili" maxLength={80} autoComplete="off" defaultValue="Türkçe" />}</FormAlani>
        <datalist id="talep-akademik-duzey"><option value="Lisans" /><option value="Yüksek Lisans" /><option value="Doktora" /><option value="Tıpta Uzmanlık" /><option value="Doçentlik" /></datalist>
        <datalist id="talep-calisma-dili"><option value="Türkçe" /><option value="İngilizce" /><option value="Arapça" /><option value="Almanca" /></datalist>
      </div>
    ) : null}

    <div className="kayit-formu-grup" role="group" aria-labelledby="talep-grup-not">
      <h3 className="kayit-formu-grup-bas" id="talep-grup-not">İç not</h3>
      <FormAlani etiket="İç not" genis yardim="Yalnızca ekip görür; teklife, sözleşmeye ve müşteri sayfasına aktarılmaz.">
        {(alan) => <textarea {...alan} name="notes" maxLength={4000} placeholder="Görüşmeden notlar, hatırlatmalar" />}
      </FormAlani>
    </div>

    <div className="wide panel-form-actions kayit-formu-eylem">
      {ozet ? (
        <p className="form-ozet" role="alert">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 7.5v5.5M12 16.5h.01" /></svg>
          {ozet.tur === "alan"
            ? <><span>Talep kaydedilmedi. {hataOzeti(ozet.sayi)}</span><button type="button" onClick={() => formRef.current && alanaGit(formRef.current, ozet.ilk)}>İlk alana git</button></>
            : <span>Talep kaydedilmedi: {ozet.metin} Girdiğiniz bilgiler korunuyor; düzeltip yeniden kaydedebilirsiniz.</span>}
        </p>
      ) : null}
      <p><b className="req" aria-hidden="true">*</b> işaretli alanlar zorunlu.</p>
      <GonderDugmesi bekliyor={bekliyor} bekleyenEtiket="Kaydediliyor…">Talebi kaydet</GonderDugmesi>
    </div>
  </form>;
}
