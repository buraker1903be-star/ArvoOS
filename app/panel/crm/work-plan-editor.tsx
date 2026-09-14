"use client";

import { useState } from "react";
import { WORK_PLAN_LIMIT, type WorkPlanItem } from "@/lib/work-plan";

type Row = { key: number; title: string; due_date: string };

/**
 * Ara teslim takvimi düzenleyicisi. Satırlar gizli alanda JSON olarak
 * gönderilir; boş satırlar atılır. Yarım doldurulmuş satırda (içerik var,
 * tarih yok ya da tersi) tarayıcı gönderimi durdurur.
 */
export function WorkPlanEditor({ initial, name = "work_plan", hint }: { initial: WorkPlanItem[]; name?: string; hint?: string }) {
  const [rows, setRows] = useState<Row[]>(() =>
    initial.length
      ? initial.map((item, index) => ({ key: index + 1, title: item.title, due_date: item.due_date }))
      : [{ key: 1, title: "", due_date: "" }],
  );
  const [nextKey, setNextKey] = useState(rows.length + 1);

  const update = (key: number, patch: Partial<Row>) => setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  const remove = (key: number) => setRows((current) => (current.length > 1 ? current.filter((row) => row.key !== key) : [{ key: nextKey, title: "", due_date: "" }]));
  const add = () => {
    setRows((current) => [...current, { key: nextKey, title: "", due_date: "" }]);
    setNextKey((key) => key + 1);
  };

  const payload = rows
    .filter((row) => row.title.trim() || row.due_date)
    .map((row) => ({ title: row.title.trim(), due_date: row.due_date }));

  return (
    <section className="wide custom-plan-editor work-plan-editor">
      <input type="hidden" name={name} value={JSON.stringify(payload)} />
      <div className="custom-plan-head">
        <small>ARA TESLİM TAKVİMİ</small>
        <span className="custom-plan-total ok">{payload.length ? `${payload.length} teslim` : "Teslim yok"}</span>
      </div>
      <div className="custom-plan-rows">
        {rows.map((row, index) => (
          <div className="work-plan-row" key={row.key}>
            <span className="custom-plan-index">{index + 1}</span>
            <input
              value={row.title}
              maxLength={200}
              minLength={2}
              required={Boolean(row.due_date)}
              placeholder="Teslim içeriği (ör. 1. bölüm taslağı)"
              aria-label={`${index + 1}. teslimin içeriği`}
              onChange={(event) => update(row.key, { title: event.target.value })}
            />
            <input
              type="date"
              value={row.due_date}
              required={Boolean(row.title.trim())}
              aria-label={`${index + 1}. teslimin tarihi`}
              onChange={(event) => update(row.key, { due_date: event.target.value })}
            />
            <button type="button" className="work-plan-remove" onClick={() => remove(row.key)} aria-label={`${index + 1}. teslimi sil`}>×</button>
          </div>
        ))}
      </div>
      <div className="work-plan-foot">
        <button type="button" className="panel-secondary" onClick={add} disabled={rows.length >= WORK_PLAN_LIMIT}>+ Teslim ekle</button>
        <p>{hint ?? "Teslimler tarihe göre sıralanır. Boş bıraktığınız satırlar kaydedilmez."}</p>
      </div>
    </section>
  );
}
