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
      <div className="flex flex-col gap-1.5">
        <label
          htmlFor={fieldId}
          className="text-sm font-medium text-slate-700"
        >
          {label}
          {props.required && <span className="text-rose-500 ml-1">*</span>}
        </label>
        <input
          ref={ref}
          id={fieldId}
          {...props}
          className={`
            h-11 w-full rounded-xl border px-3.5 text-sm text-slate-800
            placeholder:text-slate-400 bg-white
            transition-colors duration-150
            focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent
            disabled:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed
            ${error ? "border-rose-400 focus:ring-rose-400" : "border-slate-200 hover:border-slate-300"}
            ${className}
          `}
          aria-describedby={error ? `${fieldId}-error` : hint ? `${fieldId}-hint` : undefined}
          aria-invalid={!!error}
        />
        {error && (
          <p id={`${fieldId}-error`} role="alert" className="text-xs text-rose-600 flex items-center gap-1">
            <span>⚠</span> {error}
          </p>
        )}
        {hint && !error && (
          <p id={`${fieldId}-hint`} className="text-xs text-slate-400">
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
}

export function Select({ label, error, id, children, className = "", ...props }: SelectProps) {
  const fieldId = id ?? `select-${label.toLowerCase().replace(/\s+/g, "-")}`;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={fieldId} className="text-sm font-medium text-slate-700">
        {label}
        {props.required && <span className="text-rose-500 ml-1">*</span>}
      </label>
      <select
        id={fieldId}
        {...props}
        className={`
          h-11 w-full rounded-xl border px-3.5 text-sm text-slate-800 bg-white
          transition-colors duration-150
          focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent
          ${error ? "border-rose-400" : "border-slate-200 hover:border-slate-300"}
          ${className}
        `}
        aria-invalid={!!error}
      >
        {children}
      </select>
      {error && (
        <p role="alert" className="text-xs text-rose-600">
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
    <div className="flex flex-col gap-1.5">
      <label htmlFor={fieldId} className="text-sm font-medium text-slate-700">
        {label}
        {props.required && <span className="text-rose-500 ml-1">*</span>}
      </label>
      <textarea
        id={fieldId}
        {...props}
        className={`
          w-full rounded-xl border px-3.5 py-2.5 text-sm text-slate-800 bg-white
          placeholder:text-slate-400 resize-none
          focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent
          ${error ? "border-rose-400" : "border-slate-200 hover:border-slate-300"}
          ${className}
        `}
      />
      {error && <p role="alert" className="text-xs text-rose-600">⚠ {error}</p>}
    </div>
  );
}
