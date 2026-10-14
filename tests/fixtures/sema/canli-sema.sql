-- Örnek döküm: denetim izinli DEĞERLERİ buradan okuyor (katalog yalnızca
-- adları taşıyor). Gerçek dökümün ilgili satırıyla aynı biçimde.
alter table public.oturum_kayitlari add constraint oturum_kayitlari_sonuc_check CHECK ((sonuc = ANY (ARRAY['basarili'::text, 'basarisiz'::text])));
