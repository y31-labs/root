import { Badge } from '@workspace/ui/components/ui/badge';
import { Button } from '@workspace/ui/components/ui/button';
import { Input } from '@workspace/ui/components/ui/input';
import { Label } from '@workspace/ui/components/ui/label';
import { Separator } from '@workspace/ui/components/ui/separator';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@workspace/ui/components/ui/table';
import { Textarea } from '@workspace/ui/components/ui/textarea';
import type { CSSProperties, HTMLAttributes, ReactNode } from 'react';

interface ChildrenProps {
  children: ReactNode;
  className?: string;
}

export function Page({
  actions,
  children,
  description,
  title,
}: ChildrenProps & { actions?: ReactNode; description?: string; title: string }) {
  return (
    <main className='mx-auto w-full max-w-6xl space-y-8 px-5 py-8 md:px-10 md:py-10'>
      <header className='flex flex-col justify-between gap-4 border-b pb-6 sm:flex-row sm:items-end'>
        <div className='space-y-1'>
          <h1 className='text-2xl font-medium tracking-tight'>{title}</h1>
          {description ? <p className='text-sm text-muted-foreground'>{description}</p> : null}
        </div>
        {actions ? <div className='flex flex-wrap items-center gap-2'>{actions}</div> : null}
      </header>
      {children}
    </main>
  );
}

export function Section({
  children,
  description,
  title,
}: ChildrenProps & { description?: string; title?: string }) {
  return (
    <section className='space-y-4'>
      {title || description ? (
        <div className='space-y-1'>
          {title ? <h2 className='font-medium'>{title}</h2> : null}
          {description ? <p className='text-sm text-muted-foreground'>{description}</p> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function Stack({
  children,
  className = '',
  gap = 'md',
}: ChildrenProps & { gap?: 'lg' | 'md' | 'sm' }) {
  const gapClass = gap === 'lg' ? 'gap-6' : gap === 'sm' ? 'gap-2' : 'gap-4';
  return <div className={`flex flex-col ${gapClass} ${className}`}>{children}</div>;
}

export function Inline({ children, className = '' }: ChildrenProps) {
  return <div className={`flex flex-wrap items-center gap-3 ${className}`}>{children}</div>;
}

export function Grid({
  children,
  className = '',
  columns = 2,
}: ChildrenProps & { columns?: 1 | 2 | 3 | 4 }) {
  const columnsClass =
    columns === 4
      ? 'md:grid-cols-4'
      : columns === 3
        ? 'md:grid-cols-3'
        : columns === 2
          ? 'md:grid-cols-2'
          : 'grid-cols-1';
  return <div className={`grid grid-cols-1 gap-5 ${columnsClass} ${className}`}>{children}</div>;
}

export function Surface({ children, className = '' }: ChildrenProps) {
  return <div className={`border-y py-5 ${className}`}>{children}</div>;
}

export function Field({ children, hint, label }: ChildrenProps & { hint?: string; label: string }) {
  return (
    <div className='space-y-2'>
      <Label>{label}</Label>
      {children}
      {hint ? <p className='text-xs text-muted-foreground'>{hint}</p> : null}
    </div>
  );
}

export function SliderField({
  label,
  max,
  min,
  onChange,
  step = 1,
  value,
}: {
  label: string;
  max: number;
  min: number;
  onChange: (value: number) => void;
  step?: number;
  value: number;
}) {
  return (
    <div className='space-y-2'>
      <div className='flex items-center justify-between gap-4'>
        <Label>{label}</Label>
        <output className='text-sm tabular-nums text-muted-foreground'>{value}</output>
      </div>
      <input
        aria-label={label}
        className='h-2 w-full cursor-pointer accent-primary'
        max={max}
        min={min}
        step={step}
        type='range'
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </div>
  );
}

export function SelectField({
  label,
  onChange,
  options,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  options: Array<{ label: string; value: string }>;
  value: string;
}) {
  return (
    <div className='space-y-2'>
      <Label>{label}</Label>
      <select
        className='h-9 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50'
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export function SwitchField({
  checked,
  description,
  label,
  onChange,
}: {
  checked: boolean;
  description?: string;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className='flex cursor-pointer items-start justify-between gap-4 border-y py-3'>
      <span>
        <span className='block text-sm font-medium'>{label}</span>
        {description ? (
          <span className='block text-xs text-muted-foreground'>{description}</span>
        ) : null}
      </span>
      <input
        checked={checked}
        className='mt-0.5 size-4 accent-primary'
        type='checkbox'
        onChange={(event) => onChange(event.target.checked)}
      />
    </label>
  );
}

export function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className='border-y py-4'>
      <p className='text-xs text-muted-foreground'>{label}</p>
      <p className='mt-1 text-xl font-medium tabular-nums'>{value}</p>
    </div>
  );
}

export function DataTable({
  columns,
  rows,
}: {
  columns: Array<{ key: string; label: string }>;
  rows: Array<Record<string, ReactNode>>;
}) {
  return (
    <div className='overflow-x-auto border-y'>
      <Table>
        <TableHeader>
          <TableRow>
            {columns.map((column) => (
              <TableHead key={column.key}>{column.label}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row, index) => (
            <TableRow key={index}>
              {columns.map((column) => (
                <TableCell key={column.key}>{row[column.key]}</TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export function AppStyles({ children }: { children: string }) {
  return <style>{children}</style>;
}

export function Box({ children, className, style }: ChildrenProps & { style?: CSSProperties }) {
  return (
    <div className={className} style={style}>
      {children}
    </div>
  );
}

export type ElementProps = HTMLAttributes<HTMLElement>;
export { Badge, Button, Input, Label, Separator, Textarea };
