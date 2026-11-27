-- DOÇENTLİK: SAHİPSİZ BELGE NESNELERİNİN TESPİTİ (salt okunur, F6 PR7).
-- Tarayıcı yükleme ile kayıt arasında kapanırsa nesne kovada kalır (kimse okuyamaz,
-- ama kişisel veri taşıyan PDF depoda durur). Bu sorgu SİLMEZ; önerilen temizlik işinin
-- seçim adımıdır: kayıtta (faaliyet.belge_yolu / üak.depo_yolu) adı geçmeyen ve :esik
-- süresinden eski nesneler. Eşik, devam eden bir yüklemeyi silmemek için (öneri: 24 saat).
select o.name, o.created_at
from storage.objects o
where o.bucket_id = 'docentlik-belgeleri'
  and o.created_at < now() - interval :esik
  and not exists (select 1 from public.docentlik_faaliyetleri f where f.belge_yolu = o.name)
  and not exists (select 1 from public.docentlik_uak_tablolari u where u.depo_yolu = o.name)
order by o.created_at;
