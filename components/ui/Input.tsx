"use client";

import React, { forwardRef } from "react";

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  hint?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, hint, id, className = "", ...props }, ref) => {
    const fieldId = id ?? `field-${label.toLowerCase().replace(/\s+/g, "-")}`;
    return (
      <div className="flex flex-col gap-1">
        <label
          htmlFor={fieldId}
          className="text-[11px] font-medium text-[#6b7280]"
        >
          {label}
          {props.required && <span className="text-[#E24B4A] ml-1">*</span>}
        </label>
        <input
          ref={ref}
          id={fieldId}
          {...props}
          className={`
            h-8 w-full rounded-md px-2.5 text-[12px] text-[#111827]
            placeholder:text-[#9ca3af] bg-white
            transition-colors duration-150
            focus:outline-none focus:ring-2 focus:ring-[#0F6E56] focus:border-transparent
            disabled:bg-[#f9fafb] disabled:text-[#9ca3af] disabled:cursor-not-allowed
            ${error
              ? "border border-[#E24B4A] focus:ring-[#E24B4A]"
              : "border border-[rgba(0,0,0,0.15)] hover:border-[rgba(0,0,0,0.25)]"
            }
            ${className}
          `}
          aria-describedby={error ? `${fieldId}-error` : hint ? `${fieldId}-hint` : undefined}
          aria-invalid={!!error}
        />
        {error && (
          <p id={`${fieldId}-error`} role="alert" className="text-[11px] text-[#A32D2D] flex items-center gap-1">
            <span>⚠</span> {error}
          </p>
        )}
        {hint && !error && (
          <p id={`${fieldId}-hint`} className="text-[11px] text-[#9ca3af]">
            {hint}
          </p>
        )}
      </div>
    );
  }
);

Input.displayName = "Input";

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  error?: string;
  children: React.ReactNode;
  labelClassName?: string;
}

export function Select({ label, error, id, children, className = "", labelClassName = "", ...props }: SelectProps) {
  const fieldId = id ?? `select-${label.toLowerCase().replace(/\s+/g, "-")}`;
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={fieldId} className={`text-[11px] font-medium text-[#6b7280] ${labelClassName}`}>
        {label}
        {props.required && <span className="text-[#E24B4A] ml-1">*</span>}
      </label>
      <select
        id={fieldId}
        {...props}
        className={`
          h-8 w-full rounded-md px-2.5 text-[12px] text-[#111827] bg-white
          transition-colors duration-150
          focus:outline-none focus:ring-2 focus:ring-[#0F6E56] focus:border-transparent
          ${error
            ? "border border-[#E24B4A]"
            : "border border-[rgba(0,0,0,0.15)] hover:border-[rgba(0,0,0,0.25)]"
          }
          ${className}
        `}
        aria-invalid={!!error}
      >
        {children}
      </select>
      {error && (
        <p role="alert" className="text-[11px] text-[#A32D2D]">
          ⚠ {error}
        </p>
      )}
    </div>
  );
}

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string;
  error?: string;
}

export function Textarea({ label, error, id, className = "", ...props }: TextareaProps) {
  const fieldId = id ?? `textarea-${label.toLowerCase().replace(/\s+/g, "-")}`;
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={fieldId} className="text-[11px] font-medium text-[#6b7280]">
        {label}
        {props.required && <span className="text-[#E24B4A] ml-1">*</span>}
      </label>
      <textarea
        id={fieldId}
        {...props}
        className={`
          w-full rounded-md px-2.5 py-2 text-[12px] text-[#111827] bg-white
          placeholder:text-[#9ca3af] resize-none
          focus:outline-none focus:ring-2 focus:ring-[#0F6E56] focus:border-transparent
          ${error
            ? "border border-[#E24B4A]"
            : "border border-[rgba(0,0,0,0.15)] hover:border-[rgba(0,0,0,0.25)]"
          }
          ${className}
        `}
      />
      {error && <p role="alert" className="text-[11px] text-[#A32D2D]">⚠ {error}</p>}
    </div>
  );
}
