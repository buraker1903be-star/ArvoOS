import assert from "node:assert/strict";
import test from "node:test";
import {
  buildRows,
  channelTitle,
  dayKey,
  fileSize,
  initialsOf,
  lastSeenLabel,
  listTime,
  lower,
  otherUserId,
  type Row,
} from "@/app/panel/messages/message-format";
import type { Channel, Message, Person } from "@/app/panel/messages/messages-shared";

const mesaj = (id: string, sender: string, at: string): Message => ({
  id,
  channel_id: "c1",
  sender_id: sender,
  body: id,
  created_at: at,
  edited_at: null,
  deleted_at: null,
  attachment_path: null,
  attachment_name: null,
  attachment_mime: null,
  attachment_size: null,
});

const gunler = (rows: Row[]) => rows.filter((row) => row.kind === "day");
const balonlar = (rows: Row[]) => rows.filter((row) => row.kind === "message") as Extract<Row, { kind: "message" }>[];

test("gün anahtarı Türkiye saatine göre", () => {
  // Gece 00:30 UTC Türkiye'de ertesi gün değil, aynı gündür (UTC+3).
  assert.equal(dayKey("2026-03-01T00:30:00Z"), "2026-03-01");
  assert.equal(dayKey("2026-02-28T22:30:00Z"), "2026-03-01");
});

test("her yeni gün için tek ayraç eklenir", () => {
  const rows = buildRows([
    mesaj("m1", "a", "2026-03-01T09:00:00+03:00"),
    mesaj("m2", "a", "2026-03-01T09:01:00+03:00"),
    mesaj("m3", "a", "2026-03-02T09:00:00+03:00"),
  ]);
  assert.equal(gunler(rows).length, 2);
  assert.equal(balonlar(rows).length, 3);
});

test("aynı kişinin 5 dakika içindeki mesajları tek balon grubu olur", () => {
  const rows = balonlar(buildRows([
    mesaj("m1", "a", "2026-03-01T09:00:00+03:00"),
    mesaj("m2", "a", "2026-03-01T09:02:00+03:00"),
    mesaj("m3", "a", "2026-03-01T09:03:00+03:00"),
  ]));
  assert.deepEqual(rows.map((row) => [row.first, row.last]), [[true, false], [false, false], [false, true]]);
});

test("5 dakikayı aşan boşluk grubu böler", () => {
  const rows = balonlar(buildRows([
    mesaj("m1", "a", "2026-03-01T09:00:00+03:00"),
    mesaj("m2", "a", "2026-03-01T09:06:00+03:00"),
  ]));
  assert.deepEqual(rows.map((row) => [row.first, row.last]), [[true, true], [true, true]]);
});

test("gönderen değişince grup biter", () => {
  const rows = balonlar(buildRows([
    mesaj("m1", "a", "2026-03-01T09:00:00+03:00"),
    mesaj("m2", "b", "2026-03-01T09:01:00+03:00"),
  ]));
  assert.deepEqual(rows.map((row) => [row.first, row.last]), [[true, true], [true, true]]);
});

test("gün değişince grup devam etmez", () => {
  // Gece yarısını aşan iki mesaj dakikalar arayla olsa da ayrı gruptur.
  const rows = balonlar(buildRows([
    mesaj("m1", "a", "2026-03-01T23:59:00+03:00"),
    mesaj("m2", "a", "2026-03-02T00:01:00+03:00"),
  ]));
  assert.deepEqual(rows.map((row) => [row.first, row.last]), [[true, true], [true, true]]);
});

test("boş liste boş sonuç verir", () => {
  assert.deepEqual(buildRows([]), []);
});

test("baş harfler en fazla iki, Türkçe büyütmeyle", () => {
  assert.equal(initialsOf("Burak Erdoğan"), "BE");
  assert.equal(initialsOf("ilker yıldız"), "İY", "i → İ (Türkçe)");
  assert.equal(initialsOf("Ayşe Fatma Zehra"), "AF");
  assert.equal(initialsOf(""), "?");
});

test("Türkçe küçültme", () => {
  assert.equal(lower("İSTANBUL"), "istanbul");
  assert.equal(lower("IŞIK"), "ışık");
});

test("dosya boyutu", () => {
  assert.equal(fileSize(null), "");
  assert.equal(fileSize(0), "");
  assert.equal(fileSize(1), "1 KB", "1 baytlık dosya 0 KB görünmez");
  assert.equal(fileSize(2048), "2 KB");
  assert.equal(fileSize(1048576), "1.0 MB");
});

test("son görülme etiketi", () => {
  assert.equal(lastSeenLabel(null), "Çevrimdışı");
  assert.equal(lastSeenLabel(new Date().toISOString()), "Çevrimiçi");
  const dun = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  assert.match(lastSeenLabel(dun), /Son görülme/);
});

test("liste saati: bugün saat, dün 'Dün'", () => {
  assert.equal(listTime(null), "");
  assert.match(listTime(new Date().toISOString()), /^\d{2}:\d{2}$/);
  assert.equal(listTime(new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()), "Dün");
});

const kisi = (userId: string, name: string): Person => ({ userId, name, jobTitle: null, lastSeenAt: null });
const kanal = (over: Partial<Channel>): Channel => ({
  id: "c1", name: "", channelType: "direct", directKey: null, isPrivate: false,
  createdBy: null, lastMessageAt: null, lastMessagePreview: null, lastMessageSender: null,
  ...over,
});

test("birebir sohbette karşı tarafın kimliği ve adı", () => {
  const channel = kanal({ directKey: "u1:u2" });
  const people = new Map<string, Person>([["u2", kisi("u2", "Ayşe Yılmaz")]]);
  assert.equal(otherUserId(channel, "u1"), "u2");
  assert.equal(otherUserId(channel, "u2"), "u1", "iki yönde de çalışır");
  assert.equal(channelTitle(channel, "u1", people), "Ayşe Yılmaz");
});

test("karşı taraf kişi listesinde yoksa genel ad gösterilir", () => {
  const channel = kanal({ directKey: "u1:u9" });
  assert.equal(channelTitle(channel, "u1", new Map()), "Ekip üyesi");
});

test("grup sohbetinde kanal adı kullanılır", () => {
  const channel = kanal({ channelType: "group", name: "Satış Ekibi", directKey: null });
  assert.equal(channelTitle(channel, "u1", new Map()), "Satış Ekibi");
  assert.equal(otherUserId(channel, "u1"), null);
});
