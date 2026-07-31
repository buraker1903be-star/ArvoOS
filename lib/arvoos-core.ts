import type { SupabaseSession } from "@/lib/supabase-auth";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://scgjhsyygkmntxytkjbf.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "sb_publishable_S0jBPDJuvwLuHI3TzyGllQ_PVlBAslN";

export type Organization = { id: string; name: string; slug: string; plan: "trial" | "starter" | "professional" | "enterprise"; is_active: boolean };
export type OrganizationMembership = { organization_id: string; user_id: string; status: "invited" | "active" | "suspended"; organization: Organization; role: { id: string; name: string; code: string } | null };
export type Permission = { id?: string; code: string; name: string; module: string; description?: string | null };
export type RoleSummary = { id: string; name: string; code: string; description?: string | null; is_system?: boolean };
export type OrganizationMember = { organization_id: string; user_id: string; status: "invited" | "active" | "suspended"; joined_at: string | null; profile: { full_name: string | null; phone: string | null } | null; role: RoleSummary | null };
export type Branch = { id: string; organization_id: string; name: string; code: string; address: string | null; is_active: boolean; created_at: string };
export type Department = { id: string; organization_id: string; branch_id: string | null; name: string; code: string; is_active: boolean; created_at: string; branch: { id: string; name: string; code: string } | null };
export type ActivityLog = { id: number; organization_id: string; actor_user_id: string | null; action: string; entity_type: string; entity_id: string | null; metadata: Record<string, unknown>; created_at: string; actor: { full_name: string | null; phone: string | null } | null };

type RolePermissionRow = { permission: Permission | null };
type CoreRequestOptions = RequestInit & { accessToken: string };

async function coreRequest<T>(path: string, options: CoreRequestOptions): Promise<T> {
  const { accessToken, headers, ...requestOptions } = options;
  const response = await fetch(`${SUPABASE_URL}${path}`, {
    ...requestOptions,
    headers: { apikey: SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json", ...headers },
  });
  if (!response.ok) {
    const error = await response.json().catch(() => null) as { message?: string } | null;
    throw new Error(error?.message || `ArvoOS Core isteği başarısız oldu (${response.status}).`);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export async function getMyOrganizations(session: SupabaseSession) {
  const select = encodeURIComponent("organization_id,user_id,status,organization:organizations(id,name,slug,plan,is_active),role:roles(id,name,code)");
  const userFilter = encodeURIComponent(`eq.${session.user.id}`);
  return coreRequest<OrganizationMembership[]>(`/rest/v1/organization_members?select=${select}&user_id=${userFilter}&status=eq.active`, { method: "GET", accessToken: session.access_token });
}

export async function getRolePermissions(session: SupabaseSession, roleId?: string | null) {
  if (!roleId) return [];
  const select = encodeURIComponent("permission:permissions(id,code,name,module,description)");
  const roleFilter = encodeURIComponent(`eq.${roleId}`);
  const rows = await coreRequest<RolePermissionRow[]>(`/rest/v1/role_permissions?select=${select}&role_id=${roleFilter}`, { method: "GET", accessToken: session.access_token });
  return rows.flatMap((row) => row.permission ? [row.permission] : []);
}

export async function getAllPermissions(session: SupabaseSession) {
  return coreRequest<Permission[]>("/rest/v1/permissions?select=id,code,name,module,description&order=module.asc,name.asc", { method: "GET", accessToken: session.access_token });
}

export async function getOrganizationMembers(session: SupabaseSession, organizationId: string) {
  const select = encodeURIComponent("organization_id,user_id,status,joined_at,profile:profiles(full_name,phone),role:roles(id,name,code)");
  return coreRequest<OrganizationMember[]>(`/rest/v1/organization_members?select=${select}&organization_id=eq.${organizationId}&order=created_at.asc`, { method: "GET", accessToken: session.access_token });
}

export async function getOrganizationRoles(session: SupabaseSession, organizationId: string) {
  return coreRequest<RoleSummary[]>(`/rest/v1/roles?select=id,name,code,description,is_system&organization_id=eq.${organizationId}&order=name.asc`, { method: "GET", accessToken: session.access_token });
}

export async function saveOrganizationRole(session: SupabaseSession, organizationId: string, roleId: string | null, name: string, code: string, description: string, permissionCodes: string[]) {
  return coreRequest<string>("/rest/v1/rpc/save_organization_role", { method: "POST", accessToken: session.access_token, body: JSON.stringify({ target_organization_id: organizationId, target_role_id: roleId, target_name: name, target_code: code, target_description: description, target_permission_codes: permissionCodes }) });
}

export async function updateMemberAccess(session: SupabaseSession, organizationId: string, userId: string, roleId: string, status: OrganizationMember["status"]) {
  return coreRequest<void>("/rest/v1/rpc/update_member_access", { method: "POST", accessToken: session.access_token, body: JSON.stringify({ target_organization_id: organizationId, target_user_id: userId, target_role_id: roleId, target_status: status }) });
}

export async function createOrganizationInvitation(session: SupabaseSession, organizationId: string, email: string, roleId: string) {
  return coreRequest<string>("/rest/v1/rpc/create_organization_invitation", { method: "POST", accessToken: session.access_token, body: JSON.stringify({ target_organization_id: organizationId, target_email: email, target_role_id: roleId }) });
}

export async function getOrganizationBranches(session: SupabaseSession, organizationId: string) {
  return coreRequest<Branch[]>(`/rest/v1/branches?select=id,organization_id,name,code,address,is_active,created_at&organization_id=eq.${organizationId}&order=name.asc`, { method: "GET", accessToken: session.access_token });
}

export async function getOrganizationDepartments(session: SupabaseSession, organizationId: string) {
  const select = encodeURIComponent("id,organization_id,branch_id,name,code,is_active,created_at,branch:branches(id,name,code)");
  return coreRequest<Department[]>(`/rest/v1/departments?select=${select}&organization_id=eq.${organizationId}&order=name.asc`, { method: "GET", accessToken: session.access_token });
}

export async function saveBranch(session: SupabaseSession, organizationId: string, branch: Partial<Branch> & Pick<Branch, "name" | "code" | "is_active">) {
  return coreRequest<string>("/rest/v1/rpc/save_branch", { method: "POST", accessToken: session.access_token, body: JSON.stringify({ target_organization_id: organizationId, target_branch_id: branch.id || null, target_name: branch.name, target_code: branch.code, target_address: branch.address || "", target_is_active: branch.is_active }) });
}

export async function saveDepartment(session: SupabaseSession, organizationId: string, department: Partial<Department> & Pick<Department, "name" | "code" | "is_active">) {
  return coreRequest<string>("/rest/v1/rpc/save_department", { method: "POST", accessToken: session.access_token, body: JSON.stringify({ target_organization_id: organizationId, target_department_id: department.id || null, target_branch_id: department.branch_id || null, target_name: department.name, target_code: department.code, target_is_active: department.is_active }) });
}

export async function getOrganizationActivityLogs(session: SupabaseSession, organizationId: string, limit = 200) {
  const select = encodeURIComponent("id,organization_id,actor_user_id,action,entity_type,entity_id,metadata,created_at,actor:profiles(full_name,phone)");
  return coreRequest<ActivityLog[]>(`/rest/v1/activity_logs?select=${select}&organization_id=eq.${organizationId}&order=created_at.desc&limit=${limit}`, { method: "GET", accessToken: session.access_token });
}

export async function bootstrapOrganization(session: SupabaseSession, name: string, slug: string) {
  return coreRequest<string>("/rest/v1/rpc/bootstrap_organization", { method: "POST", accessToken: session.access_token, body: JSON.stringify({ organization_name: name, organization_slug: slug }) });
}
