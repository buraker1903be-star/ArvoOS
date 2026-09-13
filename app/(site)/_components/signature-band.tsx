// İmza anı: koyu sahnede dev, soluk tipografik akış (dekoratif).
// Hareket yalnızca transform; azaltılmış harekette durur.
import { HeroBackdrop } from "./ui";

export function SignatureBand({ words, caption }: { words: string[]; caption?: string }) {
  const row = [...words, ...words];
  const rev = [...words.slice().reverse(), ...words.slice().reverse()];
  return (
    <section className="band-mq scene-dark">
      <HeroBackdrop />
      <div aria-hidden="true">
        <div className="mq">{row.map((w, i) => <span key={`a${i}`}>{w}</span>)}</div>
        <div className="mq">{rev.map((w, i) => <span key={`b${i}`}>{w}</span>)}</div>
      </div>
      {caption ? <p className="band-caption wrap">{caption}</p> : null}
    </section>
  );
}
