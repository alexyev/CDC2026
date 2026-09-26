import { Placeholder } from "./Placeholder";

// owner: U1 replaces this placeholder (SPEC.md 3.6).
export function LayerDock() {
  return <Placeholder name="Layer dock" owner="U1" spec="3.6" slot="layer-dock" className="h-[420px] w-full" />;
}
