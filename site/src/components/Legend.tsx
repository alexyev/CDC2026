import { Placeholder } from "./Placeholder";

// owner: U2 replaces this placeholder (SPEC.md 5.2, 9.3).
export function Legend() {
  return <Placeholder name="Legend" owner="U2" spec="5.2, 9.3" slot="legend" className="h-[148px] w-[232px]" />;
}
