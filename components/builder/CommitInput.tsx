'use client';
import { useEffect, useState } from 'react';
import { toDecimalString, toPaise } from '@/lib/domain/money';

/** Text input that keeps what you type while editing and commits parsed values as soon as they are valid. */
function CommitInput<T>({ value, toText, fromText, onCommit, className = '', ...rest }: {
  value: T; toText: (v: T) => string; fromText: (t: string) => T | null; onCommit: (v: T) => void;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>) {
  const [text, setText] = useState(toText(value));
  const [focus, setFocus] = useState(false);
  useEffect(() => { if (!focus) setText(toText(value)); }, [value, focus]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <input {...rest} value={text} className={`input num ${className}`}
      onFocus={(e) => { setFocus(true); e.target.select(); rest.onFocus?.(e); }}
      onBlur={(e) => { setFocus(false); rest.onBlur?.(e); }}
      onChange={(e) => {
        setText(e.target.value);
        const v = fromText(e.target.value);
        if (v !== null) onCommit(v);
      }} />
  );
}

export function MoneyInput({ paise, onChange, ...p }: { paise: number; onChange: (p: number) => void } & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>) {
  return <CommitInput {...p} inputMode="decimal" value={paise} toText={toDecimalString}
    fromText={(t) => { try { const v = toPaise(t); return v >= 0 ? v : null; } catch { return null; } }} onCommit={onChange} />;
}

export function NumberInput({ value, onChange, max, ...p }: { value: number; onChange: (n: number) => void; max?: number } & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>) {
  return <CommitInput {...p} inputMode="decimal" value={value} toText={(n) => String(n)}
    fromText={(t) => { const n = Number(t); return t.trim() !== '' && Number.isFinite(n) && n >= 0 && (max === undefined || n <= max) ? Math.round(n * 1000) / 1000 : null; }} onCommit={onChange} />;
}
