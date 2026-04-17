"use client";

import { useRouter } from "next/navigation";
import { FileText } from "lucide-react";
import { FileDropzone } from "@/components/upload/FileDropzone";
import { StepIndicator } from "@/components/upload/StepIndicator";
import { Button } from "@/components/ui/Button";
import { useUploadStore } from "@/store/uploadStore";
import { formatCount } from "@/lib/utils";
import type { UploadResponse } from "@/lib/types";

const STEPS = ["Upload", "Map Columns", "Explore"];

export default function UploadPage() {
  const router = useRouter();
  const { uploadResponse, setUploadResponse } = useUploadStore();

  function handleSuccess(response: UploadResponse) {
    setUploadResponse(response);
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-100">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <h1 className="text-lg font-bold text-gray-900 tracking-tight">
            Process Mining Tool
          </h1>
        </div>
      </header>

      <main className="max-w-xl mx-auto px-6 py-12">
        {/* Step indicator */}
        <div className="mb-10">
          <StepIndicator currentStep={1} steps={STEPS} />
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-1">
            Upload Event Log
          </h2>
          <p className="text-gray-500 text-sm mb-6">
            Upload a CSV file containing process events to get started.
          </p>

          <FileDropzone onSuccess={handleSuccess} />

          {/* Post-upload info */}
          {uploadResponse && (
            <div className="mt-4 flex items-center justify-between p-4 bg-blue-50 rounded-xl border border-blue-100">
              <div className="flex items-center gap-3">
                <FileText className="w-5 h-5 text-blue-500 flex-shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-blue-900">
                    {formatCount(uploadResponse.row_count)} events &middot;{" "}
                    {uploadResponse.columns.length} columns
                  </p>
                  <p className="text-xs text-blue-600 mt-0.5">
                    Columns: {uploadResponse.columns.join(", ")}
                  </p>
                </div>
              </div>
              <Button onClick={() => router.push("/map")}>
                Next →
              </Button>
            </div>
          )}

          {/* Sample data link */}
          <p className="text-center text-xs text-gray-400 mt-6">
            No file?{" "}
            <a
              href="/sample-data/lead-funnel.csv"
              download
              className="text-blue-500 hover:underline"
            >
              Download sample event log
            </a>
          </p>
        </div>
      </main>
    </div>
  );
}
