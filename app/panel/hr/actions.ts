"use server";

import { runPanelAction } from "@/lib/panel-action";
import { adDegisikligiEngeli } from "@/lib/departman-kurali";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getPanelContext } from "@/lib/panel-context";
import { assertModuleKeyAccess } from "@/lib/role-permissions";
import { CONFIDENTIALITY_AGREEMENT_TEXT, CONFIDENTIALITY_AGREEMENT_VERSION, confidentialityAgreementNumber } from "@/lib/confidentiality-agreement";
import { assertYetki } from "@/lib/yetkiler";

const text=(formData:FormData,key:string,max=300)=>String(formData.get(key)??"").trim().slice(0,max);
const CALISMA_TIPLERI=["full_time","part_time","contractor","intern"];
const CALISMA_DURUMLARI=["active","on_leave","inactive","terminated"];
const number=(formData:FormData,key:string)=>Number(String(formData.get(key)??"0").replace(",","."))||0;

// Bu dosyadaki işlemlerin hepsi (departman, personel ekleme/düzenleme, prim
// oranları) yönetim işlemi. Eskiden yalnızca modülün açık olmasına
// bakılıyordu; herhangi bir çalışan kendi prim oranını %100 yapabiliyordu.
async function hrContext(){
  const context=await getPanelContext();
  if(!context.modules.some((module)=>module.code==="hr")) throw new Error("İnsan Kaynakları modülüne erişiminiz yok.");
  assertYetki(context.yetkiler, "hr.personel.yonet");
  assertModuleKeyAccess(context.membership.role,"hr",context.hiddenModuleKeys);
  return context;
}

async function createDepartment__impl(formData:FormData){
  const {supabase,membership}=await hrContext();
  const name=text(formData,"name",120);
  if(name.length<2) throw new Error("Departman adı en az 2 karakter olmalıdır.");
  const {error}=await supabase.from("hr_departments").insert({organization_id:membership.organization_id,name,code:text(formData,"code",30)||null});
  if(error) throw new Error(error.code==="23505"?"Bu adla bir departman zaten var.":"Departman oluşturulamadı: "+error.message);
  revalidatePath("/panel/hr", "layout"); // personel detayı (/panel/hr/[id]) da yenilensin
}

/*
  DEPARTMAN DÜZENLEME (29.10.2026, Departmanlar sayfası). Eskiden
  departman yalnızca açılabiliyordu; yanlış yazılan ad, kod ya da artık
  kullanılmayan bir departman için yol yoktu.

  Adın yetki anlamı var (lib/departman-kurali.ts): yönetim adına giren
  ya da çıkan yeniden adlandırmayı yalnızca Kurum Sahibi yapar —
  veritabanının personel tetikleyicisi ad değişikliğini görmüyor.
  Pasife alınan departman yeni personel formunda listelenmez; içindeki
  personel olduğu yerde kalır.
*/
async function updateDepartment__impl(formData:FormData){
  const {supabase,membership}=await hrContext();
  const id=text(formData,"department_id",80);
  const name=text(formData,"name",120);
  if(!id) throw new Error("Departman seçilmedi.");
  if(name.length<2) throw new Error("Departman adı en az 2 karakter olmalıdır.");
  const {data:mevcut,error:okumaHatasi}=await supabase.from("hr_departments").select("id,name").eq("id",id).eq("organization_id",membership.organization_id).maybeSingle();
  if(okumaHatasi) throw new Error("Departman okunamadı: "+okumaHatasi.message);
  if(!mevcut) throw new Error("Departman bulunamadı.");
  const engel=adDegisikligiEngeli(mevcut.name as string,name,membership.role==="owner");
  if(engel) throw new Error(engel);
  const {data,error}=await supabase.from("hr_departments").update({
    name,
    code:text(formData,"code",30)||null,
    is_active:formData.get("is_active")!=="0",
    updated_at:new Date().toISOString(),
  }).eq("id",id).eq("organization_id",membership.organization_id).select("id").maybeSingle();
  if(error) throw new Error(error.code==="23505"?"Bu adla bir departman zaten var.":"Departman güncellenemedi: "+error.message);
  if(!data) throw new Error("Departman güncellenemedi; yetkiniz olmayabilir.");
  revalidatePath("/panel/hr", "layout");
}

/*
  DEPARTMAN SİLME: yalnızca içinde personel yoksa. Veritabanı silmede
  personelin departmanını boşaltıyor (ON DELETE SET NULL): engel olmasa
  herkes sessizce "Departmansız" kalır ve müdür profilleri anlamını
  yitirirdi. Engelin sorgusu hata yutmaz (AGENTS.md): okunamayan bir
  sayı "personel yok" demek değil. Yönetim departmanını yalnızca Kurum
  Sahibi siler.
*/
async function deleteDepartment__impl(formData:FormData){
  const {supabase,membership}=await hrContext();
  const id=text(formData,"department_id",80);
  if(!id) throw new Error("Departman seçilmedi.");
  const {data:mevcut,error:okumaHatasi}=await supabase.from("hr_departments").select("id,name").eq("id",id).eq("organization_id",membership.organization_id).maybeSingle();
  if(okumaHatasi) throw new Error("Departman okunamadı: "+okumaHatasi.message);
  if(!mevcut) throw new Error("Departman bulunamadı.");
  if(adDegisikligiEngeli(mevcut.name as string,"",membership.role==="owner")) throw new Error("Yönetim departmanını yalnızca Kurum Sahibi silebilir.");
  const {count,error:sayimHatasi}=await supabase.from("hr_employees").select("id",{count:"exact",head:true}).eq("organization_id",membership.organization_id).eq("department_id",id);
  if(sayimHatasi) throw new Error("Departmandaki personel sayılamadı: "+sayimHatasi.message);
  if(count===null) throw new Error("Departmandaki personel sayılamadı.");
  if(count>0) throw new Error(`Bu departmanda ${count} personel var. Önce personeli başka bir departmana taşıyın ya da departmanı pasife alın.`);
  const {data,error}=await supabase.from("hr_departments").delete().eq("id",id).eq("organization_id",membership.organization_id).select("id").maybeSingle();
  if(error) throw new Error("Departman silinemedi: "+error.message);
  if(!data) throw new Error("Departman silinemedi; yetkiniz olmayabilir.");
  revalidatePath("/panel/hr", "layout");
}

async function createEmployee__impl(formData:FormData){
  const {supabase,membership,userId}=await hrContext();
  const fullName=text(formData,"full_name",180);
  const commissionRate=number(formData,"commission_rate");
  const operationCommissionRate=number(formData,"operation_commission_rate");
  if(fullName.length<2) throw new Error("Personel adı en az 2 karakter olmalıdır.");
  if(commissionRate<0||commissionRate>100||operationCommissionRate<0||operationCommissionRate>100) throw new Error("Prim oranları 0 ile 100 arasında olmalıdır.");
  // Düzenlemeyle aynı doğrulama (updateEmployee): kısıt hatası İngilizce düşmesin.
  const employmentType=text(formData,"employment_type",30)||"full_time";
  if(!CALISMA_TIPLERI.includes(employmentType)) throw new Error("Çalışma tipi tanınmadı.");
  const startDate=text(formData,"start_date",20);
  if(startDate&&!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) throw new Error("İşe giriş tarihi geçersiz.");
  const {data:employee,error}=await supabase.from("hr_employees").insert({
    organization_id:membership.organization_id,
    full_name:fullName,
    email:text(formData,"email",240)||null,
    phone:text(formData,"phone",80)||null,
    job_title:text(formData,"job_title",160)||null,
    department_id:text(formData,"department_id",80)||null,
    employee_no:text(formData,"employee_no",50)||null,
    start_date:startDate||null,
    employment_type:employmentType,
    employment_status:"active",
    can_receive_sales_requests:formData.get("can_receive_sales_requests")==="on",
    commission_rate:commissionRate,
    operation_commission_rate:operationCommissionRate,
    created_by:userId,
  }).select("id").single();
  if(error) throw new Error("Personel oluşturulamadı: "+error.message);
  const {error:agreementError}=await supabase.from("hr_confidentiality_agreements").insert({
    organization_id:membership.organization_id,
    employee_id:employee.id,
    agreement_no:confidentialityAgreementNumber(employee.id),
    agreement_version:CONFIDENTIALITY_AGREEMENT_VERSION,
    content_snapshot:CONFIDENTIALITY_AGREEMENT_TEXT,
    created_by:userId,
  });
  if(agreementError) throw new Error("Personel oluşturuldu ancak gizlilik sözleşmesi hazırlanamadı: "+agreementError.message);
  revalidatePath("/panel/hr", "layout"); // personel detayı (/panel/hr/[id]) da yenilensin
  revalidatePath("/panel/hr/[id]", "page");
  revalidatePath("/panel/crm");
}

async function updateEmployee__impl(formData:FormData){
  const {supabase,membership}=await hrContext();
  const employeeId=text(formData,"employee_id",80);
  const commissionRate=number(formData,"commission_rate");
  const operationCommissionRate=number(formData,"operation_commission_rate");
  if(commissionRate<0||commissionRate>100||operationCommissionRate<0||operationCommissionRate>100) throw new Error("Prim oranları 0 ile 100 arasında olmalıdır.");
  /*
    Personel no, işe giriş ve çalışma tipi 29.10.2026'dan beri düzenleme
    formunda da var. Değerler kısıtla sabit (hr_employees_employment_type_check);
    listede olmayan bir değer veritabanında İngilizce kısıt hatasıyla
    düşerdi, burada Türkçe reddediliyor. Boş tarih "silindi" demek.
  */
  const employmentType=text(formData,"employment_type",30)||"full_time";
  if(!CALISMA_TIPLERI.includes(employmentType)) throw new Error("Çalışma tipi tanınmadı.");
  const employmentStatus=text(formData,"employment_status",30)||"active";
  if(!CALISMA_DURUMLARI.includes(employmentStatus)) throw new Error("Durum tanınmadı.");
  const startDate=text(formData,"start_date",20);
  if(startDate&&!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) throw new Error("İşe giriş tarihi geçersiz.");
  const {data,error}=await supabase.from("hr_employees").update({
    full_name:text(formData,"full_name",180),
    employee_no:text(formData,"employee_no",50)||null,
    start_date:startDate||null,
    employment_type:employmentType,
    email:text(formData,"email",240)||null,
    phone:text(formData,"phone",80)||null,
    job_title:text(formData,"job_title",160)||null,
    department_id:text(formData,"department_id",80)||null,
    employment_status:employmentStatus,
    can_receive_sales_requests:formData.get("can_receive_sales_requests")==="on",
    commission_rate:commissionRate,
    operation_commission_rate:operationCommissionRate,
    updated_at:new Date().toISOString(),
  }).eq("id",employeeId).eq("organization_id",membership.organization_id).select("id").maybeSingle();
  if(error) throw new Error("Personel güncellenemedi: "+error.message);
  if(!data) throw new Error("Personel bulunamadı.");
  revalidatePath("/panel/hr", "layout"); // personel detayı (/panel/hr/[id]) da yenilensin
  revalidatePath("/panel/crm");
}

// Hata mesajlarını kullanıcıya ulaştıran sarmalayıcılar (lib/panel-action.ts).
export async function createDepartment(...args: Parameters<typeof createDepartment__impl>) {
  return runPanelAction(() => createDepartment__impl(...args), "Departman oluşturuldu");
}
export async function updateDepartment(...args: Parameters<typeof updateDepartment__impl>) {
  return runPanelAction(() => updateDepartment__impl(...args), "Departman güncellendi");
}
export async function deleteDepartment(...args: Parameters<typeof deleteDepartment__impl>) {
  return runPanelAction(() => deleteDepartment__impl(...args), "Departman silindi");
}
export async function createEmployee(...args: Parameters<typeof createEmployee__impl>) {
  return runPanelAction(() => createEmployee__impl(...args), "Personel eklendi");
}
export async function updateEmployee(...args: Parameters<typeof updateEmployee__impl>) {
  return runPanelAction(() => updateEmployee__impl(...args), "Personel bilgileri güncellendi");
}

/*
  YANLIŞ AÇILAN PERSONELİ SİLME (2026-10).

  Yalnızca HİÇBİR İZİ OLMAYAN kayıt silinir. hr_employees silinince
  veritabanı şunları KASKATLA götürüyor: randevular, özlük belgeleri,
  gizlilik sözleşmeleri, satış primi tahakkukları, izin talepleri, oran
  geçmişi; şunları sahipsiz bırakıyor: atanmış talepler, işler, adımlar,
  oturum kayıtları. Prim ödemesi ve operasyon primi ise silmeyi
  reddediyor. Engel bu yüzeyin tamamına bakıyor (AGENTS.md "Silme engeli,
  kaskat yüzeyi kadar geniş olmalı"); yalnızca personel eklenirken
  kendiliğinden hazırlanan İMZALANMAMIŞ gizlilik sözleşmesi ve oran
  geçmişi engel sayılmıyor — onlar kaydın kendisinin parçası.

  Panel hesabı olan personel silinmez: oturum geçmişi, yazdığı yorumlar
  ve kayıt izleri o hesaba bağlı. Doğru yol erişimi kapatmak ve durumu
  "İşten ayrıldı" yapmak. Bekleyen davet de engel: önce iptal edilmeli,
  yoksa davet kabul edilince kaydı olmayan bir üye doğar.

  Engelin sorguları hata yutmaz: okunamayan bir engel "engel yok" demek
  değil (AGENTS.md).
*/
async function personelSil__impl(formData: FormData) {
  const { supabase, membership } = await hrContext();
  const org = membership.organization_id;
  const id = text(formData, "employee_id", 80);
  if (!id) throw new Error("Personel seçilmedi.");

  const { data: personel, error: personelHatasi } = await supabase.from("hr_employees")
    .select("id,full_name,user_id,email").eq("id", id).eq("organization_id", org).maybeSingle();
  if (personelHatasi) throw new Error("Personel okunamadı: " + personelHatasi.message);
  if (!personel) throw new Error("Personel bulunamadı veya erişiminiz yok.");
  if (personel.user_id) throw new Error("Panel hesabı olan personel silinmez: oturum ve kayıt geçmişi bu hesaba bağlı. Erişimini kapatıp durumunu \"İşten ayrıldı\" yapın.");

  const say = (tablo: string, sutun: string, durum?: string) => {
    const sorgu = supabase.from(tablo).select("id", { count: "exact", head: true }).eq("organization_id", org).eq(sutun, id);
    return durum ? sorgu.eq("status", durum) : sorgu;
  };
  const kontroller: [string, PromiseLike<{ count: number | null; error: { message: string } | null }>][] = [
    ["atanmış talep", say("crm_opportunities", "assigned_employee_id")],
    ["atanmış iş", say("operation_workflows", "assigned_employee_id")],
    /* EK SORUMLU DA ENGEL (24.10.2026). `operation_workflow_assignees`
       22.10.2026'da eklendi ama silme engeline girmemişti; bağ
       ON DELETE CASCADE, yani ek sorumlu olarak atanmış personeli
       silmek o atamaları SESSİZCE götürüyordu — iş o kişiyi
       kaybediyor, kimse haberdar olmuyor. Döküm yenilenince
       tests/unit/personel-silme.test.ts yakaladı. */
    ["ek sorumlu olduğu iş", say("operation_workflow_assignees", "employee_id")],
    ["atanmış iş adımı", say("operation_steps", "assigned_employee_id")],
    ["randevu", say("crm_appointments", "employee_id")],
    ["özlük belgesi", say("hr_employee_documents", "employee_id")],
    ["imzalı gizlilik sözleşmesi", say("hr_confidentiality_agreements", "employee_id", "signed")],
    ["satış primi", say("hr_sales_commissions", "employee_id")],
    ["operasyon primi", say("hr_operation_commissions", "employee_id")],
    ["prim ödemesi", say("hr_commission_payments", "employee_id")],
    ["izin talebi", say("hr_leave_requests", "employee_id")],
    ["oturum kaydı", say("user_session_logs", "employee_id")],
  ];
  const sonuclar = await Promise.all(kontroller.map(([, sorgu]) => sorgu));
  const bagli: string[] = [];
  sonuclar.forEach((sonuc, sira) => {
    if (sonuc.error) throw new Error(`Silme engeli denetlenemedi (${kontroller[sira][0]}): ${sonuc.error.message}`);
    if (sonuc.count) bagli.push(`${sonuc.count} ${kontroller[sira][0]}`);
  });
  if (bagli.length) throw new Error(`Bu personelin kayıtları var (${bagli.join(", ")}); silinemez. Durumunu "İşten ayrıldı" yapın.`);

  if (personel.email) {
    const { data: davetler, error: davetHatasi } = await supabase.from("organization_invitations")
      .select("email").eq("organization_id", org).in("status", ["pending", "sent"]);
    if (davetHatasi) throw new Error("Davetler okunamadı: " + davetHatasi.message);
    if ((davetler ?? []).some((d) => String(d.email).toLowerCase() === String(personel.email).toLowerCase()))
      throw new Error("Bu personele gönderilmiş bekleyen bir davet var; önce daveti iptal edin.");
  }

  const { data: silinen, error } = await supabase.from("hr_employees").delete().eq("id", id).eq("organization_id", org).select("id");
  if (error) throw new Error("Personel silinemedi: " + error.message);
  // RLS satırı sessizce elerse "sildim ama silinmedi" kalmasın.
  if (!silinen?.length) throw new Error("Personel silinemedi: bu işlem için yetkiniz yok.");
  revalidatePath("/panel/hr", "layout");
  redirect("/panel/hr");
}

export async function personelSil(...args: Parameters<typeof personelSil__impl>) {
  return runPanelAction(() => personelSil__impl(...args), "Personel kaydı silindi");
}
