"use client";

import { createAppointment } from "./actions";
// Ortak kayıt formu düzeni; bileşen stilini kendisi alıyor (AGENTS.md).
import "../../components/kayit-formu.css";

type Employee = { id: string; full_name: string; job_title: string | null };

export function AppointmentForm({
  isManager,
  employees,
  defaultDate,
  returnTo,
}: {
  isManager: boolean;
  employees: Employee[];
  defaultDate: string;
  returnTo: string;
}) {
  return (
    <form className="panel-form appointment-form kayit-formu" action={createAppointment}>
      <input type="hidden" name="return_to" value={returnTo} />
      <p className="wide kayit-formu-bolum">Görüşme</p>
      {isManager ? (
        <label className="wide"><span>Satış temsilcisi<b className="req" aria-hidden="true">*</b></span><select name="employee_id" required defaultValue="">
          <option value="" disabled>Seçin</option>
          {employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.full_name}{employee.job_title ? ` · ${employee.job_title}` : ""}</option>)}
        </select></label>
      ) : null}
      <label className="wide"><span>Konu<b className="req" aria-hidden="true">*</b></span><input name="title" required minLength={2} maxLength={160} placeholder="Örn. Tanıtım görüşmesi" /></label>
      <label>Kiminle<input name="contact_name" placeholder="Müşteri / kişi adı" /></label>
      <label>Telefon<input name="contact_phone" type="tel" inputMode="tel" placeholder="05xx xxx xx xx" /></label>
      <p className="wide kayit-formu-bolum">Zaman</p>
      <label><span>Tarih<b className="req" aria-hidden="true">*</b></span><input name="starts_date" type="date" required defaultValue={defaultDate} /></label>
      <label><span>Başlangıç saati<b className="req" aria-hidden="true">*</b></span><input name="starts_time" type="time" required defaultValue="09:00" /></label>
      <label className="wide">Bitiş saati (isteğe bağlı)<input name="ends_time" type="time" /></label>
      <label className="wide">Not<textarea name="note" placeholder="Görüşme konusu, hazırlık notu…" /></label>
      <div className="wide panel-form-actions kayit-formu-eylem"><p><b className="req" aria-hidden="true">*</b> işaretli alanlar zorunlu.</p><button className="panel-primary" type="submit">Randevuyu kaydet</button></div>
    </form>
  );
}
