import { forwardRef, useEffect, useId, useState, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { motion } from "framer-motion";
import { Eye, EyeOff, type LucideIcon } from "lucide-react";
import clsx from "clsx";
import { num, parseMoney } from "@/lib/format";

export function Field({ label, error, hint, children, className }: { label?: ReactNode; error?: string | null; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={className}>
      {label && <label className="label">{label}</label>}
      {children}
      {error ? <p className="text-[12.5px] text-danger mt-1.5">{error}</p> : hint ? <p className="text-[12.5px] text-muted mt-1.5">{hint}</p> : null}
    </div>
  );
}

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  icon?: LucideIcon;
  invalid?: boolean;
  suffix?: ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input({ icon: Icon, invalid, suffix, className, ...rest }, ref) {
  return (
    <div className="relative">
      {Icon && <Icon size={17} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />}
      <input ref={ref} className={clsx("field", Icon && "pl-10", suffix && "pr-12", invalid && "field-error", className)} {...rest} />
      {suffix && <div className="absolute right-3 top-1/2 -translate-y-1/2 text-muted text-[13px]">{suffix}</div>}
    </div>
  );
});

export const PasswordInput = forwardRef<HTMLInputElement, InputProps>(function PasswordInput({ icon: Icon, invalid, className, ...rest }, ref) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      {Icon && <Icon size={17} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />}
      <input ref={ref} type={show ? "text" : "password"} className={clsx("field pr-11", Icon && "pl-10", invalid && "field-error", className)} {...rest} />
      <button
        type="button"
        tabIndex={-1}
        onClick={() => setShow((s) => !s)}
        className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8 rounded-lg flex items-center justify-center text-muted hover:text-fg hover:bg-line/10"
        aria-label={show ? "Ocultar senha" : "Mostrar senha"}
      >
        {show ? <EyeOff size={17} /> : <Eye size={17} />}
      </button>
    </div>
  );
});

export function MoneyInput({
  value,
  onChange,
  placeholder = "0,00",
  invalid,
  autoFocus,
  prefix = "R$",
  decimals = 2,
}: {
  value: number;
  onChange: (v: number) => void;
  placeholder?: string;
  invalid?: boolean;
  autoFocus?: boolean;
  prefix?: string;
  decimals?: number;
}) {
  const [text, setText] = useState(value ? num(value, decimals) : "");
  useEffect(() => {
    if (parseMoney(text) !== value) setText(value ? num(value, decimals) : "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <div className="relative">
      {prefix && <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted text-[15px] pointer-events-none">{prefix}</span>}
      <input
        className={clsx("field tabular", prefix && "pl-10", invalid && "field-error")}
        inputMode="decimal"
        placeholder={placeholder}
        autoFocus={autoFocus}
        value={text}
        onChange={(e) => {
          const t = e.target.value.replace(/[^\d.,-]/g, "");
          setText(t);
          onChange(parseMoney(t));
        }}
        onBlur={() => setText(value ? num(value, decimals) : "")}
      />
    </div>
  );
}

export function NumberInput({ value, onChange, suffix, step = 1, min, max, decimals = 2, invalid }: { value: number; onChange: (v: number) => void; suffix?: ReactNode; step?: number; min?: number; max?: number; decimals?: number; invalid?: boolean }) {
  const [text, setText] = useState(value || value === 0 ? num(value, decimals).replace(/,00$/, "") : "");
  useEffect(() => {
    if (parseMoney(text) !== value) setText(value || value === 0 ? num(value, decimals).replace(/,00$/, "") : "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <div className="relative">
      <input
        className={clsx("field tabular", suffix && "pr-14", invalid && "field-error")}
        inputMode="decimal"
        value={text}
        step={step}
        onChange={(e) => {
          const t = e.target.value.replace(/[^\d.,-]/g, "");
          setText(t);
          let v = parseMoney(t);
          if (min !== undefined) v = Math.max(min, v);
          if (max !== undefined) v = Math.min(max, v);
          onChange(v);
        }}
      />
      {suffix && <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted text-[14px] pointer-events-none">{suffix}</span>}
    </div>
  );
}

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="relative">
      <select className={clsx("field appearance-none pr-9 cursor-pointer", className)} {...rest}>
        {children}
      </select>
      <svg className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
        <path d="m6 9 6 6 6-6" />
      </svg>
    </div>
  );
}

export function Textarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={clsx("field h-auto py-2.5 min-h-[84px] resize-none", className)} {...rest} />;
}

export function Toggle({ checked, onChange, disabled, label }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; label?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={clsx("no-drag relative h-[30px] w-[50px] rounded-full transition-colors duration-200 shrink-0 disabled:opacity-50", checked ? "bg-primary" : "bg-line/25")}
    >
      <motion.span
        className="absolute top-[3px] left-0 h-6 w-6 rounded-full bg-white shadow-[0_2px_6px_rgba(0,0,0,0.25)]"
        animate={{ x: checked ? 23 : 3 }}
        transition={{ type: "spring", stiffness: 700, damping: 38 }}
      />
    </button>
  );
}

export interface SegmentOption<T extends string> {
  value: T;
  label: ReactNode;
  icon?: LucideIcon;
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  size = "md",
  className,
  block,
}: {
  options: SegmentOption<T>[];
  value: T;
  onChange: (v: T) => void;
  size?: "sm" | "md";
  className?: string;
  block?: boolean;
}) {
  const id = useId();
  return (
    <div className={clsx("no-drag relative inline-flex max-w-full overflow-x-auto no-scrollbar p-1 rounded-xl bg-line/[0.08] border border-line/10 [&>button]:shrink-0", block && "w-full", className)}>
      {options.map((o) => {
        const active = o.value === value;
        const Icon = o.icon;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className={clsx(
              "relative flex-1 inline-flex items-center justify-center gap-1.5 font-semibold whitespace-nowrap transition-colors",
              size === "sm" ? "h-7 px-2.5 text-[12.5px] rounded-lg" : "h-8 px-3.5 text-[13.5px] rounded-[10px]",
              active ? "text-fg" : "text-muted hover:text-fg"
            )}
          >
            {active && (
              <motion.span
                layoutId={`seg-${id}`}
                className="absolute inset-0 rounded-[inherit] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.12)] dark:bg-white/[0.14] dark:shadow-none"
                transition={{ type: "spring", stiffness: 500, damping: 38 }}
              />
            )}
            <span className="relative inline-flex items-center gap-1.5">
              {Icon && <Icon size={14} strokeWidth={2.2} />}
              {o.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function Chip({ active, children, onClick, icon: Icon }: { active?: boolean; children: ReactNode; onClick?: () => void; icon?: LucideIcon }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        "no-drag inline-flex items-center gap-1.5 h-8 px-3 rounded-full text-[13px] font-medium border transition whitespace-nowrap",
        active ? "bg-primary/15 border-primary/40 text-primary" : "border-line/15 text-muted hover:text-fg hover:bg-line/[0.06]"
      )}
    >
      {Icon && <Icon size={14} />}
      {children}
    </button>
  );
}

/** Dia do mês (1 a 31). */
export function DayInput({ value, onChange, placeholder }: { value?: number; onChange: (v: number | undefined) => void; placeholder?: string }) {
  return (
    <Input
      inputMode="numeric"
      value={value ?? ""}
      onChange={(e) => {
        const n = Number(e.target.value.replace(/\D/g, "").slice(0, 2));
        onChange(n >= 1 ? Math.min(31, n) : undefined);
      }}
      placeholder={placeholder}
    />
  );
}
