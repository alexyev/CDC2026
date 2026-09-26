import { useStore } from "@/store/useStore";
import { Placeholder } from "./Placeholder";

// owner: U5 replaces this placeholder (SPEC.md 3.5, U5). Open while the URL has s=<NCESSCH>.
export function ProfileDrawer() {
  const profile = useStore((s) => s.profile);
  if (!profile) return null;
  return (
    <Placeholder
      name={`Profile drawer · ${profile}`}
      owner="U5"
      spec="3.2, 3.5"
      slot="profile-drawer"
      className="glass-strong absolute top-[72px] right-4 bottom-4 z-30 w-[420px]"
    />
  );
}
