"use client";
import { useRouter, useSearchParams } from "next/navigation";

function monthKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}-01`;
}
function monthLabel(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-US", { month: "long", year: "numeric" });
}
function shiftMonth(iso: string, delta: number) {
  const d = new Date(iso + "T00:00:00");
  d.setMonth(d.getMonth() + delta);
  return monthKey(d);
}

export default function MonthPicker({ selected }: { selected: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const isCurrent = selected === monthKey();

  function go(m: string) {
    const p = new URLSearchParams(params?.toString());
    if (m === monthKey()) p.delete("month");
    else p.set("month", m);
    const qs = p.toString();
    router.push(`/dashboard${qs ? `?${qs}` : ""}`);
  }

  return (
    <span className="inline-flex items-center gap-1.5 align-baseline">
      <button
        type="button"
        className="text-[--muted] hover:text-[--fg] px-1 leading-none"
        onClick={() => go(shiftMonth(selected, -1))}
        aria-label="Previous month"
      >‹</button>
      <label className="relative cursor-pointer underline decoration-dotted underline-offset-4 hover:text-[--fg]">
        {monthLabel(selected)}
        <input
          type="month"
          className="absolute inset-0 opacity-0 cursor-pointer"
          value={selected.slice(0, 7)}
          onChange={(e) => e.target.value && go(`${e.target.value}-01`)}
        />
      </label>
      <button
        type="button"
        className="text-[--muted] hover:text-[--fg] px-1 leading-none"
        onClick={() => go(shiftMonth(selected, 1))}
        aria-label="Next month"
      >›</button>
      {!isCurrent && (
        <button
          type="button"
          className="text-[11px] text-[--muted] hover:text-[--fg] ml-1"
          onClick={() => go(monthKey())}
        >today</button>
      )}
    </span>
  );
}
