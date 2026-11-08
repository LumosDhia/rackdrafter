import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

const variants: Record<Variant, string> = {
  primary: 'bg-[hsl(var(--accent))] text-[hsl(var(--accent-fg))] border-transparent',
  secondary: 'bg-[hsl(var(--surface))] text-[hsl(var(--fg))] border-[hsl(var(--border))]',
  ghost: 'bg-transparent text-[hsl(var(--fg))] border-transparent hover:bg-[hsl(var(--surface-2))]',
  danger: 'bg-[hsl(var(--danger))] text-white border-transparent',
};

export function Button({
  variant = 'secondary',
  size = 28,
  children,
  className = '',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: 28 | 32;
  children?: ReactNode;
}) {
  return (
    <button
      type="button"
      className={`inline-flex items-center justify-center gap-1.5 rounded-[6px] border px-2.5 text-[13px] font-medium ${variants[variant]} ${className}`}
      style={{ height: size }}
      {...rest}
    >
      {children}
    </button>
  );
}

export function IconButton({
  label,
  children,
  className = '',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={`inline-flex h-7 w-7 items-center justify-center rounded-[6px] border border-transparent text-[hsl(var(--fg-muted))] hover:bg-[hsl(var(--surface-2))] ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}
