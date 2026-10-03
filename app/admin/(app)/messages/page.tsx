"use client";

import { Card, Empty, PageHeader } from "@/components/admin/ui";
import { fmtDateTime } from "@/lib/ops/format";
import { useOps } from "@/lib/ops/store";

export default function MessagesPage() {
  const { biz } = useOps();
  return (
    <div className="space-y-4">
      <PageHeader title="Messages" sub="The texts and emails the quote form sends to you and your customers" />
      <p className="text-sm text-mute">&ldquo;Preview&rdquo; means nothing was really sent yet (no text or email service is switched on). This is exactly what would be sent.</p>
      <Card>
        <ul className="space-y-2 p-3">
          {biz.outbox.map((m) => (
            <li key={m.id} className={`rounded-2xl p-3 text-sm ${m.audience === "owner" ? "bg-brand-tint" : "bg-cream"}`}>
              <div className="flex justify-between gap-2 text-xs text-mute">
                <span>{m.audience === "owner" ? "To you" : "To customer"} · {m.channel.toUpperCase()} · {m.to}</span>
                <span>{fmtDateTime(m.at)}</span>
              </div>
              <p className={`text-xs font-semibold ${m.status === "failed" ? "text-brand" : m.status === "sent" ? "text-emerald-800" : "text-mute"}`}>
                {m.status === "preview" ? "Preview (not sent)" : m.status === "sent" ? "Sent" : `FAILED: ${m.error ?? "unknown error"}`}
              </p>
              {m.subject && <p className="font-semibold">{m.subject}</p>}
              <p className="whitespace-pre-line">{m.body}</p>
            </li>
          ))}
        </ul>
        {biz.outbox.length === 0 && <Empty>Nothing yet.</Empty>}
      </Card>
    </div>
  );
}
