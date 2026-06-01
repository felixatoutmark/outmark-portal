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
    <div className="card p-3 flex items-center gap-2 flex-wrap">
      <button
        type="button"
        className="btn-ghost !py-1 !text-[12px]"
        onClick={() => go(shiftMonth(selected, -1))}
        aria-label="Previous month"
      >←</button>
      <input
        type="month"
        className="input !py-1 !text-[13px]"
        value={selected.slice(0, 7)}
        onChange={(e) => e.target.value && go(`${e.target.value}-01`)}
      />
      <button
        type="button"
        className="btn-ghost !py-1 !text-[12px]"
        onClick={() => go(shiftMonth(selected, 1))}
        aria-label="Next month"
      >→</button>
      {!isCurrent && (
        <button
          type="button"
          className="btn-ghost !py-1 !text-[12px]"
          onClick={() => go(monthKey())}
        >Today</button>
      )}
      <span className="ml-auto font-bold text-[16px]">{monthLabel(selected)}</span>
    </div>
  );
}
