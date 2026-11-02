import assert from "node:assert/strict";
import test from "node:test";
import { izYazisi, migrationIzleri } from "@/lib/migration-izleri";

test("tablo, sütun, işlev ve tetikleyici izleri çıkar", () => {
  const izler = migrationIzleri(`
    create table if not exists public.yeni (id uuid primary key);
    alter table public.platform_proformalari
      add column if not exists otomatik boolean not null default false,
      add column donem_sonu date;
    create or replace function private.koruma() returns trigger language plpgsql as $function$
    begin
      -- gövdedeki metin iz değil:
      create table sahte (x int);
      return new;
    end;
    $function$;
    drop trigger if exists koruma on public.yeni;
    create trigger koruma before delete on public.yeni for each row execute function private.koruma();
  `);
  assert.deepEqual(izler, [
    { tur: "tablo", ad: "public.yeni" },
    { tur: "islev", ad: "private.koruma" },
    { tur: "tetikleyici", ad: "koruma", tablo: "public.yeni" },
    { tur: "sutun", tablo: "public.platform_proformalari", sutun: "otomatik" },
    { tur: "sutun", tablo: "public.platform_proformalari", sutun: "donem_sonu" },
  ]);
});

test("yorumdaki metin iz değil; şemasız ad public sayılır", () => {
  const izler = migrationIzleri(`
    /* create table public.yorumda (x int); */
    -- alter table public.x add column y int;
    create table hr_maaslar (id int);
  `);
  assert.deepEqual(izler, [{ tur: "tablo", ad: "public.hr_maaslar" }]);
});

test("kısıt ve politika değişikliği iz bırakmaz", () => {
  assert.deepEqual(migrationIzleri(`
    alter table public.x drop constraint if exists x_check;
    alter table public.x add constraint x_check check (true);
    create policy "p" on public.x for select using (true);
  `), []);
});

test("izin okunur yazısı", () => {
  assert.equal(izYazisi({ tur: "sutun", tablo: "public.t", sutun: "s" }), "sütun public.t.s");
  assert.equal(izYazisi({ tur: "tetikleyici", ad: "k", tablo: "public.t" }), "tetikleyici k (public.t)");
});
