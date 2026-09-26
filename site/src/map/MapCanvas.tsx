// owner: M1 replaces this placeholder with MapLibre init, the basemap theme, and the level machine (SPEC.md 9.7, 3.3).
// Contract: render the full-bleed container with data-testid="map-container" and call useMap().registerMap(map).

export function MapCanvas() {
  return (
    <div
      data-testid="map-container"
      className="absolute inset-0 bg-bg-0 bg-[radial-gradient(ellipse_at_50%_45%,var(--bg-1),var(--bg-0)_70%)]"
    >
      <div className="absolute inset-0 grid place-items-center">
        <span className="text-caption text-text-3">Map · M1 · SPEC 3.3, 9.7</span>
      </div>
    </div>
  );
}
