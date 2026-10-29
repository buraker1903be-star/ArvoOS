"use client";

import { TarihSecici } from "@/app/panel/components/tarih-secici";
import { useEffect, useRef, useState } from "react";
import { createOpportunity } from "./actions";
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
  const resetLookup = () => { setCustomerName(""); setPhone(""); setLookupField(null); setPrefilled(false); setPostaThreadId(null); setFormVersion((version) => version + 1); setServiceType(""); setCalismaTuru(""); setOtomatikTur(false); };

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
    DÜZEN (2026-10): alanlar dört bölümde — Talep, Müşteri, Akademik künye,
    Kapsam ve plan. Eskiden tek parça bir liste olarak sıralanıyordu;
    zorunlu alanlar arada kayboluyor, "Telefon" tek başına bir satırda
    kalıyordu. Alan adları (name) aynı: createOpportunity değişmedi.
    Görünüm panelin ortak kayıt formu düzeninde (components/kayit-formu.css).
  */
  const ontanimli = calismaTurleri.find((tur) => tur.is_default);
  return <form ref={formRef} className="panel-form request-entry-form kayit-formu" action={createOpportunity} onReset={resetLookup}>
    {postaThreadId ? <>
      <input type="hidden" name="posta_thread_id" value={postaThreadId} />
      <p className="wide kayit-formu-not">Bu talep bir posta yazışmasından açılıyor; kaydedilince yazışma talebe bağlanacak.</p>
    </> : null}

    <p className="wide kayit-formu-bolum">Talep</p>
    {academicMode ? <>
      <label><span>Hizmet türü<b className="req" aria-hidden="true">*</b></span><select name="service_type" required value={serviceType} onChange={(event) => hizmetSecildi(event.target.value)}><option value="" disabled>Seçin</option>{hizmetTurleri.map((item) => <option value={item} key={item}>{item}</option>)}</select></label>
      {serviceType === DIGER ? <label className="wide request-other-service"><span>Diğer hizmet<b className="req" aria-hidden="true">*</b></span><input name="other_service_type" required minLength={2} maxLength={120} placeholder="Hizmet türünü yazın" /></label> : null}
    </> : null}
    {/* Hizmet türünün ARDINDA: seçilen hizmet bu alanı dolduruyor. */}
    {calismaTurleri.length ? (
      <label>Çalışma türü
        <select name="step_template_set" value={calismaTuru} onChange={(event) => { setCalismaTuru(event.target.value); setOtomatikTur(false); }}>
          <option value="">Öntanımlı{ontanimli ? ` (${ontanimli.name})` : ""}</option>
          {calismaTurleri.map((tur) => <option value={tur.code} key={tur.code}>{tur.name}</option>)}
        </select>
        {otomatikTur ? <small className="kayit-formu-ipucu">Hizmet türüne göre seçildi; adımlar bu türün listesinden gelir.</small> : null}
      </label>
    ) : null}
    <label className="wide"><span>Talep konusu<b className="req" aria-hidden="true">*</b></span><input name="title" required minLength={2} maxLength={180} placeholder={academicMode ? "Örn. Yüksek lisans tezi analiz desteği" : "Talebin kısa başlığı"} /></label>

    <p className="wide kayit-formu-bolum">Müşteri</p>
    <label className={academicMode ? undefined : "wide"}><span>Müşteri / kurum<b className="req" aria-hidden="true">*</b></span><input name="customer_name" required minLength={2} maxLength={180} autoComplete="off" placeholder="Ad soyad ya da kurum adı" onChange={(event) => { setCustomerName(event.target.value); setPrefilled(false); }} onFocus={() => setLookupField("name")} onBlur={() => setLookupField(null)} /></label>
    {academicMode ? <label>Müşteri türü<select name="customer_type" defaultValue="Bireysel"><option>Bireysel</option><option>Kurumsal</option></select></label> : null}
    <label>Telefon<input name="contact_phone" type="tel" inputMode="tel" autoComplete="off" placeholder="05xx xxx xx xx" onChange={(event) => { setPhone(event.target.value); setPrefilled(false); }} onFocus={() => setLookupField("phone")} onBlur={() => setLookupField(null)} /></label>
    <label>E-posta<input name="contact_email" type="email" placeholder="ornek@eposta.com" /></label>
    <CustomerHistoryNotice key={formVersion} name={customerName} phone={phone} editing={lookupField !== null} autoOpen={!prefilled} />

    {academicMode ? <>
      <p className="wide kayit-formu-bolum">Akademik künye</p>
      <label>Üniversite<input name="university" placeholder="Örn. İstanbul Üniversitesi" /></label>
      <label>Bölüm / alan<input name="department" placeholder="Örn. İşletme" /></label>
      {/* Öneri listesi: sık değerler hazır, kayıtlı eski değerler gibi serbest metin de girilebilir. */}
      <label>Akademik düzey<input name="academic_level" list="talep-akademik-duzey" placeholder="Seçin ya da yazın" /></label>
      <label>Çalışma dili<input name="language" list="talep-calisma-dili" defaultValue="Türkçe" /></label>
      <datalist id="talep-akademik-duzey"><option value="Lisans" /><option value="Yüksek Lisans" /><option value="Doktora" /><option value="Tıpta Uzmanlık" /><option value="Doçentlik" /></datalist>
      <datalist id="talep-calisma-dili"><option value="Türkçe" /><option value="İngilizce" /><option value="Arapça" /><option value="Almanca" /></datalist>
    </> : null}

    <p className="wide kayit-formu-bolum">Kapsam ve plan</p>
    {academicMode ? <label className="wide"><span>Beklenen kapsam ve teslimler<b className="req" aria-hidden="true">*</b></span><textarea name="scope" required placeholder="Hangi bölümler, hangi teslimler, özel istekler…" /></label> : null}
    <label>Planlanan teslim tarihi<TarihSecici name="expected_close_date" /></label>
    <label>Talep kaynağı<input name="source" list="talep-kaynagi" placeholder="Seçin ya da yazın" /></label>
    <datalist id="talep-kaynagi"><option value="WhatsApp" /><option value="Telefon" /><option value="Instagram" /><option value="Web sitesi" /><option value="E-posta" /><option value="Referans" /></datalist>
    {canAssign
      ? <label className="wide">Satış temsilcisi<select name="assigned_employee_id" defaultValue=""><option value="">Atanmamış</option>{salesRepresentatives.map((employee)=><option value={employee.id} key={employee.id}>{employee.full_name}{employee.job_title?` · ${employee.job_title}`:""}</option>)}</select></label>
      : <p className="wide kayit-formu-not">Bu talep otomatik olarak size atanacak.</p>}
    <label className="wide">Ek not<textarea name="notes" placeholder="Görüşmeden notlar, hatırlatmalar" /></label>

    <div className="wide panel-form-actions kayit-formu-eylem">
      <p><b className="req" aria-hidden="true">*</b> işaretli alanlar zorunlu.</p>
      <button className="panel-primary" type="submit">Talebi kaydet</button>
    </div>
  </form>;
}
