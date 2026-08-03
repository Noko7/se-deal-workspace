"use client";

import { useRef, useState } from "react";
import {
  AlertTriangle,
  Check,
  Download,
  ExternalLink,
  FileSpreadsheet,
  Loader2,
  UploadCloud,
  X,
} from "lucide-react";
import { mergeReports } from "@/lib/install-base/parse";
import { parseHardwareFile } from "@/lib/install-base/hardware";
import { buildWorkbookBlob } from "@/lib/install-base/workbook";

const PART1_LINK = "https://csinsights.nutanix.com/hx/resourceutil/allaccounts/all/8781";
const PART2_LINK = "https://csinsights.nutanix.com/hx/clustersummary/allaccounts/all/8782";
const PART3_LINK = "https://nutanix.lightning.force.com/lightning/r/Report/00OVO00000VxHHV2A3/view?queryScope=userFolders";

function isCsv(file: File): boolean {
  return /\.csv$/i.test(file.name) || /csv|text\/plain/i.test(file.type) || file.type === "";
}

// Part 3 (Salesforce export) may be an Excel workbook or a CSV.
function isSpreadsheet(file: File): boolean {
  return isCsv(file) || /\.xlsx?$/i.test(file.name) || /sheet|excel/i.test(file.type);
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// One drag-and-drop / click-to-browse target for a CSV file.
function DropSlot({
  label,
  link,
  file,
  onFile,
  onClear,
  accept = ".csv,text/csv",
  hint = "Export to CSV from CS360, then drop it here",
  optional = false,
}: {
  label: string;
  link: string;
  file: File | null;
  onFile: (file: File) => void;
  onClear: () => void;
  accept?: string;
  hint?: string;
  optional?: boolean;
}) {
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-sm font-semibold text-charcoal-900">
          {label}
          {optional ? (
            <span className="rounded-full bg-charcoal-200 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-charcoal-600">
              Optional
            </span>
          ) : null}
        </p>
        <a
          href={link}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-xs font-medium text-iris-600 hover:text-iris-700"
        >
          Open report <ExternalLink className="h-3 w-3" />
        </a>
      </div>
      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
          if (!dragOver) setDragOver(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          setDragOver(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const dropped = e.dataTransfer.files?.[0];
          if (dropped) onFile(dropped);
        }}
        className={`flex min-h-[120px] cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed px-4 py-6 text-center transition focus:outline-none focus-visible:ring-2 focus-visible:ring-iris-400 ${
          dragOver
            ? "border-iris-500 bg-iris-100 ring-2 ring-iris-300"
            : file
              ? "border-emerald-300 bg-emerald-50 dark:border-emerald-500/40 dark:bg-emerald-500/10"
              : "border-charcoal-300 bg-white hover:border-iris-400 hover:bg-iris-50/40 dark:hover:bg-iris-100/30"
        }`}
      >
        {file ? (
          <>
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
              <FileSpreadsheet className="h-5 w-5" />
            </span>
            <p className="max-w-full truncate text-sm font-medium text-charcoal-900">{file.name}</p>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onClear();
              }}
              className="inline-flex items-center gap-1 rounded-md bg-transparent px-2 py-0.5 text-xs font-medium text-charcoal-500 hover:text-rose-600"
            >
              <X className="h-3.5 w-3.5" /> Remove
            </button>
          </>
        ) : (
          <>
            <span className={`flex h-9 w-9 items-center justify-center rounded-full ${dragOver ? "bg-iris-200 text-iris-700" : "bg-iris-100 text-iris-600"}`}>
              <UploadCloud className="h-5 w-5" />
            </span>
            <p className="text-sm font-medium text-charcoal-700">
              {dragOver ? "Drop the file here" : "Drag & drop the file, or click to browse"}
            </p>
            <p className="text-[11px] text-charcoal-500">{hint}</p>
          </>
        )}
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          className="hidden"
          onChange={(e) => {
            const picked = e.target.files?.[0];
            if (picked) onFile(picked);
            e.target.value = "";
          }}
        />
      </div>
    </div>
  );
}

export function InstallBaseReport() {
  const [part1, setPart1] = useState<File | null>(null);
  const [part2, setPart2] = useState<File | null>(null);
  const [part3, setPart3] = useState<File | null>(null);
  const [includeReports, setIncludeReports] = useState(false);
  const [specificAccounts, setSpecificAccounts] = useState("");
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [done, setDone] = useState(false);

  const generate = async () => {
    if (!part1 || generating) return;
    setGenerating(true);
    setError(null);
    setWarnings([]);
    setDone(false);
    try {
      const p1text = await part1.text();
      const p2text = part2 ? await part2.text() : null;
      const merged = mergeReports(p1text, p2text);
      if (merged.rows.length === 0) {
        throw new Error("No data rows were found in the Part 1 file. Check that it's the CS360 CSV export.");
      }

      const hardware = part3 ? await parseHardwareFile(part3) : null;

      const nextWarnings: string[] = [];
      if (!part2) {
        nextWarnings.push("Part 2 wasn't provided, so the license and version columns (Hypervisor Version through LCM) will be blank.");
      } else if (merged.matchedPart2 === 0) {
        nextWarnings.push("No Part 2 rows matched Part 1 by Cluster UUID or Cluster Name, so the license and version columns are blank.");
      }
      if (merged.missingPart1.length > 0) {
        nextWarnings.push(`Some Part 1 columns weren't recognized and were left blank (${merged.missingPart1.length}).`);
      }
      if (hardware && !hardware.headerFound) {
        nextWarnings.push("Couldn't find the Hardware header row in the Part 3 file. Check that it's the exported Salesforce report.");
      } else if (hardware && hardware.missing.length > 0) {
        nextWarnings.push(`Some Part 3 (Hardware) columns weren't recognized and were left blank (${hardware.missing.length}).`);
      }

      const blob = await buildWorkbookBlob(merged.rows, {
        includeReports,
        reportOptions: { specificAccounts },
        hardwareRows: hardware?.rows ?? [],
      });
      triggerDownload(blob, "Install Base Report.xlsx");
      setWarnings(nextWarnings);
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong generating the report.");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Step-by-step instructions: full width, numbered. */}
      <ol className="list-decimal space-y-2 pl-5 text-sm leading-relaxed text-charcoal-600 marker:font-semibold marker:text-iris-600">
        <li>Open the Part 1 and Part 2 report links below</li>
        <li>
          In CS360, click &ldquo;Customize Report&rdquo; (top right) and set your filters (vertical, region, account,
          account team, etc.)
        </li>
        <li>Click &ldquo;Export to CSV,&rdquo; then drop each file into its slot below</li>
      </ol>

      {/* Part 1 & Part 2 slots. */}
      <div className="grid gap-4 sm:grid-cols-2">
        <DropSlot
          label="Part 1 Report File"
          link={PART1_LINK}
          file={part1}
          onFile={(f) => {
            if (!isCsv(f)) {
              setError("That doesn't look like a CSV export.");
              return;
            }
            setError(null);
            setDone(false);
            setPart1(f);
          }}
          onClear={() => setPart1(null)}
        />
        <DropSlot
          label="Part 2 Report File"
          link={PART2_LINK}
          file={part2}
          onFile={(f) => {
            if (!isCsv(f)) {
              setError("That doesn't look like a CSV export.");
              return;
            }
            setError(null);
            setDone(false);
            setPart2(f);
          }}
          onClear={() => setPart2(null)}
        />
      </div>

      {/* Part 3: optional hardware report. Sits below Parts 1 & 2 at the same
          slot size; only needed if the hardware report is also wanted. */}
      <div className="space-y-3 border-t border-charcoal-200 pt-5">
        <div>
          <p className="flex items-center gap-1.5 text-sm font-semibold text-charcoal-900">
            Part 3: Hardware Report
            <span className="rounded-full bg-charcoal-200 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-charcoal-600">
              Optional
            </span>
          </p>
          <p className="text-xs text-charcoal-500">Only needed if you also want the hardware report generated.</p>
        </div>
        <ol className="list-decimal space-y-2 pl-5 text-sm leading-relaxed text-charcoal-600 marker:font-semibold marker:text-iris-600">
          <li>Visit the link for Part 3</li>
          <li>
            Click the &ldquo;Filters&rdquo; button (Funnel Icon at top right) and apply each shown filter as desired
            <ul className="mt-1.5 list-none space-y-1 pl-0 text-[13px] text-charcoal-500">
              <li>
                <span className="font-semibold text-iris-600">2a.</span> Optional: If you want additional custom
                settings (like Account Owner), click the edit button top right. You can then edit columns and filters
                on the left panel, as desired. Click Run when complete
              </li>
            </ul>
          </li>
          <li>Click the downward arrow at the top right of the screen (Next to &ldquo;Edit&rdquo;)</li>
          <li>Select &ldquo;Export&rdquo; and ensure &ldquo;Formatted Report&rdquo; is selected for export</li>
          <li>Export and drop (or upload) the file</li>
        </ol>
        <div className="grid gap-4 sm:grid-cols-2">
          <DropSlot
            label="Part 3 Report File"
            link={PART3_LINK}
            file={part3}
            optional
            accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            hint="Export the Salesforce report (Formatted Report, .xlsx) and drop it here"
            onFile={(f) => {
              if (!isSpreadsheet(f)) {
                setError("That doesn't look like a CSV or Excel export.");
                return;
              }
              setError(null);
              setDone(false);
              setPart3(f);
            }}
            onClear={() => setPart3(null)}
          />
        </div>
      </div>

      {/* Add-on chart reports: Yes/No. */}
      <div className="rounded-lg border border-charcoal-200 bg-charcoal-50 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-charcoal-900">Generate add-on chart reports?</p>
            <p className="text-xs text-charcoal-500">
              Adds a &ldquo;Reports&rdquo; sheet with grouped bar charts (red = CPU, blue = Memory, green = Storage):
              per Account Executive for current metrics &gt; 75% and N-1 &gt; 70%, plus an optional selected-accounts
              chart.
            </p>
          </div>
          <div className="inline-flex overflow-hidden rounded-md border border-charcoal-300">
            {([
              ["Yes", true],
              ["No", false],
            ] as const).map(([label, value]) => {
              const active = includeReports === value;
              return (
                <button
                  key={label}
                  type="button"
                  onClick={() => setIncludeReports(value)}
                  aria-pressed={active}
                  className={`px-4 py-1.5 text-sm font-semibold transition ${
                    active ? "bg-iris-500 text-white" : "bg-white text-charcoal-700 hover:bg-charcoal-50"
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        {includeReports ? (
          <div className="mt-3 space-y-1.5">
            <label htmlFor="specific-accounts" className="text-xs font-semibold uppercase tracking-wide text-charcoal-600">
              Selected accounts chart (optional)
            </label>
            <textarea
              id="specific-accounts"
              value={specificAccounts}
              onChange={(e) => setSpecificAccounts(e.target.value)}
              rows={2}
              placeholder="Comma or newline separated, e.g. Main Street Bank, Amicus Therapeutics, Spencer Gifts"
              className="w-full text-sm"
            />
            <p className="text-[11px] text-charcoal-500">
              Per-Account-Executive charts are generated automatically. Leave this blank to skip the selected-accounts
              chart.
            </p>
          </div>
        ) : null}
      </div>

      {/* Privacy note. */}
      <p className="flex items-center gap-1.5 text-[11px] text-charcoal-500">
        <Check className="h-3.5 w-3.5 text-emerald-600" />
        Fully in-browser and stateless. Your files are parsed locally and never uploaded, stored, or sent to any AI.
      </p>

      {error ? (
        <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      ) : null}

      {warnings.length > 0 ? (
        <div className="space-y-1 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
          {warnings.map((w) => (
            <p key={w} className="flex items-start gap-1.5">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {w}
            </p>
          ))}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-3 border-t border-charcoal-200 pt-4">
        <button
          type="button"
          onClick={generate}
          disabled={!part1 || generating}
          className="inline-flex items-center gap-2 rounded-md bg-iris-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-iris-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          {generating ? "Generating…" : "Generate Install Base Report"}
        </button>
        {done ? (
          <span className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-700 dark:text-emerald-300">
            <Check className="h-4 w-4" /> Report downloaded
          </span>
        ) : !part1 ? (
          <span className="text-xs text-charcoal-500">Add the Part 1 file to enable the report.</span>
        ) : null}
      </div>
    </div>
  );
}
