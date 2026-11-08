import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react';

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[12px] text-[hsl(var(--fg-muted))]">{label}</span>
      {children}
    </label>
  );
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`h-8 rounded-[4px] border border-[hsl(var(--border))] bg-[hsl(var(--surface-2))] px-2 text-[13px] ${props.className ?? ''}`}
    />
  );
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={`h-8 rounded-[4px] border border-[hsl(var(--border))] bg-[hsl(var(--surface-2))] px-2 text-[13px] ${props.className ?? ''}`}
    />
  );
}
