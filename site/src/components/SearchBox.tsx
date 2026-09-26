import { Placeholder } from "./Placeholder";

// owner: U6 replaces this placeholder (SPEC.md 3.11).
export function SearchBox() {
  return <Placeholder name="Search" owner="U6" spec="3.11" slot="search" className="h-10 w-[200px]" inline />;
}
