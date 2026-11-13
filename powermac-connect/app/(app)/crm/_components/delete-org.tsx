"use client";

import { Trash2 } from "lucide-react";
import { ActionForm, ConfirmButton } from "@/components/ui/form";
import { Card, CardBody, CardHeader } from "@/components/ui/primitives";
import { deleteOrganisation } from "../actions";

export function DeleteOrgCard({ id, name }: { id: string; name: string }) {
  return (
    <Card className="mt-6 border-[#5a1f1d]/70">
      <CardHeader title="Delete client" description="Only clients with no contracts, properties or jobs can be deleted. Contacts, opportunities and activity history are deleted with it." />
      <CardBody>
        <ActionForm action={deleteOrganisation}>
          <input type="hidden" name="id" value={id} />
          <ConfirmButton message={`Delete ${name} and its contacts, opportunities and activity history? This cannot be undone.`} size="md">
            <Trash2 className="size-4" aria-hidden />
            Delete client
          </ConfirmButton>
        </ActionForm>
      </CardBody>
    </Card>
  );
}
