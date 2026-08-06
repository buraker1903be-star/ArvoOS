-- Genel Bakış'taki "Yeni hareket" formunda gerçek bir cari seçilebilmesi
-- ve seçilince Cari Hesaplar bakiyesinin de otomatik güncellenmesi için
-- finance_transactions kaydını ilgili account_parties kartına bağlıyoruz.

alter table public.finance_transactions
  add column if not exists party_id uuid references public.account_parties(id) on delete set null;

create index if not exists finance_transactions_party_idx
  on public.finance_transactions (party_id);
