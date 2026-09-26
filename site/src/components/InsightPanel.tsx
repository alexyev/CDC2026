import { Placeholder } from "./Placeholder";

// owner: U3 replaces this placeholder (SPEC.md 3.7, 6.3).
export function InsightPanel() {
  return (
    <Placeholder name="Insight panel" owner="U3" spec="3.7, 6.3" slot="insight-panel" className="h-[360px] w-full" />
  );
}
