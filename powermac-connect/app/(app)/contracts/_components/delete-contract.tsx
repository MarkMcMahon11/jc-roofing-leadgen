"use client";

import { Trash2 } from "lucide-react";
import { ActionForm, ConfirmButton } from "@/components/ui/form";
import { Card, CardBody, CardHeader } from "@/components/ui/primitives";
import { deleteContract } from "../actions";

export function DeleteContractCard({ id, title }: { id: string; title: string }) {
  return (
    <Card className="mt-6 border-[#5a1f1d]/70">
      <CardHeader title="Delete contract" description="Only contracts with no jobs can be deleted. SLAs, KPIs, variations, property links and documents are deleted with it. Otherwise set the status to terminated or completed." />
      <CardBody>
        <ActionForm action={deleteContract}>
          <input type="hidden" name="id" value={id} />
          <ConfirmButton message={`Delete "${title}" with its SLAs, KPIs, variations and documents? This cannot be undone.`} size="md">
            <Trash2 className="size-4" aria-hidden />
            Delete contract
          </ConfirmButton>
        </ActionForm>
      </CardBody>
    </Card>
  );
}
