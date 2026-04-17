"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface StepIndicatorProps {
  currentStep: number; // 1-based
  steps: string[];
}

export function StepIndicator({ currentStep, steps }: StepIndicatorProps) {
  return (
    <div className="flex items-center justify-center">
      {steps.map((label, i) => {
        const n = i + 1;
        const done = n < currentStep;
        const active = n === currentStep;

        return (
          <div key={label} className="flex items-center">
            <div className="flex flex-col items-center gap-1.5">
              <div
                className={cn(
                  "w-9 h-9 rounded-full flex items-center justify-center",
                  "text-sm font-semibold border-2 transition-colors",
                  done
                    ? "bg-blue-600 border-blue-600 text-white"
                    : active
                    ? "border-blue-600 bg-white text-blue-600"
                    : "border-gray-200 bg-white text-gray-400"
                )}
              >
                {done ? <Check className="w-4 h-4" /> : n}
              </div>
              <span
                className={cn(
                  "text-xs font-medium whitespace-nowrap",
                  active
                    ? "text-blue-600"
                    : done
                    ? "text-gray-600"
                    : "text-gray-400"
                )}
              >
                {label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div
                className={cn(
                  "h-0.5 w-16 mx-3 mb-5 flex-shrink-0",
                  done ? "bg-blue-600" : "bg-gray-200"
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
