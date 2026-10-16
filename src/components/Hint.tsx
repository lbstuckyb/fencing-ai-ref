import { useCallback, useId, useRef, useState } from 'react';
import type { ReactNode } from 'react';

/**
 * The "?" — where an explanation lives once it has been taken off the page.
 *
 * Opens on hover and on keyboard focus, and a click pins it so it also works on
 * a touch screen, where neither of those exists. The text is only in the
 * document while it is showing.
 */

interface HintProps {
  children: ReactNode;
  /** Accessible name of the button. */
  label?: string;
  /** Which edge of the button the panel lines up with. */
  align?: 'left' | 'right';
  /** Whether the panel opens below or above the button. */
  placement?: 'below' | 'above';
  className?: string;
}

export default function Hint({
  children,
  label = 'More info',
  align = 'right',
  placement = 'below',
  className = '',
}: HintProps) {
  const id = useId();
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [pinned, setPinned] = useState(false);
  /**
   * A press focuses the button before it clicks it. Without this, that focus
   * would open the panel and the click would then be the one to close it.
   */
  const pressingRef = useRef(false);

  const close = useCallback(() => {
    setHovered(false);
    setFocused(false);
    setPinned(false);
  }, []);

  const open = hovered || focused || pinned;

  return (
    <span
      className={`relative inline-flex ${className}`}
      onPointerEnter={(event) => {
        if (event.pointerType === 'mouse') setHovered(true);
      }}
      onPointerLeave={() => setHovered(false)}
    >
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-describedby={open ? id : undefined}
        onPointerDown={() => {
          pressingRef.current = true;
        }}
        onFocus={() => {
          if (!pressingRef.current) setFocused(true);
        }}
        onBlur={() => {
          pressingRef.current = false;
          setFocused(false);
          setPinned(false);
        }}
        onClick={() => {
          pressingRef.current = false;
          setPinned((value) => !value);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') close();
        }}
        className="focusable pointer-events-auto flex h-6 w-6 items-center justify-center rounded-full border border-line font-display text-sm font-bold leading-none text-mute transition-colors hover:border-chalk hover:text-chalk"
      >
        ?
      </button>
      {open ? (
        <span
          id={id}
          role="tooltip"
          className={`absolute z-40 w-64 border border-line bg-panel p-3 text-left font-sans text-sm font-normal normal-case leading-snug tracking-normal text-chalk shadow-2xl ${
            align === 'right' ? 'right-0' : 'left-0'
          } ${placement === 'below' ? 'top-full mt-2' : 'bottom-full mb-2'}`}
        >
          {children}
        </span>
      ) : null}
    </span>
  );
}
