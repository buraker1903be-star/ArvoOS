-- ============================================================
-- WhatsApp: okunma damgası
--
-- Listede "Yanıt bekliyor" diye yeşil bir nokta vardı ama bu okunmamışlık
-- DEĞİLDİ — yalnızca son mesajın müşteriden geldiğini gösteriyordu.
-- Satışçı sohbeti açıp okuduktan sonra da nokta orada duruyor; yani
-- "bakılacak sohbet" ile "bakılmış sohbet" hiç ayrılmıyordu. Elli sohbette
-- işareti olan her satıra yeniden bakmak gerekiyordu.
--
-- Damga sohbet düzeyinde ve KURUM düzeyinde, kişi düzeyinde değil: aynı
-- müşteriyle aynı ekipten iki kişi ilgileniyor ve biri okuduğunda
-- diğerinin de "bakıldı" görmesi doğru. Kişiye özel okunmamışlık,
-- satışçının meslektaşının yanıtladığı sohbeti tekrar açmasına yol açardı.
--
-- Tablo yeni değil: arşiv damgasıyla aynı satırda duruyor
-- (whatsapp_conversation_state), çünkü ikisi de aynı şeyin durumu.
-- ============================================================

alter table public.whatsapp_conversation_state
  add column if not exists last_read_at timestamptz,
  -- Kim okudu: yazışmayı kimin devraldığı sorusunun yanıtı. Kullanıcı
  -- silindiğinde damga kalsın (okunmuşluk kişiye değil kuruma ait).
  add column if not exists last_read_by uuid references auth.users(id) on delete set null;

comment on column public.whatsapp_conversation_state.last_read_at is
  'Sohbetin kurum adına en son okunduğu an; bundan sonraki gelen mesajlar okunmamış sayılır.';

notify pgrst, 'reload schema';
