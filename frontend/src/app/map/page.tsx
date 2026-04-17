"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { ColumnMapper } from "@/components/upload/ColumnMapper";
import { StepIndicator } from "@/components/upload/StepIndicator";
import { useUploadStore } from "@/store/uploadStore";
import type { ColumnMapping } from "@/lib/types";

const STEPS = ["Upload", "Map Columns", "Explore"];

export default function MapPage() {
  const router = useRouter();
  const { uploadResponse, columnMapping, setColumnMapping } = useUploadStore();

  // Guard: must have uploaded a file first
  useEffect(() => {
    if (!uploadResponse) {
      router.replace("/upload");
    }
  }, [uploadResponse, router]);

  if (!uploadResponse) return null;

  function handleSubmit(mapping: ColumnMapping) {
    setColumnMapping(mapping);
    router.push("/explore");
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-100">
        <div className="max-w-4xl mx-auto px-6 py-4">
          <h1 className="text-lg font-bold text-gray-900 tracking-tight">
            Process Mining Tool
          </h1>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-6 py-12">
        {/* Step indicator */}
        <div className="mb-10">
          <StepIndicator currentStep={2} steps={STEPS} />
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-1">
            Map Columns
          </h2>
          <p className="text-gray-500 text-sm mb-6">
            Tell the tool which columns represent the case, activity, and
            timestamp. Columns highlighted in blue in the preview are currently
            mapped.
          </p>

          <ColumnMapper
            uploadResponse={uploadResponse}
            initialMapping={Object.keys(columnMapping).length > 0 ? columnMapping : undefined}
            onSubmit={handleSubmit}
            onBack={() => router.push("/upload")}
          />
        </div>
      </main>
    </div>
  );
}
