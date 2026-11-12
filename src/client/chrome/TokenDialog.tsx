import { useState } from 'react';
import { setToken } from '../api/client.ts';
import { Button } from '../ui/Button.tsx';
import { Field, Input } from '../ui/Field.tsx';

export function TokenDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [value, setValue] = useState('');
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[hsl(var(--fg)/0.24)]">
      <div className="w-[360px] rounded-[12px] border border-[hsl(var(--border))] bg-[hsl(var(--surface))] p-4 shadow-[var(--shadow-lg)]">
        <h2 className="mb-3 text-[14px] font-medium">Access token</h2>
        <Field label="Bearer token">
          <Input value={value} onChange={(e) => setValue(e.target.value)} autoFocus />
        </Field>
        <div className="mt-3 flex justify-end gap-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            onClick={() => {
              setToken(value);
              onClose();
            }}
          >
            Store
          </Button>
        </div>
      </div>
    </div>
  );
}
