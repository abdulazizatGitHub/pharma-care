import React from "react";

interface EmptyStateProps {
  icon: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center gap-4">
      <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-400">
        {icon}
      </div>
      <div>
        <p className="text-base font-semibold text-slate-700">{title}</p>
        {description && (
          <p className="text-sm text-slate-400 mt-1 max-w-xs mx-auto">{description}</p>
        )}
      </div>
      {action && <div>{action}</div>}
    </div>
  );
}
