"use client";

import { useState, useEffect, useMemo } from "react";
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
  key: "case_id" | "activity_name" | "timestamp";
  label: string;
  hint: string;
}> = [
  { key: "case_id", label: "Case ID", hint: "Unique identifier per process instance" },
  { key: "activity_name", label: "Activity Name", hint: "Name of the process step" },
  { key: "timestamp", label: "Timestamp", hint: "When the event occurred" },
];

/** snake_case / camelCase / kebab-case → Title Case */
function toTitle(s: string): string {
  return s
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

type RequiredMapping = Pick<ColumnMapping, "case_id" | "activity_name" | "timestamp">;
type DimRow = { label: string; column: string };

function autoDetectRequired(columns: string[]): Partial<RequiredMapping> {
  return {
    case_id: columns[0],
    activity_name: columns[1],
    timestamp: columns[2],
  };
}

function buildDefaultDimRows(columns: string[], requiredCols: string[]): DimRow[] {
  const reqSet = new Set(requiredCols.filter(Boolean));
  return columns
    .filter((c) => !reqSet.has(c))
    .map((c) => ({ label: toTitle(c), column: c }));
}

export function ColumnMapper({
  uploadResponse,
  initialMapping,
  onSubmit,
  onBack,
  isLoading,
}: ColumnMapperProps) {
  const { columns, sample_rows, row_count } = uploadResponse;

  const [reqMapping, setReqMapping] = useState<Partial<RequiredMapping>>(
    initialMapping
      ? { case_id: initialMapping.case_id, activity_name: initialMapping.activity_name, timestamp: initialMapping.timestamp }
      : autoDetectRequired(columns)
  );

  const [dimRows, setDimRows] = useState<DimRow[]>(() => {
    if (initialMapping?.dimensions && Object.keys(initialMapping.dimensions).length > 0) {
      return Object.entries(initialMapping.dimensions).map(([label, column]) => ({ label, column }));
    }
    const req = autoDetectRequired(columns);
    return buildDefaultDimRows(columns, [req.case_id ?? "", req.activity_name ?? "", req.timestamp ?? ""]);
  });

  const [errors, setErrors] = useState<Partial<Record<"case_id" | "activity_name" | "timestamp", string>>>({});

  // Re-run auto-detect when columns change (fresh upload)
  useEffect(() => {
    if (!initialMapping) {
      const req = autoDetectRequired(columns);
      setReqMapping(req);
      setDimRows(buildDefaultDimRows(columns, [req.case_id ?? "", req.activity_name ?? "", req.timestamp ?? ""]));
    }
  }, [columns, initialMapping]);

  function setReqField(key: keyof RequiredMapping, value: string) {
    setReqMapping((prev) => ({ ...prev, [key]: value || undefined }));
    if (value) setErrors((prev) => ({ ...prev, [key]: undefined }));
  }

  function updateDimRow(index: number, patch: Partial<DimRow>) {
    setDimRows((rows) => rows.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }

  function validate(): boolean {
    const newErrors: typeof errors = {};
    for (const { key, label } of REQUIRED_FIELDS) {
      if (!reqMapping[key]) newErrors[key] = `${label} is required`;
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  function handleSubmit() {
    if (!validate()) return;
    const dimensions: Record<string, string> = {};
    for (const { label, column } of dimRows) {
      const trimmed = label.trim();
      if (trimmed && column) dimensions[trimmed] = column;
    }
    onSubmit({
      case_id: reqMapping.case_id!,
      activity_name: reqMapping.activity_name!,
      timestamp: reqMapping.timestamp!,
      dimensions,
    });
  }

  const selectedCols = useMemo(() => {
    const s = new Set<string>();
    if (reqMapping.case_id) s.add(reqMapping.case_id);
    if (reqMapping.activity_name) s.add(reqMapping.activity_name);
    if (reqMapping.timestamp) s.add(reqMapping.timestamp);
    for (const { column } of dimRows) if (column) s.add(column);
    return s;
  }, [reqMapping, dimRows]);

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
              value={reqMapping[key] ?? ""}
              columns={columns}
              error={errors[key]}
              required
              selectedCols={selectedCols}
              currentCol={reqMapping[key] ?? ""}
              onChange={(v) => setReqField(key, v)}
            />
          ))}
        </div>
      </div>

      {/* Optional dimension fields */}
      <div>
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
          Optional columns
          <span className="ml-2 font-normal text-gray-400 normal-case tracking-normal">
            (enable dimension filters)
          </span>
        </p>
        <div className="space-y-3">
          {dimRows.map((row, i) => (
            <DimensionRow
              key={i}
              label={row.label}
              column={row.column}
              columns={columns}
              selectedCols={selectedCols}
              onLabelChange={(label) => updateDimRow(i, { label })}
              onColumnChange={(column) => updateDimRow(i, { column })}
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
      {Object.values(errors).some(Boolean) && (
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

// ── Sub-components ──────────────────────────────────────────────────────────

interface FieldRowProps {
  label: string;
  hint: string;
  value: string;
  columns: string[];
  error?: string;
  required?: boolean;
  selectedCols: Set<string>;
  currentCol: string;
  onChange: (value: string) => void;
}

function FieldRow({ label, hint, value, columns, error, required, selectedCols, currentCol, onChange }: FieldRowProps) {
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
            "focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors",
            error ? "border-red-300 bg-red-50" : "border-gray-200 hover:border-gray-300"
          )}
        >
          {!required && <option value="">— not mapped —</option>}
          {required && !value && <option value="">Select column…</option>}
          {columns.map((col) => {
            const isTaken = selectedCols.has(col) && col !== currentCol;
            return (
              <option key={col} value={col} disabled={isTaken}>
                {col}{isTaken ? " (already used)" : ""}
              </option>
            );
          })}
        </select>
        {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
      </div>
    </div>
  );
}

interface DimensionRowProps {
  label: string;
  column: string;
  columns: string[];
  selectedCols: Set<string>;
  onLabelChange: (label: string) => void;
  onColumnChange: (column: string) => void;
}

function DimensionRow({ label, column, columns, selectedCols, onLabelChange, onColumnChange }: DimensionRowProps) {
  return (
    <div className="flex items-start gap-4">
      <div className="w-36 flex-shrink-0 pt-2">
        <input
          type="text"
          value={label}
          onChange={(e) => onLabelChange(e.target.value)}
          placeholder="Dimension name"
          className={cn(
            "w-full text-sm font-medium text-gray-700 bg-transparent",
            "border-b border-dashed border-gray-300 pb-0.5",
            "focus:outline-none focus:border-blue-400",
            "placeholder:text-gray-300"
          )}
        />
        <p className="text-xs text-gray-400 mt-0.5 leading-tight">Click to rename</p>
      </div>
      <div className="flex-1">
        <select
          value={column}
          onChange={(e) => onColumnChange(e.target.value)}
          className={cn(
            "w-full px-3 py-2 text-sm rounded-lg border bg-white",
            "focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors",
            "border-gray-200 hover:border-gray-300"
          )}
        >
          <option value="">— not mapped —</option>
          {columns.map((col) => {
            const isTaken = selectedCols.has(col) && col !== column;
            return (
              <option key={col} value={col} disabled={isTaken}>
                {col}{isTaken ? " (already used)" : ""}
              </option>
            );
          })}
        </select>
      </div>
    </div>
  );
}
