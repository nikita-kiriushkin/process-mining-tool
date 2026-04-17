"use client";

import { useCallback, useRef, useState } from "react";
import { Upload, FileText, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { uploadFile } from "@/lib/api";
import type { UploadResponse } from "@/lib/types";
import { cn } from "@/lib/utils";

interface FileDropzoneProps {
  onSuccess: (response: UploadResponse) => void;
}

type State = "idle" | "uploading" | "success" | "error";

export function FileDropzone({ onSuccess }: FileDropzoneProps) {
  const [state, setState] = useState<State>("idle");
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(
    async (file: File) => {
      if (!file.name.toLowerCase().endsWith(".csv")) {
        setError("Only CSV files are supported.");
        setState("error");
        return;
      }
      setFileName(file.name);
      setState("uploading");
      setError(null);
      try {
        const response = await uploadFile(file);
        setState("success");
        onSuccess(response);
      } catch (err) {
        setState("error");
        setError(err instanceof Error ? err.message : "Upload failed. Please try again.");
      }
    },
    [onSuccess]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
      // Reset input so re-selecting the same file fires onChange again
      e.target.value = "";
    },
    [handleFile]
  );

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label="Upload CSV file"
      onClick={() => inputRef.current?.click()}
      onKeyDown={(e) => e.key === "Enter" && inputRef.current?.click()}
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
      className={cn(
        "relative flex flex-col items-center justify-center w-full h-52",
        "border-2 border-dashed rounded-2xl cursor-pointer",
        "transition-all duration-150 select-none",
        isDragging
          ? "border-blue-400 bg-blue-50 scale-[1.01]"
          : state === "success"
          ? "border-green-400 bg-green-50"
          : state === "error"
          ? "border-red-300 bg-red-50"
          : "border-gray-200 bg-gray-50 hover:border-gray-300 hover:bg-gray-100"
      )}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".csv"
        className="hidden"
        onChange={handleChange}
      />

      {state === "idle" && (
        <div className="flex flex-col items-center gap-3 text-center px-6">
          <div className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center">
            <Upload className="w-6 h-6 text-gray-400" />
          </div>
          <div>
            <p className="text-sm font-medium text-gray-700">
              Drop your CSV file here, or{" "}
              <span className="text-blue-600">click to browse</span>
            </p>
            <p className="text-xs text-gray-400 mt-1">
              Must have: case_id, activity_name, timestamp
            </p>
          </div>
        </div>
      )}

      {state === "uploading" && (
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-10 h-10 text-blue-500 animate-spin" />
          <p className="text-sm text-gray-600">
            Uploading <span className="font-medium">{fileName}</span>…
          </p>
        </div>
      )}

      {state === "success" && (
        <div className="flex flex-col items-center gap-3 px-4">
          <CheckCircle2 className="w-10 h-10 text-green-500" />
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-gray-400" />
            <p className="text-sm font-medium text-green-800">{fileName}</p>
          </div>
          <p className="text-xs text-gray-400">Click to replace</p>
        </div>
      )}

      {state === "error" && (
        <div className="flex flex-col items-center gap-3 px-6 text-center">
          <AlertCircle className="w-10 h-10 text-red-400" />
          <p className="text-sm font-medium text-red-700">{error}</p>
          <p className="text-xs text-gray-400">Click to try again</p>
        </div>
      )}
    </div>
  );
}
