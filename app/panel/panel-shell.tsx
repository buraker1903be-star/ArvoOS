"use client";

import { ReactNode, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { getStoredSession, signOut, type SupabaseSession } from "@/lib/supabase-auth";
import { getMyOrganizations, getRolePermissions, type OrganizationMembership, type Permission } from "@/lib/arvoos-core";

const ACTIVE_ORGANIZATION_KEY = "arvoos.activeOrganizationId";

const modules = [
  { name: "Genel Bakış", permission: null, href: "/panel" },
  { name: "CRM & Satış", permission: "crm.read", href: "/panel/crm" },
  { name: "Satış Siparişleri", permission: "sales.read", href: "/panel/satis-siparisleri" },
  { name: "Sevkiyat", permission: "shipping.read", href: "/panel/sevkiyat" },
  { name: "Arvos İş Takibi", permission: "work.read", href: "/panel/isler" },
  { name: "Finans Merkezi", permission: "finance.read", href: "/panel/finance" },
  { name: "Ödeme Planları", permission: "finance.read", href: "/panel/finance/payment-plans" },
  { name: "Faturalar", permission: "finance.read", href: "/panel/finance/invoices" },
  { name: "Tedarikçi Borçları", permission: "finance.read", href: "/panel/finans/tedarikci-borclari" },
  { name: "Satın Alma", permission: "purchasing.read", href: "/panel/satinalma" },
  { name: "Stok", permission: "inventory.read", href: "/panel/stok" },
  { name: "Organizasyon Yapısı", permission: "organization.manage", href: "/panel/organizasyon" },
  { name: "Ekip Yönetimi", permission: "users.read", href: "/panel/ekip" },
  { name: "Rol ve Yetkiler", permission: "roles.manage", href: "/panel/roller" },
  { name: "Aktivite Kayıtları", permission: "audit.read", href: "/panel/aktivite" },
];

const planLabels = { trial: "Deneme Paketi", starter: "Başlangıç Paketi", professional: "Profesyonel Paket", enterprise: "Kurumsal Paket" } as const;

export default function PanelShell({ children }: { children: ReactNode }) {
  const pathname = usePathname(); const router = useRouter();
  const [session,setSession]=useState<SupabaseSession|null>(null); const [memberships,setMemberships]=useState<OrganizationMembership[]>([]); const [membership,setMembership]=useState<OrganizationMembership|null>(null); const [permissions,setPermissions]=useState<Permission[]>([]); const [loading,setLoading]=useState(pathname!=="/panel"); const [error,setError]=useState("");
  useEffect(()=>{if(pathname==="/panel"){setLoading(false);return;} const current=getStoredSession(); if(!current){router.replace("/giris");return;} setSession(current); void loadWorkspace(current);},[pathname,router]);
  async function loadWorkspace(current:SupabaseSession){setLoading(true);setError("");try{const rows=await getMyOrganizations(current);const stored=window.localStorage.getItem(ACTIVE_ORGANIZATION_KEY);const active=rows.find(i=>i.organization_id===stored)||rows[0]||null;setMemberships(rows);setMembership(active);if(!active){router.replace("/panel");return;}setPermissions(await getRolePermissions(current,active.role?.id));}catch(e){setError(e instanceof Error?e.message:"Panel menüsü yüklenemedi.");}finally{setLoading(false);}}
  const permissionCodes=useMemo(()=>new Set(permissions.map(p=>p.code)),[permissions]); const visibleModules=modules.filter(m=>!m.permission||permissionCodes.has(m.permission));
  async function handleOrganizationChange(id:string){if(!session||id===membership?.organization_id)return;window.localStorage.setItem(ACTIVE_ORGANIZATION_KEY,id);window.location.reload();}
  async function handleLogout(){window.localStorage.removeItem(ACTIVE_ORGANIZATION_KEY);await signOut();router.replace("/giris");}
  if(pathname==="/panel")return children;if(loading)return <main className="panel-loading">Panel ve çalışma alanı yükleniyor...</main>;if(!membership)return <main className="panel-loading">Çalışma alanı bulunamadı.</main>;
  const organization=membership.organization;
  return <div className="panel-shell"><aside className="panel-sidebar"><button className="panel-logo panel-logo-button" type="button" onClick={()=>router.push("/panel")}><img src="/arvoos-logo.png" alt="ArvoOS"/></button><div className="panel-company"><small>AKTİF ÇALIŞMA ALANI</small>{memberships.length>1?<select aria-label="Aktif çalışma alanı" value={membership.organization_id} onChange={e=>void handleOrganizationChange(e.target.value)}>{memberships.map(item=><option key={item.organization_id} value={item.organization_id}>{item.organization.name}</option>)}</select>:<b>{organization.name}</b>}<span>{planLabels[organization.plan]}</span></div><nav aria-label="Panel modülleri">{visibleModules.map(module=>{const active=module.href==="/panel"?pathname==="/panel":pathname===module.href||pathname.startsWith(`${module.href}/`);return <button key={module.href} className={active?"active":undefined} type="button" onClick={()=>router.push(module.href)}>{module.name}</button>;})}</nav><button className="logout" type="button" onClick={handleLogout}>Çıkış Yap</button></aside><div className="panel-module-content">{error&&<div className="panel-error panel-error-wide" role="alert">{error}</div>}{children}</div></div>;
}
