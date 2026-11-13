import { Inbox, Mail, ShieldAlert, ShieldCheck, Webhook, MessageCircle, Globe } from "lucide-react";
import { Badge, ButtonLink, Card, CardHeader, EmptyState, Notice } from "@/components/ui/primitives";
import { dateTime, relative } from "@/lib/format";
import type { ServerClient } from "@/lib/supabase/server";
import { RejectRequestButton } from "./request-actions";

const CHANNEL = { email: Mail, api: Webhook, whatsapp: MessageCircle, portal: Globe } as const;

export async function WorkRequests({ supabase, tenantId, canWrite }: { supabase: ServerClient; tenantId: string; canWrite: boolean }) {
  const { data } = await supabase
    .from("inbound_messages")
    .select("id, channel, sender, subject, body, received_at, is_authorised, organisations(name)")
    .eq("tenant_id", tenantId)
    .eq("status", "new")
    .order("received_at", { ascending: false })
    .limit(200);
  const rows = data ?? [];
  return (
    <div className="grid gap-4">
      <Notice tone="info">
        Requests arriving by email, API, WhatsApp or the client portal wait here. Senders listed as authorised for a client are matched automatically; turn a request into a job and it is
        linked to the new job. Automatic AI extraction of addresses and priorities arrives in a later stage, so the job form is pre-filled with the subject and message only.
      </Notice>
      <Card>
        <CardHeader title="Work requests" description={`${rows.length} waiting to be processed`} />
        {rows.length === 0 ? (
          <EmptyState title="No new work requests" icon={<Inbox className="size-7" aria-hidden />}>
            New emails and API requests will appear here.
          </EmptyState>
        ) : (
          <ul className="divide-y divide-line">
            {rows.map((m) => {
              const Icon = CHANNEL[m.channel as keyof typeof CHANNEL] ?? Mail;
              return (
                <li key={m.id} className="grid gap-3 px-5 py-4 md:grid-cols-[1fr_auto] md:items-start" data-request={m.id}>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Icon className="size-4 shrink-0 text-subtle" aria-hidden />
                      <span className="truncate text-sm font-medium text-fg">{m.subject || "(no subject)"}</span>
                      {m.is_authorised ? (
                        <Badge tone="ok">
                          <ShieldCheck className="size-3" aria-hidden /> Authorised sender
                        </Badge>
                      ) : (
                        <Badge tone="warn">
                          <ShieldAlert className="size-3" aria-hidden /> Unknown sender
                        </Badge>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-muted">
                      <span className="break-all">{m.sender}</span>
                      {m.organisations?.name && <> · {m.organisations.name}</>} · <span title={dateTime(m.received_at)}>received {relative(m.received_at)}</span> · {m.channel}
                    </p>
                    {m.body && (
                      <details className="mt-2 text-sm">
                        <summary className="cursor-pointer text-xs font-medium text-accent-hi select-none hover:underline">Show message</summary>
                        <p className="mt-2 max-w-3xl rounded-lg border border-line bg-sunken px-3 py-2 whitespace-pre-wrap text-muted">{m.body.slice(0, 4000)}</p>
                      </details>
                    )}
                  </div>
                  {canWrite && (
                    <div className="flex flex-wrap items-start gap-2 md:justify-end">
                      <ButtonLink href={`/jobs/new?intake=${m.id}`} variant={m.is_authorised ? "primary" : "secondary"} size="sm">
                        Create job from this
                      </ButtonLink>
                      {!m.is_authorised && <RejectRequestButton id={m.id} sender={m.sender} />}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
