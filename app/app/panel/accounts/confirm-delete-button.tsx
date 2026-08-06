"use client";

export function ConfirmDeleteButton({ label, confirmMessage }: { label: string; confirmMessage: string }) {
  return (
    <button
      className="panel-danger"
      type="submit"
      onClick={(event) => {
        if (!window.confirm(confirmMessage)) event.preventDefault();
      }}
    >
      {label}
    </button>
  );
}
