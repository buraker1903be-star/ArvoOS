// "Talepten tahsilata" sahnesinin 7 ekranı (yalnızca görsel, aria-hidden üst öğede).
import type { FlowCopy } from "../_content/flow-copy";

function Talep({ t }: { t: FlowCopy["s0"] }) {
  return (
    <>
      <div className="fx-row"><span className="fx-av">K</span><div><b>{t.customer}</b><small>{t.source}</small></div><span className="mo-pill" data-tone="info">{t.title}</span></div>
      <div className="fx-pipe">{t.stages.map((s, i) => <span key={s} data-on={i === 1 || undefined}>{s}</span>)}</div>
      <div className="fx-kv"><small>{t.history}</small><b>{t.historyVal}</b></div>
      <div className="fx-kv"><small>{t.rep}</small><b>{t.repVal}</b></div>
    </>
  );
}

function Teklif({ t }: { t: FlowCopy["s1"] }) {
  return (
    <>
      <p className="fx-h">{t.title}</p>
      {t.items.map(([a, b]) => <div key={a} className="fx-line"><span>{a}</span><b>{b}</b></div>)}
      <div className="fx-line fx-muted"><span>{t.vat}</span><b>{t.vatVal}</b></div>
      <div className="fx-line fx-total"><span>{t.total}</span><b>{t.totalVal}</b></div>
      <div className="fx-foot"><small>{t.plan}</small><span className="mo-pill" data-tone="success">{t.accepted}</span></div>
    </>
  );
}

function Imza({ t }: { t: FlowCopy["s2"] }) {
  return (
    <>
      <div className="fx-foot" style={{ marginTop: 0 }}><p className="fx-h">{t.title}</p><span className="mo-pill" data-tone="success">{t.signed}</span></div>
      <div className="fx-doc"><i /><i /><i style={{ width: "70%" }} /><i /><i style={{ width: "55%" }} /></div>
      {t.consent.map((c) => <div key={c} className="fx-check"><i />{c}</div>)}
      <svg className="fx-sign" viewBox="0 0 220 50" width="220" height="50"><path d="M6 36C20 6 32 8 34 30s22 18 34-4 26-16 32 6 18 12 28-6 20-8 24 8 20 6 32-10 18-6 22 4" fill="none" stroke="#0b1b2e" strokeWidth="2.2" strokeLinecap="round" /></svg>
      <small className="fx-meta">{t.meta}</small>
    </>
  );
}

function Akis({ t }: { t: FlowCopy["s3"] }) {
  return (
    <>
      <p className="fx-h">{t.title}</p>
      <div className="fx-gantt">
        {t.rows.map(([n, o, s, w]) => (
          <div key={n} className="fx-g"><span>{n}<small>{o}</small></span><i><b style={{ left: `${s}%`, width: `${w}%` }} /></i></div>
        ))}
      </div>
      <div className="fx-note"><span className="mo-dot" data-tone="success" />{t.started}</div>
    </>
  );
}

function Portal({ t }: { t: FlowCopy["s4"] }) {
  return (
    <>
      <div className="fx-foot" style={{ marginTop: 0 }}><p className="fx-h">{t.title}</p><small>{t.code}</small></div>
      <div className="fx-kv"><small>{t.progress}</small><b>64%</b></div>
      <div className="ph-bar" style={{ height: 7 }}><b style={{ width: "64%" }} /></div>
      <div className="fx-stages">{t.stages.map(([s, st]) => <div key={s} className="ph-stage" data-s={st}><i />{s}</div>)}</div>
      <div className="fx-msg"><p>{t.msg}</p><p className="me">{t.reply}</p></div>
    </>
  );
}

function Tahsilat({ t }: { t: FlowCopy["s5"] }) {
  return (
    <>
      <p className="fx-h">{t.title}</p>
      {t.rows.map(([a, b, tone]) => <div key={a} className="fx-line"><span>{a}</span><span className="mo-pill" data-tone={tone}>{b}</span></div>)}
      <div className="fx-foot"><span className="ph-lock"><i />{t.locked}</span><span className="ph-btn">{t.link}</span></div>
    </>
  );
}

function Rapor({ t }: { t: FlowCopy["s6"] }) {
  return (
    <>
      <p className="fx-h">{t.title}</p>
      <div className="fx-funnel">
        {t.funnel.map(([n, v], i) => <div key={n}><span>{n}</span><i><b style={{ width: `${v}%` }} data-weak={i === 1 || undefined} /></i></div>)}
      </div>
      <div className="fx-note"><span className="mo-dot" data-tone="gold" />{t.weakest}: {t.funnel[1][0]} → {t.funnel[2][0]}</div>
      <small className="fx-meta">{t.profit}</small>
      <div className="mo-bars" style={{ height: 64 }}>{t.months.map((h, i) => <i key={i} style={{ height: `${h}%` }} />)}</div>
    </>
  );
}

const SCREENS = [Talep, Teklif, Imza, Akis, Portal, Tahsilat, Rapor] as const;
const KEYS = ["s0", "s1", "s2", "s3", "s4", "s5", "s6"] as const;
export const FLOW_STATES = SCREENS.length;

export function FlowScreen({ index, copy }: { index: number; copy: FlowCopy }) {
  const Screen = SCREENS[index] as (p: { t: never }) => React.ReactElement;
  return <div className="fx-screen-in"><Screen t={copy[KEYS[index]] as never} /></div>;
}
