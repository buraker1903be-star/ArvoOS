"use client";

import { useState } from "react";
import { createOpportunity } from "./actions";

const serviceTypes = ["Tez Danışmanlığı","Akademik Çeviri","Literatür Danışmanlığı","Veri Analizi","Makale Danışmanlığı","Biçimsel Düzenleme","Araştırma Tasarımı","Doçentlik Başvuru Danışmanlığı","Diğer"];
type SalesRepresentative={id:string;full_name:string;job_title:string|null};

export function RequestEntryForm({ academicMode, salesRepresentatives, canAssign }: { academicMode: boolean; salesRepresentatives: SalesRepresentative[]; canAssign: boolean }) {
  const [serviceType, setServiceType] = useState("");
  return <form className="panel-form request-entry-form" action={createOpportunity}>
    {academicMode ? <>
      <label>Müşteri türü<select name="customer_type" defaultValue="Bireysel"><option>Bireysel</option><option>Kurumsal</option></select></label>
      <label>Hizmet türü<select name="service_type" required value={serviceType} onChange={(event) => setServiceType(event.target.value)}><option value="" disabled>Seçin</option>{serviceTypes.map((item) => <option value={item} key={item}>{item}</option>)}</select></label>
      {serviceType === "Diğer" ? <label className="request-other-service">Diğer hizmet<input name="other_service_type" required minLength={2} maxLength={120} placeholder="Hizmet türünü yazın" /></label> : null}
    </> : null}
    <label>Talep konusu<input name="title" required minLength={2} maxLength={180} /></label>
    <label>Müşteri / kurum<input name="customer_name" required minLength={2} maxLength={180} /></label>
    <label>E-posta<input name="contact_email" type="email" /></label><label>Telefon<input name="contact_phone" type="tel" /></label>
    {canAssign ? <label className="wide">Satış temsilcisi<select name="assigned_employee_id" defaultValue=""><option value="">Atanmamış</option>{salesRepresentatives.map((employee)=><option value={employee.id} key={employee.id}>{employee.full_name}{employee.job_title?` · ${employee.job_title}`:""}</option>)}</select></label> : <p className="wide panel-form-note">Bu talep otomatik olarak size atanacaktır.</p>}
    {academicMode ? <><label>Üniversite<input name="university" /></label><label>Bölüm / alan<input name="department" /></label><label>Akademik düzey<input name="academic_level" /></label><label>Çalışma dili<input name="language" defaultValue="Türkçe" /></label><label className="wide">Beklenen kapsam ve teslimler<textarea name="scope" required /></label></> : null}
    <label>Planlanan teslim tarihi<input name="expected_close_date" type="date" /></label><label>Talep kaynağı<input name="source" /></label><label className="wide">Ek not<textarea name="notes" /></label>
    <div className="wide panel-form-actions"><button className="panel-primary" type="submit">Talebi kaydet</button></div>
  </form>;
}
