"use client";

import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "primary", size = "md", className, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center gap-2 font-medium rounded-lg",
          "transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
          "disabled:opacity-50 disabled:cursor-not-allowed",
          {
            primary:
              "bg-blue-600 text-white hover:bg-blue-700 focus-visible:ring-blue-500",
            secondary:
              "bg-white text-gray-700 border border-gray-200 hover:bg-gray-50 focus-visible:ring-gray-400",
            ghost:
              "text-gray-600 hover:bg-gray-100 hover:text-gray-900 focus-visible:ring-gray-400",
            danger:
              "bg-red-600 text-white hover:bg-red-700 focus-visible:ring-red-500",
          }[variant],
          {
            sm: "px-3 py-1.5 text-xs",
            md: "px-4 py-2 text-sm",
            lg: "px-6 py-3 text-base",
          }[size],
          className
        )}
        {...props}
      />
    );
  }
);

Button.displayName = "Button";
