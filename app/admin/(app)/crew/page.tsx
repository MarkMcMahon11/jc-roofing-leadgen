"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Plus } from "lucide-react";
import { Badge, Button, Card, PageHeader, Plate, Segmented, Table, Td, Th } from "@/components/admin/ui";
import { CrewForm } from "@/components/admin/CrewForm";
import { daysBetween, fmtDate, today } from "@/lib/ops/format";
import { useOps } from "@/lib/ops/store";

const cardTone = { Green: "green", Red: "red", Blue: "blue", Gold: "amber", Black: "slate" } as const;

function Expiry({ date }: { date?: string }) {
  if (!date) return <span className="text-mute">—</span>;
  const days = daysBetween(today(), date);
  return <Badge tone={days < 0 ? "red" : days <= 30 ? "amber" : "green"}>{fmtDate(date)}</Badge>;
}

export default function CrewPage() {
  const { db } = useOps();
  const router = useRouter();
  const [show, setShow] = useState<"active" | "inactive">("active");
  const [adding, setAdding] = useState(false);
  const list = db.crew.filter((c) => c.status === show);

  return (
    <div>
      <PageHeader
        title="Team"
        sub={`${db.crew.filter((c) => c.status === "active").length} people: ${db.crew.filter((c) => c.status === "active" && c.drives).length} drive company vans`}
        actions={<Button onClick={() => setAdding(true)}><Plus size={16} /> Add team member</Button>}
      />
      <div className="mb-4">
        <Segmented value={show} onChange={setShow} options={[{ value: "active", label: "Current", count: db.crew.filter((c) => c.status === "active").length }, { value: "inactive", label: "Left", count: db.crew.filter((c) => c.status === "inactive").length }]} />
      </div>
      <Card>
        <Table minWidth={900}>
          <thead>
            <tr><Th>Name</Th><Th>Role</Th><Th>Usual van</Th><Th>Licence check</Th><Th>CSCS card</Th><Th>Height training</Th><Th>First aid</Th></tr>
          </thead>
          <tbody>
            {list.map((c) => {
              const van = db.vehicles.find((v) => v.assignedCrewId === c.id);
              return (
                <tr key={c.id} onClick={() => router.push(`/admin/crew/${c.id}`)} className="cursor-pointer hover:bg-cream">
                  <Td>
                    <Link href={`/admin/crew/${c.id}`} onClick={(e) => e.stopPropagation()} className="block min-h-10">
                      <span className="block font-medium">{c.name}</span>
                      <span className="block text-xs text-mute">{c.phone}</span>
                    </Link>
                  </Td>
                  <Td>{c.role}</Td>
                  <Td>{van ? <Plate>{van.reg}</Plate> : <span className="text-mute">—</span>}</Td>
                  <Td>
                    {c.drives ? (
                      <div className="space-y-0.5"><Expiry date={c.licenceExpiry} />{(c.licencePoints ?? 0) > 0 && <div className="text-xs text-mute">{c.licencePoints} points</div>}</div>
                    ) : <span className="text-mute">Doesn&apos;t drive</span>}
                  </Td>
                  <Td>{c.cscsCard ? <div className="space-y-0.5"><Badge tone={cardTone[c.cscsCard]}>{c.cscsCard}</Badge><div><Expiry date={c.cscsExpiry} /></div></div> : <span className="text-mute">—</span>}</Td>
                  <Td><Expiry date={c.heightExpiry} /></Td>
                  <Td><Expiry date={c.firstAidExpiry} /></Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
        {list.length === 0 && <div className="px-5 py-10 text-center text-sm text-mute">{db.crew.length === 0 ? "No team members yet. Press “Add team member”." : "Nobody here."}</div>}
      </Card>
      {adding && <CrewForm onClose={() => setAdding(false)} />}
    </div>
  );
}
