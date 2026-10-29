import { TarihSecici } from "@/app/panel/components/tarih-secici";
import "../components/kayit-formu.css";
import "./hr.css";

/*
  PERSONEL FORMU (29.10.2026): "Yeni personel" ve "Personeli düzenle" aynı
  form. Eskiden ikisi ayrı ayrı yazılıydı ve sapmıştı: düzenlemede personel
  no, işe giriş ve çalışma tipi yoktu, yeni kayıtta çalışma tipi açılır
  listeydi. Alan adları sunucu işlemleriyle (createEmployee,
  updateEmployee) sözleşme; birini değiştiren ikisine de bakar.

  Çalışma tipi ve durum seçenek düğmeleri: dört seçenek bir bakışta
  görünsün. Yeni kayıtta durum sorulmaz — personel "Aktif" açılır,
  ayrılma ya da izin sonradan girilir.
*/

export type PersonelFormVerisi = {
  id: string;
  full_name: string;
  employee_no: string | null;
  start_date: string | null;
  job_title: string | null;
  department_id: string | null;
  employment_type: string;
  employment_status: string;
  email: string | null;
  phone: string | null;
  commission_rate: number;
  operation_commission_rate: number;
  can_receive_sales_requests: boolean;
};

const CALISMA_TIPI: [string, string][] = [["full_time", "Tam zamanlı"], ["part_time", "Yarı zamanlı"], ["contractor", "Sözleşmeli"], ["intern", "Stajyer"]];
const DURUM: [string, string][] = [["active", "Aktif"], ["on_leave", "İzinli"], ["inactive", "Pasif"], ["terminated", "İşten ayrıldı"]];

function Secenekler({ ad, secili, liste, etiket }: { ad: string; secili: string; liste: [string, string][]; etiket: string }) {
  return (
    <div className="wide pf-secenek" role="radiogroup" aria-label={etiket}>
      {liste.map(([deger, yazi]) => (
        <label key={deger}><input type="radio" name={ad} value={deger} defaultChecked={secili === deger} /><span>{yazi}</span></label>
      ))}
    </div>
  );
}

export function PersonelFormu({ action, departmanlar, personel }: {
  action: (formData: FormData) => void | Promise<void>;
  /** Yeni kayıtta yalnızca etkin departmanlar; düzenlemede hepsi (mevcut departman pasifse de seçili kalsın). */
  departmanlar: { id: string; name: string }[];
  /** Verilmezse yeni kayıt. */
  personel?: PersonelFormVerisi;
}) {
  const p = personel;
  return (
    <form className="panel-form kayit-formu pf-form" action={action}>
      {p ? <input type="hidden" name="employee_id" value={p.id} /> : null}
      <p className="wide kayit-formu-bolum">Kimlik</p>
      <label className="wide"><span>Ad soyad<b className="req" aria-hidden="true">*</b></span><input name="full_name" required minLength={2} defaultValue={p?.full_name ?? ""} placeholder="Örn. Ayşe Yılmaz" /></label>
      <label>Personel no<input name="employee_no" maxLength={50} defaultValue={p?.employee_no ?? ""} placeholder="İsteğe bağlı · örn. P1004" /></label>
      <label>İşe giriş tarihi<TarihSecici name="start_date" defaultValue={p?.start_date ?? ""} /></label>

      <p className="wide kayit-formu-bolum">Görev</p>
      <label>Pozisyon<input name="job_title" defaultValue={p?.job_title ?? ""} placeholder="Örn. Satış Uzmanı" /></label>
      <label>Departman<select name="department_id" defaultValue={p?.department_id ?? ""}><option value="">Departman seçin</option>{departmanlar.map((d) => <option value={d.id} key={d.id}>{d.name}</option>)}</select></label>
      <p className="wide pf-etiket">Çalışma tipi</p>
      <Secenekler ad="employment_type" secili={p?.employment_type ?? "full_time"} liste={CALISMA_TIPI} etiket="Çalışma tipi" />
      {p ? <>
        <p className="wide pf-etiket">Durum</p>
        <Secenekler ad="employment_status" secili={p.employment_status} liste={DURUM} etiket="Durum" />
      </> : null}

      <p className="wide kayit-formu-bolum">İletişim</p>
      <label>E-posta<input name="email" type="email" defaultValue={p?.email ?? ""} placeholder="ad@kurum.com" /></label>
      <label>Telefon<input name="phone" type="tel" inputMode="tel" defaultValue={p?.phone ?? ""} placeholder="05xx xxx xx xx" /></label>

      <p className="wide kayit-formu-bolum">Prim ve satış</p>
      <label>Satış primi (%)<input name="commission_rate" type="number" min="0" max="100" step="0.01" defaultValue={p?.commission_rate ?? 0} /></label>
      <label>Operasyon primi (%)<input name="operation_commission_rate" type="number" min="0" max="100" step="0.01" defaultValue={p?.operation_commission_rate ?? 0} /></label>
      {p ? <p className="wide kayit-formu-not">Oran değişikliği geçmiş primleri değiştirmez: o güne kadarki tahsilatlar eski oranla hesaplanmaya devam eder.</p> : null}
      <label className="wide hr-check"><input name="can_receive_sales_requests" type="checkbox" defaultChecked={p?.can_receive_sales_requests ?? false} /><span><b>Satış talepleri atanabilir</b><small>Yeni satış talepleri bu personele atanabilir.</small></span></label>
      {p ? null : <p className="wide kayit-formu-not">Kayıttan sonra gizlilik sözleşmesi kendiliğinden hazırlanır; panel erişimi personel sayfasından verilir.</p>}
      <div className="wide panel-form-actions kayit-formu-eylem">
        <p><b className="req" aria-hidden="true">*</b> işaretli alanlar zorunlu.</p>
        <button className="panel-primary" type="submit">{p ? "Değişiklikleri kaydet" : "Personeli kaydet"}</button>
      </div>
    </form>
  );
}
