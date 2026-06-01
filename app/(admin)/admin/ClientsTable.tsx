"use client";
import { useState } from "react";
import ClientRow from "./ClientRow";

export default function ClientsTable({
  clients, reqCount, latestMood,
}: { clients: any[]; reqCount: Record<string, number>; latestMood: Record<string, number> }) {
  const [manage, setManage] = useState(false);

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button
          onClick={() => setManage((m) => !m)}
          className={manage ? "btn-primary !py-1.5 !text-[12px]" : "btn-ghost !py-1.5 !text-[12px]"}
        >
          {manage ? "Done" : "Edit list"}
        </button>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-[14px]">
          <thead><tr className="bg-[--warm] text-left">
            <Th>Business</Th><Th>Status</Th><Th>Plan</Th><Th>Open requests</Th><Th>Mood</Th><Th>Created</Th><Th></Th>
          </tr></thead>
          <tbody>
            {clients.map((c) => (
              <ClientRow key={c.id} client={c} openRequests={reqCount[c.id] ?? 0} mood={latestMood[c.id]} manage={manage} />
            ))}
            {!clients.length && <tr><td colSpan={7} className="p-6 text-center text-[--muted]">No clients yet. Click + Invite client to start.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Th({ children }: any) {
  return <th className="px-4 py-3 font-semibold text-[--muted] uppercase text-[11px] tracking-wider">{children}</th>;
}
