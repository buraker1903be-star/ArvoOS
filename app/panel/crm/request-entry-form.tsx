"use client";

import { useState } from "react";
import { createOpportunity } from "./actions";
import { CustomerHistoryNotice } from "./customer-history";

const serviceTypes = ["Tez Danışmanlığı","Akademik Çeviri","Literatür Danışmanlığı","Veri Analizi","Makale Danışmanlığı","Biçimsel Düzenleme","Araştırma Tasarımı","Doçentlik Başvuru Danışmanlığı","Diğer"];
type SalesRepresentative={id:string;full_name:string;job_title:string|null};

export function RequestEntryForm({ academicMode, salesRepresentatives, canAssign }: { academicMode: boolean; salesRepresentatives: SalesRepresentative[]; canAssign: boolean }) {
  const [serviceType, setServiceType] = useState("");
  // Geri dönen müşteri kontrolü için ad ve telefon izlenir (alanlar yine kontrolsüz)
  const [customerName, setCustomerName] = useState("");
  const [phone, setPhone] = useState("");
  const [lookupField, setLookupField] = useState<"name" | "phone" | null>(null);
  const [formVersion, setFormVersion] = useState(0);
  // Kayıttan sonra React formu sıfırlıyor; geçmiş uyarısı da sıfırlansın
  const resetLookup = () => { setCustomerName(""); setPhone(""); setLookupField(null); setFormVersion((version) => version + 1); };
  return <form className="panel-form request-entry-form" action={createOpportunity} onReset={resetLookup}>
    {academicMode ? <>
      <label>Müşteri türü<select name="customer_type" defaultValue="Bireysel"><option>Bireysel</option><option>Kurumsal</option></select></label>
      <label>Hizmet türü<b className="req" aria-hidden="true">*</b><select name="service_type" required value={serviceType} onChange={(event) => setServiceType(event.target.value)}><option value="" disabled>Seçin</option>{serviceTypes.map((item) => <option value={item} key={item}>{item}</option>)}</select></label>
      {serviceType === "Diğer" ? <label className="request-other-service">Diğer hizmet<b className="req" aria-hidden="true">*</b><input name="other_service_type" required minLength={2} maxLength={120} placeholder="Hizmet türünü yazın" /></label> : null}
    </> : null}
    <label>Talep konusu<b className="req" aria-hidden="true">*</b><input name="title" required minLength={2} maxLength={180} /></label>
    <label>Müşteri / kurum<b className="req" aria-hidden="true">*</b><input name="customer_name" required minLength={2} maxLength={180} autoComplete="off" onChange={(event) => setCustomerName(event.target.value)} onFocus={() => setLookupField("name")} onBlur={() => setLookupField(null)} /></label>
    <label>E-posta<input name="contact_email" type="email" /></label><label>Telefon<input name="contact_phone" type="tel" autoComplete="off" onChange={(event) => setPhone(event.target.value)} onFocus={() => setLookupField("phone")} onBlur={() => setLookupField(null)} /></label>
    <CustomerHistoryNotice key={formVersion} name={customerName} phone={phone} editing={lookupField !== null} />
    {canAssign ? <label className="wide">Satış temsilcisi<select name="assigned_employee_id" defaultValue=""><option value="">Atanmamış</option>{salesRepresentatives.map((employee)=><option value={employee.id} key={employee.id}>{employee.full_name}{employee.job_title?` · ${employee.job_title}`:""}</option>)}</select></label> : <p className="wide panel-form-note">Bu talep otomatik olarak size atanacaktır.</p>}
    {academicMode ? <><label>Üniversite<input name="university" /></label><label>Bölüm / alan<input name="department" /></label><label>Akademik düzey<input name="academic_level" /></label><label>Çalışma dili<input name="language" defaultValue="Türkçe" /></label><label className="wide">Beklenen kapsam ve teslimler<b className="req" aria-hidden="true">*</b><textarea name="scope" required /></label></> : null}
    <label>Planlanan teslim tarihi<input name="expected_close_date" type="date" /></label><label>Talep kaynağı<input name="source" /></label><label className="wide">Ek not<textarea name="notes" /></label>
    <div className="wide panel-form-actions"><button className="panel-primary" type="submit">Talebi kaydet</button></div>
  </form>;
}
