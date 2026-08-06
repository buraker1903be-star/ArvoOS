"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { inviteTeamMember, type InviteTeamMemberState } from "./team-actions";

const initialState: InviteTeamMemberState = { error: null, success: false };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button className="panel-primary" type="submit" disabled={pending}>
      {pending ? "Gönderiliyor..." : "Daveti Gönder"}
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
    <form className="panel-form" action={formAction}>
      <input type="hidden" name="employee_id" value={employeeId} />
      <input type="hidden" name="full_name" value={fullName} />
      <label className="wide">
        E-posta
        <input name="email" type="email" required defaultValue={defaultEmail} />
      </label>
      <label>
        Rol
        <select name="role" defaultValue="member">
          <option value="member">Satış Personeli</option>
          <option value="operasyoncu">Operasyon Personeli</option>
          <option value="admin">Yönetici</option>
          <option value="owner">Kurum Sahibi</option>
        </select>
      </label>
      {state.error ? (
        <div className="wide panel-form-error" role="alert" aria-live="assertive" style={{ border: "1px solid currentColor", borderRadius: "10px", padding: "12px 14px" }}>
          <strong>Davet gönderilemedi</strong>
          <p style={{ margin: "6px 0 0" }}>{state.error}</p>
        </div>
      ) : null}
      {state.success ? (
        <div className="wide panel-form-success" role="status" style={{ border: "1px solid currentColor", borderRadius: "10px", padding: "12px 14px" }}>
          Davet gönderildi.
        </div>
      ) : null}
      <div className="wide panel-form-actions"><SubmitButton /></div>
    </form>
  );
}
