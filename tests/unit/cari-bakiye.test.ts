import assert from "node:assert/strict";
import test from "node:test";
import { buildAccountBalances } from "@/app/panel/finance/account-balances";

/*
  CARİ BAKİYE KURALI.

  Üç ekran aynı kuralla hesaplıyor (Finans cari sekmesi, finans genel
  bakış, müşteri detayı) ama kuralın kendisi testsizdi. Para hesabı:
  yanlış bir bakiye, müşteriden fazla ya da eksik tahsilat demek.

  Kural (account-balances.ts): carinin imzalı sözleşmesi varsa borç =
  sözleşme toplamı + "Ek hizmet ·" kayıtları; yoksa defterdeki borç
  kayıtları (düzeltmeler hariç). Tahsilat borç + iadeyi aşamaz, bakiye
  eksiye düşmez.
*/

const hareket = (
  entry_type: string,
  amount: number,
  { source_type = "manual", description = "", transaction_date = "2026-10-01" } = {},
) => ({ entry_type, amount, source_type, description, transaction_date });

const cari = (id: string, hareketler: ReturnType<typeof hareket>[]) => ({ id, account_entries: hareketler });

test("sözleşmesi olan caride borç sözleşmeden gelir, defterden değil", () => {
  /* Sözleşme imzalanınca deftere de borç kaydı düşüyor; ikisini
     toplamak borcu iki katına çıkarırdı. */
  const { accounts } = buildAccountBalances(
    [cari("c1", [hareket("debit", 100_000, { source_type: "contract" })])],
    [{ party_id: "c1", amount: 100_000 }],
  );
  assert.equal(accounts[0].debt, 100_000);
});

test("ek hizmet sözleşme borcunun ÜSTÜNE ekleniyor", () => {
  /* Sözleşme sonrası satılan ek hizmet deftere elle yazılıyor ve
     sözleşmede görünmüyor; eklenmezse müşteriden eksik tahsilat. */
  const { accounts } = buildAccountBalances(
    [cari("c1", [
      hareket("debit", 100_000, { source_type: "contract" }),
      hareket("debit", 25_000, { source_type: "manual", description: "Ek hizmet · İntihal raporu" }),
      hareket("debit", 9_000, { source_type: "manual", description: "Başka bir kalem" }),
    ])],
    [{ party_id: "c1", amount: 100_000 }],
  );
  // 9.000'lik kalem "Ek hizmet ·" ile başlamıyor: sözleşmeli caride sayılmıyor.
  assert.equal(accounts[0].debt, 125_000);
});

test("sözleşmesi olmayan caride borç defterden, düzeltmeler hariç", () => {
  const { accounts } = buildAccountBalances(
    [cari("c1", [
      hareket("debit", 40_000),
      hareket("debit", 5_000, { source_type: "adjustment" }),
    ])],
    [],
  );
  assert.equal(accounts[0].debt, 40_000);
  // Düzeltme kaydı iade sayılıyor; borca değil iadeye giriyor.
  assert.equal(accounts[0].refunds, 5_000);
});

test("tahsilat borç + iadeyi aşamıyor", () => {
  /* Fazla kaydedilmiş bir tahsilat (çift giriş) bakiyeyi eksiye
     düşürüp "kurum müşteriye borçlu" gibi gösterirdi. */
  const { accounts } = buildAccountBalances(
    [cari("c1", [
      hareket("debit", 50_000),
      hareket("credit", 80_000),
    ])],
    [],
  );
  assert.equal(accounts[0].collections, 50_000);
  assert.equal(accounts[0].balance, 0);
});

test("iade borcu artırıyor, bakiye eksiye düşmüyor", () => {
  const { accounts } = buildAccountBalances(
    [cari("c1", [
      hareket("debit", 50_000),
      hareket("credit", 50_000),
      hareket("debit", 10_000, { source_type: "adjustment" }),
    ])],
    [],
  );
  // Borç 50.000, iade 10.000, tahsilat 50.000 → kalan 10.000.
  assert.equal(accounts[0].balance, 10_000);
});

test("toplamlar bütün carilerden", () => {
  const { totals } = buildAccountBalances(
    [
      cari("c1", [hareket("debit", 30_000), hareket("credit", 10_000)]),
      cari("c2", [hareket("debit", 20_000)]),
    ],
    [],
  );
  assert.deepEqual(totals, { debt: 50_000, collections: 10_000, refunds: 0, balance: 40_000 });
});

test("hareketler yeniden eskiye sıralanıyor", () => {
  /* Ekranda "son hareket" en üstte görünüyor; sıralama kuralın
     parçası, çağıranın yeniden sıralamasına bırakılmıyor. */
  const { accounts } = buildAccountBalances(
    [cari("c1", [
      hareket("debit", 1_000, { transaction_date: "2026-01-05" }),
      hareket("credit", 500, { transaction_date: "2026-03-10" }),
    ])],
    [],
  );
  assert.deepEqual(accounts[0].entries.map((e) => e.transaction_date), ["2026-03-10", "2026-01-05"]);
});

test("hareketi olmayan cari sıfır bakiyeyle geliyor", () => {
  // Yeni açılan cari listede görünmeli; hesaplama onu düşürmemeli.
  const { accounts } = buildAccountBalances([{ id: "c1", account_entries: null }], []);
  assert.equal(accounts.length, 1);
  assert.equal(accounts[0].balance, 0);
});
