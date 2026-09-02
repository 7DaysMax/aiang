"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Shimmer } from "@/components/atoms/Shimmer";

/* ─────────────────────────────────────────────────────────
 * TOOL CHIPS
 * An agent run as compact rows: tool calls with inline
 * chips, then file-diff chips summarizing the edits.
 * Hover a row to reveal its chevron; every row expands
 * to show what the tool actually did.
 * ───────────────────────────────────────────────────────── */

const STEP_MS = 700;

export type ToolChipIconKind =
  | "think"
  | "write"
  | "run"
  | "read"
  | "search"
  | "task"
  | "skill"
  | "web"
  | "clock"
  | "generic";

const Icons: Record<ToolChipIconKind, React.ReactNode> = {
  think: <path d="M12 2l2.4 7.2L22 12l-7.6 2.8L12 22l-2.4-7.2L2 12l7.6-2.8z" />,
  write: <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z" /></g>,
  run: <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 17l6-5-6-5M12 19h8" /></g>,
  read: <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /></g>,
  search: <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></g>,
  task: <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4" /><path d="M4 20a8 8 0 0 1 16 0" /></g>,
  skill: <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /><path d="M8 13h8M8 17h5" /></g>,
  web: <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M3.5 12h17M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" /></g>,
  clock: <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></g>,
  generic: <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></g>,
};

export type ToolDetailLine = { text: string; tone?: "add" };

export type ToolStep = {
  icon: ToolChipIconKind;
  label: string;
  chip: string;
  mono: boolean;
  detailMono: boolean;
  detail: ToolDetailLine[];
};

export type ToolDiff = { file: string; add: number; del: number };

export type ToolDiffLine = { text: string; tone: "add" | "del" | "ctx" };

export type LiveToolDiff = ToolDiff & { path?: string; lines?: ToolDiffLine[] };

export function ToolChipIcon({ kind }: { kind: ToolChipIconKind }) {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill={kind === "think" ? "currentColor" : "none"} stroke="currentColor" aria-hidden>
      {Icons[kind]}
    </svg>
  );
}

export function LiveToolChipRow({
  icon = "generic",
  label,
  chip,
  chipMono = true,
  detail = [],
  detailMono = false,
  pending = false,
  error = false,
}: {
  icon?: ToolChipIconKind;
  label: string;
  chip?: string | null;
  chipMono?: boolean;
  detail?: ToolDetailLine[];
  detailMono?: boolean;
  pending?: boolean;
  error?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const expandable = detail.length > 0;
  return (
    <div data-beautifului="tool-chip" style={{ animation: "fade-up 300ms cubic-bezier(0.23,1,0.32,1) both" }}>
      <button type="button" aria-expanded={expandable ? open : undefined} onClick={() => expandable && setOpen((value) => !value)} className="group/row -mx-[3px] flex h-7 w-[calc(100%+6px)] min-w-0 items-center gap-2 rounded-control px-[3px] text-left transition-colors duration-100 hover:bg-hover-2">
        <span className="relative flex size-4 shrink-0 items-center justify-center text-ink-3">
          {pending ? <span className={`size-3 rounded-full border-[1.5px] border-line-strong border-t-ink-2 transition-opacity duration-100 group-hover/row:opacity-0 ${open ? "opacity-0" : ""}`} style={{ animation: "spin 700ms linear infinite" }} /> : error ? <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--red)" strokeWidth="2.4"><path d="M18 6L6 18M6 6l12 12" /></svg> : <span className={`transition-opacity duration-100 group-hover/row:opacity-0 ${open ? "opacity-0" : ""}`}><ToolChipIcon kind={icon} /></span>}
          {expandable ? <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className={`absolute transition-[opacity,transform] duration-150 group-hover/row:opacity-100 ${open ? "opacity-100" : "opacity-0"}`} style={{ transform: open ? "rotate(0deg)" : "rotate(-90deg)" }}><path d="M6 9l6 6 6-6" /></svg> : null}
        </span>
        <span className="shrink-0 text-[12.5px] font-medium text-ink">{pending ? <Shimmer className="text-[12.5px] font-medium">{label}</Shimmer> : label}</span>
        {chip ? <span className={`inline-flex h-5.5 min-w-0 flex-1 items-center truncate rounded-chip bg-field px-1.5 text-[11.5px] text-ink-2 shadow-hairline ${chipMono ? "font-mono" : ""}`}>{chip}</span> : <span className="min-w-0 flex-1" />}
      </button>
      {expandable ? <div className="grid transition-[grid-template-rows,opacity] duration-300" style={{ gridTemplateRows: open ? "1fr" : "0fr", opacity: open ? 1 : 0 }}><div className="min-h-0 overflow-hidden"><div className="mt-0.5 mb-1 ml-2 flex flex-col gap-0.5 border-l border-line py-0.5 pl-3.5">{detail.map((line, index) => <span key={`${line.text}-${index}`} className={`truncate text-[11.5px] leading-[1.6] ${detailMono ? "font-mono" : ""} ${line.tone === "add" ? "text-green" : "text-ink-2"}`}>{line.text}</span>)}</div></div></div> : null}
    </div>
  );
}

function livePreviewHeight(file: LiveToolDiff) {
  return 38 + Math.max(file.lines?.length ?? 0, file.lines?.length ? 0 : 2) * 19;
}

export function LiveDiffChips({ files, maxVisible = 8, onOpenFile, rule = true }: { files: LiveToolDiff[]; maxVisible?: number; onOpenFile?: (path: string) => void; rule?: boolean }) {
  const [preview, setPreview] = useState<{ file: LiveToolDiff; x: number; top?: number; bottom?: number } | null>(null);
  const [expanded, setExpanded] = useState(false);
  if (files.length === 0) return null;
  const visible = expanded ? files : files.slice(0, maxVisible);
  const remaining = files.length - visible.length;
  const showPreview = (file: LiveToolDiff) => (event: React.SyntheticEvent) => {
    const target = (event.currentTarget as Element).closest("[data-diffchip]");
    if (!target) return;
    const rect = target.getBoundingClientRect();
    const fitsBelow = rect.bottom + 6 + livePreviewHeight(file) <= window.innerHeight - 12;
    setPreview({ file, x: Math.max(12, Math.min(rect.left, window.innerWidth - 300)), ...(fitsBelow ? { top: rect.bottom + 6 } : { bottom: window.innerHeight - rect.top + 6 }) });
  };
  const hidePreview = (file: LiveToolDiff) => () => setPreview((current) => current?.file === file ? null : current);
  return <div data-beautifului="tool-diff-chips" className={`flex max-w-full flex-wrap gap-1.5 ${rule ? "mt-2.5 border-t border-line pt-2.5" : ""}`}>
    {visible.map((file, index) => <span key={`${file.path ?? file.file}-${index}`} data-diffchip onMouseEnter={showPreview(file)} onMouseLeave={hidePreview(file)}><button type="button" aria-label={`Show diff for ${file.file}`} onFocus={showPreview(file)} onBlur={hidePreview(file)} onClick={() => onOpenFile?.(file.path ?? file.file)} className="inline-flex h-7 max-w-full items-center gap-2 rounded-chip bg-surface px-2 font-mono text-[11.5px] text-ink shadow-btn" style={{ animation: `pop-in 250ms cubic-bezier(0.23,1,0.32,1) ${index * 80}ms both` }}><span className="min-w-0 truncate">{file.file}</span><span className="text-green tabular-nums">+{file.add}</span>{file.del > 0 ? <span className="text-red tabular-nums">−{file.del}</span> : null}</button></span>)}
    {remaining > 0 ? <button type="button" onClick={() => setExpanded(true)} className="inline-flex h-7 items-center rounded-chip px-1.5 font-mono text-[11.5px] text-ink-3 underline underline-offset-2">+{remaining} more</button> : null}
    {preview && typeof document !== "undefined" ? createPortal(<div className="fixed z-50 w-72 overflow-hidden rounded-[10px] bg-surface shadow-overlay" style={{ left: preview.x, top: preview.top, bottom: preview.bottom }}><div className="flex items-center justify-between border-b border-line px-2.5 py-1.5 font-mono text-[11px]"><span className="truncate text-ink-2">{preview.file.file}</span><span><span className="text-green">+{preview.file.add}</span>{preview.file.del > 0 ? <span className="text-red"> −{preview.file.del}</span> : null}</span></div><div className="py-1 font-mono text-[11px] leading-[1.8]">{preview.file.lines?.length ? preview.file.lines.map((line, index) => <div key={index} className={`flex gap-2 px-2.5 whitespace-pre ${line.tone === "add" ? "bg-green-tint text-green" : line.tone === "del" ? "bg-red-tint text-red" : "text-ink-2"}`}><span className="w-3 shrink-0 select-none">{line.tone === "add" ? "+" : line.tone === "del" ? "−" : " "}</span><span className="min-w-0 truncate">{line.text}</span></div>) : <div className="px-2.5 py-1 text-ink-3">No inline preview</div>}</div></div>, document.body) : null}
  </div>;
}

export type ToolChipsLabels = {
  header: string;
  more: string;
};

const DEFAULT_LABELS: ToolChipsLabels = {
  header: "4 tool calls, 2 messages",
  more: "+2 more",
};

const ROWS: ToolStep[] = [
  {
    icon: "think", label: "Thinking", chip: "Planning the churn schedule…", mono: false, detailMono: false,
    detail: [
      { text: "Weekend demand carries pistachio, so it churns first." },
      { text: "Batch capacity leaves two evening freezer windows." },
    ],
  },
  {
    icon: "write", label: "Write 204 lines", chip: "ChurnSchedule.tsx", mono: true, detailMono: true,
    detail: [
      { text: "+ const windows = slots.filter((s) => s.temp <= -12)", tone: "add" },
      { text: "+ return schedule(windows, { hero: \"pistachio\" })", tone: "add" },
    ],
  },
  {
    icon: "run", label: "Rebuild and verify", chip: "npm run freeze", mono: true, detailMono: true,
    detail: [
      { text: "✓ built in 1.2s" },
      { text: "✓ 34 checks passed" },
    ],
  },
  {
    icon: "read", label: "Read image", chip: "flavor-chart.png", mono: true, detailMono: false,
    detail: [
      { text: "1280 × 720 · line chart, three summers." },
      { text: "Mint chip trends up 12% through July." },
    ],
  },
];

const DIFFS: ToolDiff[] = [
  { file: "flavors.css", add: 13, del: 0 },
  { file: "ChurnSchedule.tsx", add: 74, del: 41 },
  { file: "menu.ts", add: 8, del: 2 },
];

/* hovering a file chip opens its diff — green added, red removed */
const DIFF_LINES: Record<string, ToolDiffLine[]> = {
  "flavors.css": [
    { text: ".scoop-card {", tone: "ctx" },
    { text: "  gap: 14px;", tone: "del" },
    { text: "  gap: 12px;", tone: "add" },
    { text: "  container-type: inline-size;", tone: "add" },
    { text: "}", tone: "ctx" },
  ],
  "ChurnSchedule.tsx": [
    { text: "const slots = coldSlots(week);", tone: "ctx" },
    { text: "const windows = slots;", tone: "del" },
    { text: "const windows = slots.filter(", tone: "add" },
    { text: "  (s) => s.temp <= -12,", tone: "add" },
    { text: ");", tone: "add" },
  ],
  "menu.ts": [
    { text: "export const hero = \"mint-chip\";", tone: "del" },
    { text: "export const hero = \"pistachio\";", tone: "add" },
  ],
};

export default function ToolChips({
  steps = ROWS,
  diffs = DIFFS,
  diffLines = DIFF_LINES,
  labels,
  className,
  onOpenChange,
  onToggleRow,
}: {
  /** Accepted for gallery/registry parity; ToolChips has no visual variants. */
  variant?: string;
  steps?: ToolStep[];
  diffs?: ToolDiff[];
  diffLines?: Record<string, ToolDiffLine[]>;
  labels?: Partial<ToolChipsLabels>;
  className?: string;
  onOpenChange?: (open: boolean) => void;
  onToggleRow?: (label: string, open: boolean) => void;
} = {}) {
  const copy = { ...DEFAULT_LABELS, ...labels };
  const [step, setStep] = useState(0);
  const [open, setOpen] = useState(true);
  const [openRows, setOpenRows] = useState<Set<string>>(new Set());
  /* Rendered in a body portal so animated/translated reply wrappers cannot
   * redefine the fixed-position coordinate system. */
  const [preview, setPreview] = useState<{
    file: string;
    x: number;
    top?: number;
    bottom?: number;
  } | null>(null);
  const openPreview = (file: string) => (event: React.SyntheticEvent) => {
    const rect = (event.currentTarget as Element).closest("[data-diffchip]")!.getBoundingClientRect();
    const previewHeight = 38 + (diffLines[file]?.length ?? 0) * 19;
    const fitsBelow = rect.bottom + 6 + previewHeight <= window.innerHeight - 12;
    setPreview({
      file,
      x: Math.max(12, Math.min(rect.left, window.innerWidth - 300)),
      ...(fitsBelow
        ? { top: rect.bottom + 6 }
        : { bottom: window.innerHeight - rect.top + 6 }),
    });
  };
  const closePreview = (file: string) => () =>
    setPreview((current) => (current?.file === file ? null : current));
  const total = steps.length + 1; // rows, then diff chips

  useEffect(() => {
    if (step >= total) return;
    const t = setTimeout(() => setStep((s) => s + 1), STEP_MS);
    return () => clearTimeout(t);
  }, [step, total]);

  const toggleRow = (label: string) =>
    setOpenRows((current) => {
      const next = new Set(current);
      next.has(label) ? next.delete(label) : next.add(label);
      onToggleRow?.(label, next.has(label));
      return next;
    });

  return (
    <div className={`min-h-[220px] w-full max-w-80 pb-1${className ? ` ${className}` : ""}`}>
      {/* collapsed run header */}
      <button
        type="button"
        aria-expanded={open}
        onClick={() =>
          setOpen((current) => {
            onOpenChange?.(!current);
            return !current;
          })
        }
        className="-mx-1.5 flex w-fit items-center gap-1.5 rounded-control px-1.5 py-1 text-[12.5px] text-ink-2 transition-colors duration-100 hover:bg-hover-2"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="transition-transform duration-200" style={{ transform: open ? "rotate(0deg)" : "rotate(-90deg)" }}>
          <path d="M6 9l6 6 6-6" />
        </svg>
        <span className="tabular-nums">{copy.header}</span>
      </button>

      {/* tool call rows */}
      <div className="grid transition-[grid-template-rows,opacity] duration-300" style={{ gridTemplateRows: open ? "1fr" : "0fr", opacity: open ? 1 : 0 }}>
        {/* -mx-1 + px-1.5 keeps content at the same x while giving the
            row hover pills room inside this overflow-hidden clip box */}
        <div className="-mx-1 overflow-hidden px-1.5 pb-1">
        <div className="mt-1.5 flex flex-col gap-1">
          {steps.slice(0, step).map((row) => {
            const rowOpen = openRows.has(row.label);
            return (
            <div key={row.label} style={{ animation: "fade-up 300ms cubic-bezier(0.23,1,0.32,1) both" }}>
              <button
                type="button"
                aria-expanded={rowOpen}
                onClick={() => toggleRow(row.label)}
                className="group/row -mx-[3px] flex h-7 w-[calc(100%+6px)] min-w-0 items-center gap-2 rounded-control px-[3px] text-left transition-colors duration-100 hover:bg-hover-2"
              >
                <span className="relative flex size-4 shrink-0 items-center justify-center text-ink-3">
                  <svg
                    width="13" height="13" viewBox="0 0 24 24" fill={row.icon === "think" ? "currentColor" : "none"} stroke="currentColor"
                    className={`transition-opacity duration-100 group-hover/row:opacity-0 ${rowOpen ? "opacity-0" : ""}`}
                  >
                    {Icons[row.icon]}
                  </svg>
                  <svg
                    width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
                    className={`absolute transition-[opacity,transform] duration-150 group-hover/row:opacity-100 ${rowOpen ? "opacity-100" : "opacity-0"}`}
                    style={{ transform: rowOpen ? "rotate(0deg)" : "rotate(-90deg)" }}
                  >
                    <path d="M6 9l6 6 6-6" />
                  </svg>
                </span>
                <span className="shrink-0 text-[12.5px] font-medium text-ink">{row.label}</span>
                <span
                  className={`inline-flex h-5.5 min-w-0 flex-1 cursor-pointer items-center truncate rounded-chip bg-field px-1.5
                    text-[11.5px] text-ink-2 shadow-hairline transition-colors duration-100 hover:bg-hover-2
                    ${row.mono ? "font-mono" : ""}`}
                >
                  {row.chip}
                </span>
              </button>

              {/* expanded detail */}
              <div
                className="grid transition-[grid-template-rows,opacity] duration-300"
                style={{ gridTemplateRows: rowOpen ? "1fr" : "0fr", opacity: rowOpen ? 1 : 0, transitionTimingFunction: "cubic-bezier(0.23, 1, 0.32, 1)" }}
              >
                <div className="min-h-0 overflow-hidden">
                  <div className="mt-0.5 mb-1 ml-2 flex flex-col gap-0.5 border-l border-line py-0.5 pl-3.5">
                    {row.detail.map((line) => (
                      <span
                        key={line.text}
                        className={`truncate text-[11.5px] leading-[1.6] ${row.detailMono ? "font-mono" : ""} ${line.tone === "add" ? "text-green" : "text-ink-2"}`}
                      >
                        {line.text}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
            );
          })}
        </div>

      {/* file-diff chips */}
      {step >= total && (
        <div className="mt-2.5 flex max-w-full flex-wrap gap-1.5 border-t border-line pt-2.5">
          {diffs.map((d, i) => (
            <span
              key={d.file}
              data-diffchip
              className="relative"
              onMouseEnter={openPreview(d.file)}
              onMouseLeave={closePreview(d.file)}
            >
              <button
                type="button"
                aria-expanded={preview?.file === d.file}
                aria-label={`Show diff for ${d.file}`}
                onFocus={openPreview(d.file)}
                onBlur={closePreview(d.file)}
                className="inline-flex h-7 max-w-full items-center gap-2 rounded-chip
                  bg-surface px-2 font-mono text-[11.5px] text-ink shadow-btn
                  transition-colors duration-100 hover:bg-hover"
                style={{ animation: `pop-in 250ms cubic-bezier(0.23,1,0.32,1) ${i * 80}ms both` }}
              >
                <span className="min-w-0 truncate">{d.file}</span>
                <span className="shrink-0 text-green tabular-nums">+{d.add}</span>
                {d.del > 0 && <span className="shrink-0 text-red tabular-nums">−{d.del}</span>}
              </button>

            </span>
          ))}
          <button
            type="button"
            className="inline-flex h-7 items-center rounded-chip px-1.5 font-mono text-[11.5px] text-ink-3
              underline decoration-transparent underline-offset-2 transition-colors duration-100
              hover:text-ink-2 hover:decoration-current"
            style={{ animation: `fade-in 300ms ease-out ${diffs.length * 80}ms both` }}
          >
            {copy.more}
          </button>
        </div>
      )}
        </div>
      </div>
      {preview && typeof document !== "undefined" && createPortal(
        <div
          className="fixed z-50 w-72 overflow-hidden rounded-[10px] bg-surface shadow-overlay"
          style={{
            left: preview.x,
            top: preview.top,
            bottom: preview.bottom,
            animation: "pop-in 160ms cubic-bezier(0.23,1,0.32,1) both",
            transformOrigin: preview.top === undefined ? "bottom left" : "top left",
          }}
        >
          <div className="flex items-center justify-between border-b border-line px-2.5 py-1.5 font-mono text-[11px]">
            <span className="min-w-0 truncate text-ink-2">{preview.file}</span>
            <span className="shrink-0 tabular-nums">
              <span className="text-green">+{diffs.find((diff) => diff.file === preview.file)?.add}</span>
              {(diffs.find((diff) => diff.file === preview.file)?.del ?? 0) > 0 && (
                <span className="text-red"> −{diffs.find((diff) => diff.file === preview.file)?.del}</span>
              )}
            </span>
          </div>
          <div className="py-1 font-mono text-[11px] leading-[1.8]">
            {(diffLines[preview.file] ?? []).map((line, index) => (
              <div
                key={index}
                className={`flex gap-2 px-2.5 whitespace-pre ${
                  line.tone === "add"
                    ? "bg-green-tint text-green"
                    : line.tone === "del"
                      ? "bg-red-tint text-red"
                      : "text-ink-2"
                }`}
              >
                <span className="w-3 shrink-0 select-none">{line.tone === "add" ? "+" : line.tone === "del" ? "−" : " "}</span>
                <span className="min-w-0 truncate">{line.text}</span>
              </div>
            ))}
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
