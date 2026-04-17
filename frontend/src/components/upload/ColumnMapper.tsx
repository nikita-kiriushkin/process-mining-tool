"use client";

import { useState, useEffect } from "react";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import type { ColumnMapping, UploadResponse } from "@/lib/types";

interface ColumnMapperProps {
  uploadResponse: UploadResponse;
  initialMapping?: Partial<ColumnMapping>;
  onSubmit: (mapping: ColumnMapping) => void;
  onBack: () => void;
  isLoading?: boolean;
}

const REQUIRED_FIELDS: Array<{
  key: keyof ColumnMapping;
  label: string;
  hint: string;
}> = [
  { key: "case_id", label: "Case ID", hint: "Unique identifier per process instance" },
  { key: "activity_name", label: "Activity Name", hint: "Name of the process step" },
  { key: "timestamp", label: "Timestamp", hint: "When the event occurred" },
];

const OPTIONAL_FIELDS: Array<{
  key: keyof ColumnMapping;
  label: string;
  hint: string;
}> = [
  { key: "resource", label: "Resource", hint: "Person or system executing the step" },
  { key: "team", label: "Team", hint: "Team dimension for filtering" },
  { key: "region", label: "Region", hint: "Geographic dimension for filtering" },
  { key: "status", label: "Status", hint: "Status / stage dimension" },
  { key: "cost", label: "Cost", hint: "Numeric cost or value metric" },
];


function autoDetect(columns: string[]): Partial<ColumnMapping> {
  return {
    case_id: columns[0],
    activity_name: columns[1],
    timestamp: columns[2],
  };
}

export function ColumnMapper({
  uploadResponse,
  initialMapping,
  onSubmit,
  onBack,
  isLoading,
}: ColumnMapperProps) {
  const { columns, sample_rows, row_count } = uploadResponse;

  const [mapping, setMapping] = useState<Partial<ColumnMapping>>(
    initialMapping ?? autoDetect(columns)
  );
  const [errors, setErrors] = useState<Partial<Record<keyof ColumnMapping, string>>>({});

  // Re-run auto-detect when columns change (fresh upload)
  useEffect(() => {
    if (!initialMapping) {
      setMapping(autoDetect(columns));
    }
  }, [columns, initialMapping]);

  function setField(key: keyof ColumnMapping, value: string) {
    setMapping((prev) => ({ ...prev, [key]: value || undefined }));
    if (value) setErrors((prev) => ({ ...prev, [key]: undefined }));
  }

  function validate(): boolean {
    const newErrors: typeof errors = {};
    for (const { key, label } of REQUIRED_FIELDS) {
      if (!mapping[key]) {
        newErrors[key] = `${label} is required`;
      }
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  function handleSubmit() {
    if (!validate()) return;
    onSubmit(mapping as ColumnMapping);
  }

  const selectedCols = new Set(Object.values(mapping).filter(Boolean));

  return (
    <div className="space-y-6">
      {/* Required fields */}
      <div>
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
          Required columns
        </p>
        <div className="space-y-3">
          {REQUIRED_FIELDS.map(({ key, label, hint }) => (
            <FieldRow
              key={key}
              label={label}
              hint={hint}
              value={mapping[key] ?? ""}
              columns={columns}
              error={errors[key]}
              required
              selectedCols={selectedCols}
              currentKey={key}
              onChange={(v) => setField(key, v)}
            />
          ))}
        </div>
      </div>

      {/* Optional fields */}
      <div>
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
          Optional columns
          <span className="ml-2 font-normal text-gray-400 normal-case tracking-normal">
            (enable dimension filters)
          </span>
        </p>
        <div className="space-y-3">
          {OPTIONAL_FIELDS.map(({ key, label, hint }) => (
            <FieldRow
              key={key}
              label={label}
              hint={hint}
              value={mapping[key] ?? ""}
              columns={columns}
              selectedCols={selectedCols}
              currentKey={key}
              onChange={(v) => setField(key, v)}
            />
          ))}
        </div>
      </div>

      {/* Data preview */}
      <div>
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
          Data preview
          <span className="ml-2 font-normal text-gray-400 normal-case tracking-normal">
            ({row_count.toLocaleString()} total rows)
          </span>
        </p>
        <div className="overflow-x-auto rounded-xl border border-gray-100">
          <table className="min-w-full text-xs">
            <thead>
              <tr className="bg-gray-50">
                {columns.map((col) => {
                  const isActive = selectedCols.has(col);
                  return (
                    <th
                      key={col}
                      className={cn(
                        "px-3 py-2 text-left font-medium border-b border-gray-100 whitespace-nowrap",
                        isActive ? "text-blue-700 bg-blue-50" : "text-gray-500"
                      )}
                    >
                      {col}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {sample_rows.map((row, i) => (
                <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-gray-50/50"}>
                  {columns.map((col) => (
                    <td
                      key={col}
                      className={cn(
                        "px-3 py-2 text-gray-600 whitespace-nowrap max-w-[200px] truncate",
                        selectedCols.has(col) ? "bg-blue-50/40" : ""
                      )}
                    >
                      {row[col] ?? ""}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Error summary */}
      {Object.keys(errors).some((k) => errors[k as keyof ColumnMapping]) && (
        <div className="flex items-center gap-2 p-3 bg-red-50 rounded-lg text-sm text-red-700">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          Please map all required columns before continuing.
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-between pt-2">
        <Button variant="ghost" onClick={onBack}>
          ← Back
        </Button>
        <Button onClick={handleSubmit} disabled={isLoading}>
          {isLoading ? "Analyzing…" : "Analyze Process →"}
        </Button>
      </div>
    </div>
  );
}

// ── Sub-component ──────────────────────────────────────────────────────────

interface FieldRowProps {
  label: string;
  hint: string;
  value: string;
  columns: string[];
  error?: string;
  required?: boolean;
  selectedCols: Set<string>;
  currentKey: keyof ColumnMapping;
  onChange: (value: string) => void;
}

function FieldRow({
  label,
  hint,
  value,
  columns,
  error,
  required,
  selectedCols,
  onChange,
}: FieldRowProps) {
  return (
    <div className="flex items-start gap-4">
      <div className="w-36 pt-2 flex-shrink-0">
        <div className="flex items-center gap-1">
          <span className="text-sm font-medium text-gray-700">{label}</span>
          {required && <span className="text-red-500 text-xs">*</span>}
        </div>
        <p className="text-xs text-gray-400 mt-0.5 leading-tight">{hint}</p>
      </div>
      <div className="flex-1">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={cn(
            "w-full px-3 py-2 text-sm rounded-lg border bg-white",
            "focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500",
            "transition-colors",
            error
              ? "border-red-300 bg-red-50"
              : "border-gray-200 hover:border-gray-300"
          )}
        >
          {!required && <option value="">— not mapped —</option>}
          {required && !value && <option value="">Select column…</option>}
          {columns.map((col) => {
            const isTaken = selectedCols.has(col) && col !== value;
            return (
              <option key={col} value={col} disabled={isTaken}>
                {col}
                {isTaken ? " (already used)" : ""}
              </option>
            );
          })}
        </select>
        {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
      </div>
    </div>
  );
}
