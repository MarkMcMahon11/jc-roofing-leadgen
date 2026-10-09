"use client";

import { Suspense } from "react";
import { ProjectMap } from "@/components/admin/ProjectMap";

export default function MapPage() {
  return (
    <Suspense>
      <ProjectMap />
    </Suspense>
  );
}
