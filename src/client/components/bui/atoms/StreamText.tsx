import { useEffect, useRef, useState } from "react";

/* ─────────────────────────────────────────────────────────
 * STREAM TEXT — reusable streaming primitive
 * Reveals characters quickly (fast, like a real token stream);
 * the leading edge resolves out of a soft blur, and the caret
 * stays solid while streaming, then blinks once the text
 * settles. Inherits typography from its context, so it drops
 * into any text surface (Selection Actions, chat, etc.).
 *
 * `streaming` omitted: typewriter the whole string once (gallery).
 * `streaming={true}`: follow a growing server buffer — keep the
 * already-shown prefix, catch up the new suffix, never restart.
 * `streaming={false}`: snap to the full string and drop the blur.
 * ───────────────────────────────────────────────────────── */

export function StreamText({
  text,
  streaming,
  charsPerTick = 2,
  tickMs = 9,
  blurTail = 6,
  caret = true,
  className,
  onProgress,
  onDone,
}: {
  text: string;
  /**
   * Live token stream: true while the server is still appending.
   * Omit to typewriter a finished string (Beautiful UI gallery).
   */
  streaming?: boolean;
  /** characters revealed per tick — higher is faster */
  charsPerTick?: number;
  /** interval between reveals, ms */
  tickMs?: number;
  /** how many trailing characters carry the soft blur edge */
  blurTail?: number;
  /** render the caret (solid while streaming, blinks once idle) */
  caret?: boolean;
  className?: string;
  /** fires each tick — useful for re-anchoring UI to reflowing text */
  onProgress?: () => void;
  /** fires once the full string is shown */
  onDone?: () => void;
}) {
  const typewriter = streaming === undefined;
  const [count, setCount] = useState(() => (typewriter ? 0 : text.length));
  const onProgressRef = useRef(onProgress);
  const onDoneRef = useRef(onDone);
  const textRef = useRef(text);
  const countRef = useRef(count);
  onProgressRef.current = onProgress;
  onDoneRef.current = onDone;
  countRef.current = count;

  useEffect(() => {
    const previous = textRef.current;
    textRef.current = text;

    if (streaming === false) {
      setCount(text.length);
      onDoneRef.current?.();
      return;
    }

    let start = countRef.current;
    if (typewriter) {
      start = 0;
    } else if (text.startsWith(previous) || previous.startsWith(text)) {
      start = Math.min(countRef.current, text.length);
    } else {
      start = Math.max(0, text.length - Math.max(blurTail * 2, 12));
    }

    if (start >= text.length) {
      setCount(text.length);
      onDoneRef.current?.();
      return;
    }

    setCount(start);
    let i = start;
    const id = setInterval(() => {
      i = Math.min(i + charsPerTick, text.length);
      setCount(i);
      onProgressRef.current?.();
      if (i >= text.length) {
        clearInterval(id);
        onDoneRef.current?.();
      }
    }, tickMs);
    return () => clearInterval(id);
  }, [text, charsPerTick, tickMs, streaming, blurTail, typewriter]);

  const live = streaming === true || (typewriter && count < text.length);
  const shown = text.slice(0, count);
  const split = live ? Math.max(0, shown.length - blurTail) : shown.length;

  return (
    <span className={className}>
      {shown.slice(0, split)}
      {split < shown.length && (
        <span className="stream-tail">{shown.slice(split)}</span>
      )}
      {caret && (live || typewriter) && (
        <span
          aria-hidden
          className={`stream-caret${live ? " is-streaming" : ""}`}
        />
      )}
    </span>
  );
}
