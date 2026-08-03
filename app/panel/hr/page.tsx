import {getPanelContext} from "@/lib/panel-context";
import {PanelDrawer} from "../components/panel-drawer";
import {createDepartment,createEmployee,updateEmployee} from "./actions";
import "./hr.css";

type Department={id:string;name:string;code:string|null;is_active:boolean};
type Employee={id:string;user_id:string|null;department_id:string|null;employee_no:string|null;full_name:string;job_title:string|null;email:string|null;phone:string|null;employment_type:string;employment_status:string;start_date:string|null;can_receive_sales_requests:boolean};

const initials=(name:string)=>name.split(/\s+/).filter(Boolean).slice(0,2).map((part)=>part[0]).join("").toLocaleUpperCase("tr-TR");
const statusNames:Record<string,string>={active:"Aktif",on_leave:"İzinli",inactive:"Pasif",terminated:"İşten ayrıldı"};

export default async function HrPage(){
  const {supabase,membership,modules}=await getPanelContext();
  if(!modules.some((module)=>module.code==="hr")) throw new Error("İnsan Kaynakları modülüne erişiminiz yok.");
  const [{data:employeeData,error:employeeError},{data:departmentData,error:departmentError}]=await Promise.all([
    supabase.from("hr_employees").select("id,user_id,department_id,employee_no,full_name,job_title,email,phone,employment_type,employment_status,start_date,can_receive_sales_requests").eq("organization_id",membership.organization_id).order("full_name"),
    supabase.from("hr_departments").select("id,name,code,is_active").eq("organization_id",membership.organization_id).order("name"),
  ]);
  if(employeeError) throw new Error("Personeller okunamadı: "+employeeError.message);
  if(departmentError) throw new Error("Departmanlar okunamadı: "+departmentError.message);
  const employees=(employeeData??[]) as Employee[];
  const departments=(departmentData??[]) as Department[];
  const departmentMap=new Map(departments.map((item)=>[item.id,item.name]));
  const activeCount=employees.filter((item)=>item.employment_status==="active").length;
  const salesCount=employees.filter((item)=>item.employment_status==="active"&&item.can_receive_sales_requests).length;
  const leaveCount=employees.filter((item)=>item.employment_status==="on_leave").length;

  const employeeForm=<form className="panel-form" action={createEmployee}>
    <label className="wide">Ad soyad<input name="full_name" required minLength={2}/></label>
    <label>Personel numarası<input name="employee_no"/></label>
    <label>Pozisyon<input name="job_title"/></label>
    <label>Departman<select name="department_id" defaultValue=""><option value="">Departman seçin</option>{departments.filter((item)=>item.is_active).map((item)=><option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
    <label>Çalışma tipi<select name="employment_type" defaultValue="full_time"><option value="full_time">Tam zamanlı</option><option value="part_time">Yarı zamanlı</option><option value="contractor">Sözleşmeli</option><option value="intern">Stajyer</option></select></label>
    <label>E-posta<input name="email" type="email"/></label><label>Telefon<input name="phone"/></label>
    <label>İşe giriş tarihi<input name="start_date" type="date"/></label>
    <label className="wide"><span>Satış yetkisi</span><span><input name="can_receive_sales_requests" type="checkbox"/> Satış talepleri atanabilir</span></label>
    <div className="wide panel-form-actions"><button className="panel-primary" type="submit">Personeli Kaydet</button></div>
  </form>;

  return <div className="hr-page">
    <div className="panel-pagehead"><div><small className="panel-kicker">İNSAN KAYNAKLARI</small><h1>Personel Merkezi</h1><p>Personelleri, departmanları ve CRM atama yetkilerini tek merkezden yönetin.</p></div><div className="panel-page-actions"><PanelDrawer triggerLabel="+ Yeni Personel" title="Yeni Personel" description="Personel ve görev bilgilerini kaydedin.">{employeeForm}</PanelDrawer></div></div>
    <section className="hr-metrics"><article><small>TOPLAM PERSONEL</small><strong>{employees.length}</strong><span>Tüm personel kayıtları</span></article><article><small>AKTİF PERSONEL</small><strong>{activeCount}</strong><span>Çalışmaya devam eden</span></article><article><small>SATIŞ TEMSİLCİSİ</small><strong>{salesCount}</strong><span>Talep atanabilir personel</span></article><article><small>İZİNLİ</small><strong>{leaveCount}</strong><span>Şu anda izinli</span></article></section>
    <section className="hr-layout"><div className="panel-card"><div className="panel-card-head"><div><small>PERSONELLER</small><h2>Ekip Listesi</h2></div></div><div className="hr-employee-list">{employees.map((employee)=>{
      const edit=<form className="panel-form" action={updateEmployee}><input type="hidden" name="employee_id" value={employee.id}/><label className="wide">Ad soyad<input name="full_name" required defaultValue={employee.full_name}/></label><label>Pozisyon<input name="job_title" defaultValue={employee.job_title??""}/></label><label>Departman<select name="department_id" defaultValue={employee.department_id??""}><option value="">Departman seçin</option>{departments.map((item)=><option value={item.id} key={item.id}>{item.name}</option>)}</select></label><label>E-posta<input name="email" type="email" defaultValue={employee.email??""}/></label><label>Telefon<input name="phone" defaultValue={employee.phone??""}/></label><label>Durum<select name="employment_status" defaultValue={employee.employment_status}><option value="active">Aktif</option><option value="on_leave">İzinli</option><option value="inactive">Pasif</option><option value="terminated">İşten ayrıldı</option></select></label><label className="wide"><span><input name="can_receive_sales_requests" type="checkbox" defaultChecked={employee.can_receive_sales_requests}/> Satış talepleri atanabilir</span></label><div className="wide panel-form-actions"><button className="panel-primary">Kaydet</button></div></form>;
      return <article className="hr-employee-card" key={employee.id}><div className="hr-avatar">{initials(employee.full_name)}</div><div><h3>{employee.full_name}</h3><p>{employee.job_title||"Pozisyon belirtilmedi"}{employee.department_id?` · ${departmentMap.get(employee.department_id)??"Departman"}`:""}</p><div className="hr-tags"><span>{statusNames[employee.employment_status]??employee.employment_status}</span>{employee.can_receive_sales_requests?<span>Satış atanabilir</span>:null}{employee.user_id?<span>Panel kullanıcısı</span>:null}</div></div><PanelDrawer triggerLabel="Düzenle" title="Personeli Düzenle">{edit}</PanelDrawer></article>})}{!employees.length?<div className="hr-empty">Henüz personel kaydı yok.</div>:null}</div></div>
      <aside className="hr-side"><section className="panel-card"><div className="panel-card-head"><div><small>ORGANİZASYON</small><h2>Departmanlar</h2></div><PanelDrawer triggerLabel="+ Ekle" title="Yeni Departman"><form className="panel-form" action={createDepartment}><label className="wide">Departman adı<input name="name" required/></label><label className="wide">Kısa kod<input name="code" maxLength={30}/></label><div className="wide panel-form-actions"><button className="panel-primary">Departmanı Kaydet</button></div></form></PanelDrawer></div><div className="hr-department-list">{departments.map((department)=><div key={department.id}><b>{department.name}</b><span>{employees.filter((employee)=>employee.department_id===department.id).length} kişi</span></div>)}{!departments.length?<p>Henüz departman yok.</p>:null}</div></section></aside>
    </section>
  </div>;
}
