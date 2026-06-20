import React from "react";

interface CardProps {
  children: React.ReactNode;
  className?: string;
  padding?: "sm" | "md" | "lg";
}

const paddingStyles = {
  sm: "px-3 py-2.5",
  md: "px-3.5 py-3",
  lg: "px-5 py-4",
};

export function Card({ children, className = "", padding = "md" }: CardProps) {
  return (
    <div
      style={{ border: '0.5px solid rgba(0,0,0,0.08)' }}
      className={`bg-white rounded-lg ${paddingStyles[padding]} ${className}`}
    >
      {children}
    </div>
  );
}
