import { X } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';

export function IconButton({
  icon,
  label,
  hotkey,
  active,
  disabled,
  onClick,
  className,
  tipSide = 'left',
}: {
  icon: ReactNode;
  label: string;
  hotkey?: string;
  active?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  className?: string;
  tipSide?: 'left' | 'right' | 'top' | 'bottom';
}) {
  const tip = hotkey ? `${label} (${hotkey})` : label;
  return (
    <button
      type="button"
      className={['icon-btn', active ? 'active' : '', className ?? ''].join(' ')}
      aria-label={tip}
      aria-pressed={active}
      data-tip={tip}
      data-tip-side={tipSide}
      disabled={disabled}
      onClick={onClick}
    >
      {icon}
    </button>
  );
}

export function Panel({
  children,
  className,
  ...rest
}: { children: ReactNode; className?: string } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={'panel ' + (className ?? '')} {...rest}>
      {children}
    </div>
  );
}

export function Modal({
  title,
  onClose,
  children,
  footer,
  wide,
  className,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
  className?: string;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        className={['modal panel', wide ? 'wide' : '', className ?? ''].join(' ')}
        role="dialog"
        aria-label={title}
      >
        <header className="modal-head">
          <h2>{title}</h2>
          <button type="button" className="icon-btn small" aria-label="Закрыть" onClick={onClose}>
            <X size={18} />
          </button>
        </header>
        <div className="modal-body">{children}</div>
        {footer ? <footer className="modal-foot">{footer}</footer> : null}
      </div>
    </div>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: ReactNode }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <span className="field-control">{children}</span>
      {hint ? <span className="field-hint">{hint}</span> : null}
    </label>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className={'toggle' + (checked ? ' on' : '')}
      onClick={() => onChange(!checked)}
    >
      <span className="toggle-knob" />
    </button>
  );
}

/** Segmented choice between a few values. */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: ReactNode; title?: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="segmented" role="radiogroup">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          title={o.title}
          className={value === o.value ? 'on' : ''}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/**
 * Number input that keeps the typed text while focused and commits a parsed number;
 * a comma works as the decimal separator.
 */
export function NumberInput({
  value,
  onChange,
  decimals = 2,
  min,
  max,
  step = 1,
  className,
  ariaLabel,
}: {
  value: number;
  onChange: (v: number) => void;
  decimals?: number;
  min?: number;
  max?: number;
  step?: number;
  className?: string;
  ariaLabel?: string;
}) {
  const format = (v: number) =>
    Number.isFinite(v) ? String(Math.round(v * 10 ** decimals) / 10 ** decimals) : '';
  const [text, setText] = useState(format(value));
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setText(format(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, decimals]);
  const commit = (s: string) => {
    const n = Number(s.replace(',', '.'));
    if (!Number.isFinite(n) || s.trim() === '') return;
    let v = n;
    if (min !== undefined) v = Math.max(min, v);
    if (max !== undefined) v = Math.min(max, v);
    onChange(v);
  };
  return (
    <input
      className={'num ' + (className ?? '')}
      inputMode="decimal"
      aria-label={ariaLabel}
      value={text}
      onFocus={() => (focused.current = true)}
      onBlur={() => {
        focused.current = false;
        setText(format(value));
      }}
      onChange={(e) => {
        setText(e.target.value);
        commit(e.target.value);
      }}
      onKeyDown={(e) => {
        if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
          e.preventDefault();
          e.stopPropagation();
          const d = (e.key === 'ArrowUp' ? 1 : -1) * step * (e.shiftKey ? 10 : 1);
          const n = Number(text.replace(',', '.'));
          const next = (Number.isFinite(n) ? n : value) + d;
          setText(format(next));
          commit(String(next));
        } else if (e.key === 'Enter') {
          (e.target as HTMLInputElement).blur();
        }
      }}
    />
  );
}

export function ColorSwatches({
  value,
  colors,
  onChange,
  names,
}: {
  value: string;
  colors: string[];
  onChange: (c: string) => void;
  names?: string[];
}) {
  const custom = !colors.includes(value.toLowerCase());
  return (
    <div className="swatches">
      {colors.map((c, i) => (
        <button
          key={c}
          type="button"
          className={'swatch' + (value.toLowerCase() === c ? ' on' : '')}
          style={{ background: c }}
          aria-label={names?.[i] ?? c}
          title={names?.[i] ?? c}
          onClick={() => onChange(c)}
        />
      ))}
      <label
        className={'swatch custom' + (custom ? ' on' : '')}
        title="Свой цвет"
        style={custom ? { background: value } : undefined}
      >
        <input
          type="color"
          value={/^#[0-9a-f]{6}$/i.test(value) ? value : '#000000'}
          onChange={(e) => onChange(e.target.value)}
        />
      </label>
    </div>
  );
}

/** Closes when clicking outside of `ref`. */
export function useClickOutside(
  ref: React.RefObject<HTMLElement | null>,
  onOutside: () => void,
  active = true,
) {
  useEffect(() => {
    if (!active) return;
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onOutside();
    };
    window.addEventListener('pointerdown', onDown, true);
    return () => window.removeEventListener('pointerdown', onDown, true);
  }, [ref, onOutside, active]);
}
