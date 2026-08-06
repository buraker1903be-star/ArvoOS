export default function PanelLoading() {
  return (
    <div className="panel-skeleton" aria-hidden="true">
      <div className="skel skel-kicker" />
      <div className="skel skel-title" />
      <div className="skel skel-sub" />
      <div className="panel-skeleton-metrics">
        <div className="skel skel-card" />
        <div className="skel skel-card" />
        <div className="skel skel-card" />
        <div className="skel skel-card" />
      </div>
      <div className="skel skel-block" />
      <div className="skel skel-block" />
    </div>
  );
}
