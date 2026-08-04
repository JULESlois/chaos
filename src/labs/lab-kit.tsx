/**
 * The bits every lab needs and none of them should be writing twice.
 *
 * Labs are developer tools, not part of the work — they are held to a lower
 * standard of polish and a higher standard of directness. Nothing here is
 * themed, animated or responsive; it is a stack of native inputs over a dark
 * box, sized so it does not cover the thing being looked at.
 */

export const PANEL: React.CSSProperties = {
  position: 'fixed',
  top: 12,
  right: 12,
  zIndex: 1000,
  width: 250,
  maxHeight: 'calc(100vh - 24px)',
  overflowY: 'auto',
  padding: 12,
  background: 'rgba(7,2,3,0.88)',
  border: '1px solid #321016',
  color: '#e68a98',
  font: '11px/1.5 monospace',
  borderRadius: 4,
};

export const BUTTON: React.CSSProperties = {
  flex: 1,
  background: '#321016',
  color: '#ffc0c9',
  border: '1px solid #6b2933',
  font: '11px monospace',
  padding: '4px 0',
  cursor: 'pointer',
};

export const CANVAS: React.CSSProperties = {
  display: 'block',
  position: 'fixed',
  inset: 0,
};

export function Title(props: { children: React.ReactNode }): React.JSX.Element {
  return (
    <strong style={{ display: 'block', marginBottom: 8, color: '#ffc0c9' }}>
      {props.children}
    </strong>
  );
}

export function Group(props: { label: string }): React.JSX.Element {
  return (
    <div
      style={{
        marginTop: 10,
        marginBottom: 4,
        paddingTop: 6,
        borderTop: '1px solid #321016',
        opacity: 0.65,
        letterSpacing: 1,
      }}
    >
      {props.label.toUpperCase()}
    </div>
  );
}

export function Slider(props: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  decimals?: number;
  onChange: (value: number) => void;
}): React.JSX.Element {
  const { decimals = 2, step = 0.01 } = props;
  return (
    <label style={{ display: 'block', marginBottom: 6 }}>
      <span style={{ display: 'block', opacity: 0.8 }}>
        {props.label} {props.value.toFixed(decimals)}
      </span>
      <input
        type="range"
        min={props.min}
        max={props.max}
        step={step}
        value={props.value}
        onChange={(event) => props.onChange(Number(event.target.value))}
        style={{ width: '100%' }}
      />
    </label>
  );
}

export function Toggle(props: {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
}): React.JSX.Element {
  return (
    <label style={{ display: 'block', marginBottom: 6 }}>
      <input
        type="checkbox"
        checked={props.value}
        onChange={(event) => props.onChange(event.target.checked)}
        style={{ marginRight: 6 }}
      />
      <span style={{ opacity: 0.8 }}>{props.label}</span>
    </label>
  );
}

/** Reads a query parameter as a number, falling back when absent or junk. */
export function queryNumber(key: string, fallback: number): number {
  if (typeof window === 'undefined') return fallback;
  const raw = new URLSearchParams(window.location.search).get(key);
  const value = raw === null ? NaN : Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

export function queryFlag(key: string): boolean {
  if (typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).get(key) === '1';
}

/**
 * `clean=1` strips the panel so a lab can produce a bare frame.
 *
 * The screenshot script relies on this: a poster with a control panel bolted
 * to the corner is not evidence of anything.
 */
export function showPanel(): boolean {
  return !queryFlag('clean');
}

/** Saves the canvas as a PNG. Labs bind this to a button and to `e`. */
export function downloadCanvas(canvas: HTMLCanvasElement, name: string): void {
  const link = document.createElement('a');
  link.href = canvas.toDataURL('image/png');
  link.download = `${name}.png`;
  link.click();
}
