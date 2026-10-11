/*
  E-POSTADAN AUTH KULLANICI KİMLİĞİ.

  Davet edilen e-posta zaten kayıtlıysa (başka bir kurumda çalışıyor ya
  da eskiden davet edilmiş), invite-team-member kişiyi bu kuruma
  bağlamak için kimliğini bulmak zorunda. Eski yol
  `auth.admin.listUsers` ile 200'lük sayfalar hâlinde BÜTÜN PROJEYİ
  taramaktı ve 20 sayfada kesiliyordu: 4.000 kullanıcıdan sonrasında
  hesap bulunamıyor, davet "Bu e-posta zaten kayıtlı görünüyor ama
  kullanıcı bulunamadı" diye düşüyordu. Çok kiracılı bir projede o
  tablo bütün kurumların personelini taşıyor; sınır zamanla dolar ve
  belirti yanıltıcı olur. Yirmi API çağrısı da cabası.

  Silinmiş hesap sayılmıyor: deleted_at dolu bir satıra üyelik yazmak
  kimsenin giremediği bir kurum kaydı demekti.

  GÜVENLİK: security definer — auth.users yalnızca bu yolla okunuyor.
  Çağrı hakkı yalnızca service_role'da; e-postadan kimlik çözen bir
  işlevi tarayıcıya açmak, "bu adresin hesabı var mı" sorusunu herkese
  sormak olurdu.
*/

create or replace function public.arvo_auth_kullanici_id(p_email text)
returns uuid
language sql
stable
security definer
set search_path to ''
as $$
  select u.id
  from auth.users u
  where btrim(coalesce(p_email, '')) <> ''
    and lower(btrim(u.email)) = lower(btrim(p_email))
    and u.deleted_at is null
  order by u.created_at nulls last
  limit 1
$$;

revoke all on function public.arvo_auth_kullanici_id(text) from public, anon, authenticated;
grant execute on function public.arvo_auth_kullanici_id(text) to service_role;

notify pgrst, 'reload schema';
