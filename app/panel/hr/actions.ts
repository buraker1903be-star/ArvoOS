"use server";

import { revalidatePath } from "next/cache";
import { getPanelContext } from "@/lib/panel-context";

const text=(formData:FormData,key:string,max=300)=>String(formData.get(key)??"").trim().slice(0,max);
const number=(formData:FormData,key:string)=>Number(String(formData.get(key)??"0").replace(",","."))||0;

async function hrContext(){
  const context=await getPanelContext();
  if(!context.modules.some((module)=>module.code==="hr")) throw new Error("İnsan Kaynakları modülüne erişiminiz yok.");
  return context;
}

export async function createDepartment(formData:FormData){
  const {supabase,membership}=await hrContext();
  const name=text(formData,"name",120);
  if(name.length<2) throw new Error("Departman adı en az 2 karakter olmalıdır.");
  const {error}=await supabase.from("hr_departments").insert({organization_id:membership.organization_id,name,code:text(formData,"code",30)||null});
  if(error) throw new Error("Departman oluşturulamadı: "+error.message);
  revalidatePath("/panel/hr");
}

export async function createEmployee(formData:FormData){
  const {supabase,membership,userId}=await hrContext();
  const fullName=text(formData,"full_name",180);
  const commissionRate=number(formData,"commission_rate");
  if(fullName.length<2) throw new Error("Personel adı en az 2 karakter olmalıdır.");
  if(commissionRate<0||commissionRate>100) throw new Error("Prim oranı 0 ile 100 arasında olmalıdır.");
  const {error}=await supabase.from("hr_employees").insert({
    organization_id:membership.organization_id,
    full_name:fullName,
    email:text(formData,"email",240)||null,
    phone:text(formData,"phone",80)||null,
    job_title:text(formData,"job_title",160)||null,
    department_id:text(formData,"department_id",80)||null,
    employee_no:text(formData,"employee_no",50)||null,
    start_date:text(formData,"start_date",20)||null,
    employment_type:text(formData,"employment_type",30)||"full_time",
    employment_status:"active",
    can_receive_sales_requests:formData.get("can_receive_sales_requests")==="on",
    commission_rate:commissionRate,
    created_by:userId,
  });
  if(error) throw new Error("Personel oluşturulamadı: "+error.message);
  revalidatePath("/panel/hr");
  revalidatePath("/panel/crm");
}

export async function updateEmployee(formData:FormData){
  const {supabase,membership}=await hrContext();
  const employeeId=text(formData,"employee_id",80);
  const commissionRate=number(formData,"commission_rate");
  if(commissionRate<0||commissionRate>100) throw new Error("Prim oranı 0 ile 100 arasında olmalıdır.");
  const {data,error}=await supabase.from("hr_employees").update({
    full_name:text(formData,"full_name",180),
    email:text(formData,"email",240)||null,
    phone:text(formData,"phone",80)||null,
    job_title:text(formData,"job_title",160)||null,
    department_id:text(formData,"department_id",80)||null,
    employment_status:text(formData,"employment_status",30)||"active",
    can_receive_sales_requests:formData.get("can_receive_sales_requests")==="on",
    commission_rate:commissionRate,
    updated_at:new Date().toISOString(),
  }).eq("id",employeeId).eq("organization_id",membership.organization_id).select("id").maybeSingle();
  if(error) throw new Error("Personel güncellenemedi: "+error.message);
  if(!data) throw new Error("Personel bulunamadı.");
  revalidatePath("/panel/hr");
  revalidatePath("/panel/crm");
}
