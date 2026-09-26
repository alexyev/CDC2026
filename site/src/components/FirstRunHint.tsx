import { Placeholder } from "./Placeholder";

// owner: U8 replaces this placeholder (SPEC.md 3.15).
export function FirstRunHint() {
  return (
    <Placeholder name="First-run hint" owner="U8" spec="3.15" slot="first-run-hint" className="h-14 w-[520px] p-1.5" />
  );
}
