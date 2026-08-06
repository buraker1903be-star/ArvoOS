"use client";

import { createAppointment } from "./actions";

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
    <form className="panel-form appointment-form" action={createAppointment}>
      <input type="hidden" name="return_to" value={returnTo} />
      {isManager ? (
        <label className="wide">Satış temsilcisi<select name="employee_id" required defaultValue="">
          <option value="" disabled>Seçin</option>
          {employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.full_name}{employee.job_title ? ` · ${employee.job_title}` : ""}</option>)}
        </select></label>
      ) : null}
      <label className="wide">Konu<input name="title" required minLength={2} maxLength={160} placeholder="Örn. Tanıtım görüşmesi" /></label>
      <label>Kiminle<input name="contact_name" placeholder="Müşteri / kişi adı" /></label>
      <label>Telefon<input name="contact_phone" type="tel" /></label>
      <label>Tarih<input name="starts_date" type="date" required defaultValue={defaultDate} /></label>
      <label>Saat<input name="starts_time" type="time" required defaultValue="09:00" /></label>
      <label className="wide">Bitiş saati (opsiyonel)<input name="ends_time" type="time" /></label>
      <label className="wide">Not<textarea name="note" placeholder="Görüşme konusu, hazırlık notu…" /></label>
      <div className="wide panel-form-actions"><button className="panel-primary" type="submit">Randevuyu kaydet</button></div>
    </form>
  );
}
