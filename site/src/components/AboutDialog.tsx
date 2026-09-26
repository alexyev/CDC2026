import { useStore } from "@/store/useStore";
import { Placeholder } from "./Placeholder";

// owner: U9 replaces this placeholder (SPEC.md 15). Open while the URL has about=1.
export function AboutDialog() {
  const open = useStore((s) => s.about);
  if (!open) return null;
  return (
    <div className="absolute inset-0 z-50 grid place-items-center bg-black/50">
      <Placeholder
        name="About and Data"
        owner="U9"
        spec="15"
        slot="about-dialog"
        className="glass-strong h-[560px] w-[720px]"
      />
    </div>
  );
}
