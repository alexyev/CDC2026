import { useStore } from "@/store/useStore";
import { Placeholder } from "./Placeholder";

// owner: U7 replaces this placeholder (SPEC.md 3.12). Open while the URL has fp=1.
export function FavoritesPanel() {
  const open = useStore((s) => s.favoritesPanel);
  if (!open) return null;
  return (
    <Placeholder
      name="Favorites panel"
      owner="U7"
      spec="3.12"
      slot="favorites-panel"
      className="glass-strong absolute top-[72px] right-4 bottom-4 z-40 w-[560px]"
    />
  );
}
