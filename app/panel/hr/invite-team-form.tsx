"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { inviteTeamMember, type InviteTeamMemberState } from "./team-actions";
// Ortak kayıt formu düzeni; bileşen stilini kendisi alıyor (AGENTS.md).
import "../components/kayit-formu.css";

const initialState: InviteTeamMemberState = { error: null, success: false };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button className="panel-primary" type="submit" disabled={pending} aria-busy={pending}>
      {pending ? "Gönderiliyor..." : "Daveti gönder"}
    </button>
  );
}

export function InviteTeamForm({
  employeeId,
  fullName,
  defaultEmail,
}: {
  employeeId: string;
  fullName: string;
  defaultEmail: string;
}) {
  const [state, formAction] = useActionState(inviteTeamMember, initialState);

  return (
    <form className="panel-form kayit-formu" action={formAction}>
      <input type="hidden" name="employee_id" value={employeeId} />
      <input type="hidden" name="full_name" value={fullName} />
      <label className="wide">
        <span>E-posta<b className="req" aria-hidden="true">*</b></span>
        <input name="email" type="email" required defaultValue={defaultEmail} placeholder="ad@kurum.com" />
      </label>
      <label className="wide">
        Panel rolü
        <select name="role" defaultValue="member">
          <option value="member">Satış Personeli</option>
          <option value="operasyoncu">Operasyon Personeli</option>
          <option value="admin">Yönetici</option>
          <option value="owner">Kurum Sahibi</option>
        </select>
      </label>
      {state.error ? (
        <div className="wide panel-form-error hr-form-alert is-danger" role="alert" aria-live="assertive">
          <strong>Davet gönderilemedi</strong>
          <p>{state.error}</p>
        </div>
      ) : null}
      {state.success ? (
        <div className="wide panel-form-success hr-form-alert is-success" role="status">
          Davet gönderildi.
        </div>
      ) : null}
      <p className="wide kayit-formu-not">Modül ve işlem yetkileri rolden gelir; kişiye özel istisnaları kayıttan sonra “Yetkiler” penceresinden değiştirebilirsiniz.</p>
      <div className="wide panel-form-actions kayit-formu-eylem"><p>Bağlantı 7 gün geçerli.</p><SubmitButton /></div>
    </form>
  );
}
