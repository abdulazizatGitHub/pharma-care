export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "success";
export type ButtonSize = "sm" | "md" | "lg";

const variantStyles: Record<ButtonVariant, string> = {
  primary:   "bg-[#0F6E56] text-white hover:bg-[#0a5a45] active:bg-[#0a5a45]",
  secondary: "bg-white text-[#111827] border border-[rgba(0,0,0,0.15)] hover:bg-[#f9fafb]",
  ghost:     "text-[#111827] hover:bg-[#f3f4f6]",
  danger:    "bg-[#FCEBEB] text-[#A32D2D] border border-[#f09595] hover:bg-[#fde8e8]",
  success:   "bg-emerald-600 text-white hover:bg-emerald-700 active:bg-emerald-800",
};

const sizeStyles: Record<ButtonSize, string> = {
  sm: "h-7 px-3 text-[11px] rounded-md gap-1.5",
  md: "h-8 px-3.5 text-[12px] rounded-md gap-2",
  lg: "h-9 px-4 text-[13px] rounded-md gap-2",
};

export function buttonVariants(variant: ButtonVariant = "primary", size: ButtonSize = "md"): string {
  return `inline-flex items-center justify-center font-medium transition-all duration-150 whitespace-nowrap focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0F6E56] focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed ${variantStyles[variant]} ${sizeStyles[size]}`;
}
