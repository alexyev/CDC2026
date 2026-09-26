import { Placeholder } from "./Placeholder";

// owner: A1 replaces this placeholder (SPEC.md 3.13, 14.5).
export function CommandBar() {
  return (
    <Placeholder
      name="Ask the map (command bar)"
      owner="A1"
      spec="3.13, 14.5"
      slot="command-bar"
      className="h-10 w-full"
      inline
    />
  );
}
