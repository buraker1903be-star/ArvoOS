-- organization_invitations.role sütunu, sabit bir enum tipi (membership_role)
-- kullanıyor. "Operasyoncu" rolünü uygulama kodunda (Next.js + Edge
-- Function) eklemiştik, ama bu veritabanı enum'una hiç eklenmemişti —
-- bu yüzden davet kaydı oluşturulurken veritabanı reddediyordu.

alter type public.membership_role add value if not exists 'operasyoncu';
