import { getPanelContext } from "@/lib/panel-context";
import { PanelDrawer } from "../components/panel-drawer";
import { inviteTeamMember, updateTeamMemberAccess, cancelInvitation } from "./actions";
import { roleNames } from "./role-names";
import "./ekip.css";

type Member = { organization_id: string; user_id: string; role: string; is_active: boolean; joined_at: string };
type Profile = { id: string; full_name: string | null };
type Invitation = { id: string; email: string; role: string; status: string; created_at: string; expires_at: string };

export default async function TeamPage() {
  const { supabase, membership, userId } = await getPanelContext();
  const canManage = ["owner", "admin"].includes(membership.role);
  if (!canManage) throw new Error("Ekip yönetimi için yönetici yetkisi gerekiyor.");

  const [{ data: memberData, error: memberError }, { data: invitationData, error: invitationError }] = await Promise.all([
    supabase.from("organization_memberships").select("organization_id,user_id,role,is_active,joined_at").eq("organization_id", membership.organization_id).order("joined_at", { ascending: true }),
    supabase.from("organization_invitations").select("id,email,role,status,created_at,expires_at").eq("organization_id", membership.organization_id).in("status", ["pending", "sent"]).order("created_at", { ascending: false }),
  ]);
  if (memberError) throw new Error("Ekip üyeleri okunamadı: " + memberError.message);
  if (invitationError) throw new Error("Davetler okunamadı: " + invitationError.message);

  const members = (memberData ?? []) as Member[];
  const invitations = (invitationData ?? []).filter((invite) => new Date(invite.expires_at) > new Date()) as Invitation[];
  const userIds = members.map((member) => member.user_id);
  const { data: profileData } = userIds.length ? await supabase.from("profiles").select("id,full_name").in("id", userIds) : { data: [] as Profile[] };
  const profileMap = new Map(((profileData ?? []) as Profile[]).map((profile) => [profile.id, profile.full_name]));

  const activeCount = members.filter((member) => member.is_active).length;

  return (
    <>
      <div className="panel-pagehead">
        <div><small className="panel-kicker">YÖNETİM</small><h1>Ekip ve Kullanıcılar</h1><p>Kurum üyelerini, rollerini ve panel erişimlerini yönetin.</p></div>
        <div className="panel-page-actions">
          <span className="status-pill">{activeCount} aktif</span>
          <PanelDrawer triggerLabel="+ Kullanıcı davet et" title="Yeni kullanıcı davet et" description="Kullanıcıya gerçek bir davet e-postası gönderilir; e-postadaki linkten kendi şifresini oluşturur.">
            <form className="panel-form" action={inviteTeamMember}>
              <label className="wide">E-posta<input name="email" type="email" required placeholder="kullanici@firma.com" /></label>
              <label>Ad Soyad (opsiyonel)<input name="full_name" placeholder="Ad Soyad" /></label>
              <label>Rol<select name="role" defaultValue="member">
                <option value="member">Üye</option>
                <option value="manager">Ekip Lideri</option>
                <option value="admin">Yönetici</option>
                <option value="owner">Kurum Sahibi</option>
              </select></label>
              <div className="wide panel-form-actions"><button className="panel-primary" type="submit">Daveti Gönder</button></div>
            </form>
          </PanelDrawer>
        </div>
      </div>

      {invitations.length ? (
        <section className="panel-card team-invites">
          <div className="section-heading compact"><div><small className="panel-kicker">BEKLEYEN DAVETLER</small><h2>Henüz kabul edilmedi</h2></div></div>
          <div className="team-invite-list">
            {invitations.map((invite) => (
              <div className="team-invite-row" key={invite.id}>
                <div><b>{invite.email}</b><small>{roleNames[invite.role] ?? invite.role} · {new Date(invite.created_at).toLocaleDateString("tr-TR")} gönderildi</small></div>
                <span className="status-pill">{invite.status === "sent" ? "E-posta gönderildi" : "Gönderiliyor"}</span>
                <form action={cancelInvitation}><input type="hidden" name="invitation_id" value={invite.id} /><button className="panel-secondary" type="submit">İptal Et</button></form>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="panel-card">
        <div className="section-heading compact"><div><small className="panel-kicker">EKİP ÜYELERİ</small><h2>Panel erişimi olanlar</h2></div></div>
        <div className="team-member-list">
          {members.map((member) => (
            <div className="team-member-row" key={member.user_id}>
              <div className="team-member-identity">
                <span className="team-avatar">{(profileMap.get(member.user_id) || "K").slice(0, 2).toUpperCase()}</span>
                <div><b>{profileMap.get(member.user_id) || "İsimsiz kullanıcı"}</b><small>{member.user_id === userId ? "Siz" : `Katılım: ${new Date(member.joined_at).toLocaleDateString("tr-TR")}`}</small></div>
              </div>
              {member.user_id === userId ? (
                <span className="status-pill">{roleNames[member.role] ?? member.role} · Kendiniz</span>
              ) : (
                <form className="team-member-form" action={updateTeamMemberAccess}>
                  <input type="hidden" name="user_id" value={member.user_id} />
                  <select name="role" defaultValue={member.role}>
                    <option value="member">Üye</option>
                    <option value="manager">Ekip Lideri</option>
                    <option value="admin">Yönetici</option>
                    <option value="owner">Kurum Sahibi</option>
                  </select>
                  <label className="team-active-toggle"><input type="checkbox" name="is_active" defaultChecked={member.is_active} /> Aktif</label>
                  <button className="panel-secondary" type="submit">Kaydet</button>
                </form>
              )}
            </div>
          ))}
          {!members.length ? <p className="panel-empty">Henüz ekip üyesi yok.</p> : null}
        </div>
      </section>
    </>
  );
}
