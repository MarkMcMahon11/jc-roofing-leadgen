"use client";

import Link from "next/link";
import { useState } from "react";
import { Badge, Card, Empty, PageHeader, Segmented } from "@/components/admin/ui";
import { fmtDateTime } from "@/lib/ops/format";
import { useOps } from "@/lib/ops/store";
import type { Activity } from "@/lib/ops/types";

const KINDS: { value: "all" | Activity["kind"]; label: string }[] = [
  { value: "all", label: "Everything" },
  { value: "van", label: "Vans" },
  { value: "crew", label: "Team" },
  { value: "job", label: "Jobs" },
  { value: "maintenance", label: "Servicing" },
  { value: "fine", label: "Notices" },
  { value: "expense", label: "Costs" },
];

export default function ActivityPage() {
  const { db } = useOps();
  const [kind, setKind] = useState<"all" | Activity["kind"]>("all");
  const rows = db.activity.filter((a) => kind === "all" || a.kind === kind);
  return (
    <div className="space-y-4">
      <PageHeader title="Activity log" sub="What has changed in the dashboard, newest first" />
      <Segmented value={kind} onChange={setKind} options={KINDS.map((k) => ({ ...k, count: k.value === "all" ? db.activity.length : db.activity.filter((a) => a.kind === k.value).length }))} />
      <Card>
        <ul className="divide-y divide-cream">
          {rows.map((a) => (
            <li key={a.id}>
              <Link href={a.href ?? "/admin/activity"} className="flex min-h-11 flex-wrap items-center gap-3 px-5 py-3 text-sm hover:bg-cream">
                <Badge>{KINDS.find((k) => k.value === a.kind)?.label ?? a.kind}</Badge>
                <span className="min-w-0 flex-1">{a.text}</span>
                <span className="text-xs text-mute">{fmtDateTime(a.at)}</span>
              </Link>
            </li>
          ))}
        </ul>
        {rows.length === 0 && <Empty>Nothing yet.</Empty>}
      </Card>
    </div>
  );
}
