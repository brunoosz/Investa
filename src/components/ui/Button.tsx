import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { motion } from "framer-motion";
import { Loader2, type LucideIcon } from "lucide-react";
import clsx from "clsx";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "outline" | "success";
type Size = "sm" | "md" | "lg" | "icon" | "icon-sm";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-brand text-white shadow-glow hover:brightness-110 disabled:shadow-none",
  secondary: "bg-line/[0.08] text-fg hover:bg-line/[0.14] border border-separator/10",
  ghost: "text-muted hover:text-fg hover:bg-line/[0.08]",
  danger: "bg-danger/10 text-danger hover:bg-danger/20",
  outline: "border border-separator/15 text-fg hover:bg-line/[0.06]",
  success: "bg-success text-white hover:brightness-110",
};

const SIZES: Record<Size, string> = {
  sm: "h-8 px-3 text-footnote font-semibold rounded-chip gap-1.5",
  md: "h-10 px-4 text-callout font-semibold rounded-control gap-2",
  lg: "h-12 px-6 text-body font-semibold rounded-control gap-2",
  icon: "h-10 w-10 rounded-control",
  "icon-sm": "h-8 w-8 rounded-chip",
};

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onAnimationStart" | "onDrag" | "onDragStart" | "onDragEnd"> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: LucideIcon;
  iconRight?: LucideIcon;
  children?: ReactNode;
  block?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", loading, icon: Icon, iconRight: IconRight, children, className, block, disabled, type = "button", ...rest },
  ref
) {
  const iconSize = size === "sm" || size === "icon-sm" ? 15 : size === "lg" ? 19 : 17;
  return (
    <motion.button
      ref={ref}
      type={type}
      whileTap={disabled || loading ? undefined : { scale: 0.97 }}
      transition={{ type: "spring", stiffness: 600, damping: 30 }}
      disabled={disabled || loading}
      className={clsx(
        "no-drag inline-flex items-center justify-center font-semibold transition-[background,filter,color,box-shadow] duration-150 select-none outline-none focus-visible:ring-4 focus-visible:ring-primary/25 disabled:opacity-45 disabled:cursor-not-allowed",
        VARIANTS[variant],
        SIZES[size],
        block && "w-full",
        className
      )}
      {...rest}
    >
      {loading ? <Loader2 size={iconSize} className="animate-spin" /> : Icon ? <Icon size={iconSize} strokeWidth={2.2} /> : null}
      {children}
      {IconRight && !loading ? <IconRight size={iconSize} strokeWidth={2.2} /> : null}
    </motion.button>
  );
});
