"use client";

export function OpenNewRequestButton() {
  function openForm() {
    const panel = document.getElementById("new-request-panel") as HTMLDetailsElement | null;
    if (!panel) return;
    panel.open = true;
    panel.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <button className="panel-primary" type="button" onClick={openForm}>
      + Yeni talep
    </button>
  );
}
