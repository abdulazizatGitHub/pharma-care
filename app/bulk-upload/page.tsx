"use client";

import React, { useState, useCallback } from "react";
import Papa from "papaparse";
import { Upload, Download, CheckCircle, XCircle, AlertTriangle, FileText } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { useToast } from "@/components/ui/Toast";
import { useMedicines } from "@/hooks/useMedicines";
import { bulkSaveMedicines } from "@/services/medicineService";
import { CSV_FIELD_LABELS, CSV_REQUIRED_FIELDS } from "@/lib/constants";
import type { BulkUploadRow } from "@/lib/types";

const SYSTEM_FIELDS = Object.keys(CSV_FIELD_LABELS) as (keyof typeof CSV_FIELD_LABELS)[];

const SAMPLE_CSV = [
  "name,genericName,batchNumber,expiryDate,quantity,costPrice,salePrice,supplier",
  "Panadol Extra,Paracetamol 500mg,PCM-001,2026-12-31,100,10,15,GSK Pakistan",
  "Brufen 400,Ibuprofen 400mg,IBU-002,2026-06-30,50,20,30,Abbott Laboratories",
  "Risek 20mg,Omeprazole,OME-003,2027-01-31,75,55,80,Searle Pakistan",
].join("\n");

function downloadSampleCSV() {
  const blob = new Blob([SAMPLE_CSV], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "pharmacare_sample_medicines.csv";
  a.click();
  URL.revokeObjectURL(url);
}

function parseRow(
  raw: Record<string, string>,
  mapping: Record<string, string>
): BulkUploadRow {
  const errors: string[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const parsed: Record<string, any> = {};

  for (const [csvCol, sysField] of Object.entries(mapping)) {
    if (!sysField) continue;
    const val = raw[csvCol]?.trim() ?? "";
    if (!val) {
      if (CSV_REQUIRED_FIELDS.includes(sysField)) {
        errors.push(`"${CSV_FIELD_LABELS[sysField]}" is required`);
      }
      continue;
    }
    if (sysField === "quantity") {
      const n = parseInt(val, 10);
      if (isNaN(n) || n < 0) errors.push('"Stock Quantity" must be a whole number (0 or more)');
      else parsed.quantity = n;
    } else if (sysField === "costPrice" || sysField === "salePrice") {
      const n = parseFloat(val);
      if (isNaN(n) || n < 0) errors.push(`"${CSV_FIELD_LABELS[sysField]}" must be a valid number`);
      else parsed[sysField] = n;
    } else if (sysField === "expiryDate") {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(val)) {
        errors.push('"Expiry Date" must be in YYYY-MM-DD format (e.g. 2026-12-31)');
      } else {
        parsed.expiryDate = val;
      }
    } else {
      parsed[sysField] = val;
    }
  }

  return { raw, parsed, errors, isValid: errors.length === 0 };
}

type Step = 1 | 2 | 3;

export default function BulkUploadPage() {
  const { refresh } = useMedicines();
  const { toast } = useToast();

  const [step, setStep] = useState<Step>(1);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvRows, setCsvRows] = useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [parsedRows, setParsedRows] = useState<BulkUploadRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [fileName, setFileName] = useState("");

  function resetAll() {
    setStep(1);
    setCsvHeaders([]);
    setCsvRows([]);
    setMapping({});
    setParsedRows([]);
    setFileName("");
  }

  const handleFile = useCallback((file: File) => {
    setFileName(file.name);
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const headers = results.meta.fields ?? [];
        const rows = results.data;
        setCsvHeaders(headers);
        setCsvRows(rows);
        // Auto-map columns with matching names
        const autoMap: Record<string, string> = {};
        for (const header of headers) {
          const normalized = header.toLowerCase().replace(/\s+/g, "");
          const match = SYSTEM_FIELDS.find(
            (f) => f.toLowerCase() === normalized || CSV_FIELD_LABELS[f].toLowerCase().replace(/\s+/g,"").includes(normalized)
          );
          autoMap[header] = match ?? "";
        }
        setMapping(autoMap);
        setStep(2);
      },
      error: () => toast("Could not read the file. Please use a valid CSV.", "error"),
    });
  }, [toast]);

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && file.name.endsWith(".csv")) handleFile(file);
    else toast("Please drop a CSV file (.csv)", "error");
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  }

  function handlePreview() {
    const mapped = CSV_REQUIRED_FIELDS.filter((f) => !Object.values(mapping).includes(f));
    if (mapped.length > 0) {
      toast(
        `Please map these required fields: ${mapped.map((f) => CSV_FIELD_LABELS[f]).join(", ")}`,
        "error"
      );
      return;
    }
    const rows = csvRows.map((row) => parseRow(row, mapping));
    setParsedRows(rows);
    setStep(3);
  }

  function handleImport() {
    const valid = parsedRows.filter((r) => r.isValid);
    if (valid.length === 0) {
      toast("No valid rows to import. Fix errors first.", "error");
      return;
    }
    setImporting(true);
    setTimeout(() => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const medicines = valid.map((r) => r.parsed as any);
        const { inserted, updated } = bulkSaveMedicines(medicines);
        refresh();
        const skipped = parsedRows.length - valid.length;
        toast(
          `${inserted} added, ${updated} updated${skipped > 0 ? `, ${skipped} row(s) skipped` : ""} ✓`,
          "success"
        );
        resetAll();
      } catch {
        toast("Import failed. Please check your data and try again.", "error");
      } finally {
        setImporting(false);
      }
    }, 400);
  }

  const validCount = parsedRows.filter((r) => r.isValid).length;
  const invalidCount = parsedRows.length - validCount;

  return (
    <div className="space-y-5 max-w-4xl" style={{ animation: "fadeIn 0.3s ease-out" }}>
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-800">Bulk Upload Medicines</h2>
          <p className="text-sm text-slate-500 mt-0.5">Import many medicines at once from a CSV file</p>
        </div>
        <Button variant="secondary" icon={<Download size={16} />} onClick={downloadSampleCSV}>
          Download Sample CSV
        </Button>
      </div>

      {/* Step indicators */}
      <div className="flex items-center gap-2">
        {([1, 2, 3] as Step[]).map((s, idx) => (
          <React.Fragment key={s}>
            <div className={`flex items-center gap-2 ${step >= s ? "text-indigo-600" : "text-slate-400"}`}>
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-colors ${
                step > s ? "bg-indigo-600 border-indigo-600 text-white" :
                step === s ? "border-indigo-600 text-indigo-600" :
                "border-slate-200 text-slate-400"
              }`}>
                {step > s ? <CheckCircle size={14} /> : s}
              </div>
              <span className="text-sm font-medium hidden sm:block">
                {s === 1 ? "Upload File" : s === 2 ? "Map Columns" : "Preview & Import"}
              </span>
            </div>
            {idx < 2 && <div className={`flex-1 h-0.5 ${step > s ? "bg-indigo-200" : "bg-slate-100"}`} />}
          </React.Fragment>
        ))}
      </div>

      {/* ─── Step 1: Drop zone ─── */}
      {step === 1 && (
        <Card>
          <div
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
            className="border-2 border-dashed border-slate-200 rounded-xl p-12 text-center hover:border-indigo-300 hover:bg-indigo-50/30 transition-colors cursor-pointer"
            onClick={() => document.getElementById("csv-input")?.click()}
          >
            <Upload size={40} className="mx-auto text-slate-300 mb-4" />
            <p className="text-lg font-semibold text-slate-600">Drag your CSV file here, or click to browse</p>
            <p className="text-sm text-slate-400 mt-2">Only .csv files are accepted</p>
            <input
              id="csv-input"
              type="file"
              accept=".csv"
              className="hidden"
              onChange={handleFileInput}
            />
          </div>
          <p className="text-center text-sm text-slate-400 mt-4">
            Not sure of the format?{" "}
            <button onClick={downloadSampleCSV} className="text-indigo-600 hover:underline font-medium">
              Download our sample CSV
            </button>{" "}
            and fill it in.
          </p>
        </Card>
      )}

      {/* ─── Step 2: Column Mapping ─── */}
      {step === 2 && (
        <Card>
          <div className="flex items-center gap-2 mb-4">
            <FileText size={18} className="text-indigo-500" />
            <p className="text-sm font-medium text-slate-700">
              <span className="font-bold">{fileName}</span> — {csvRows.length} rows found
            </p>
          </div>
          <p className="text-sm text-slate-500 mb-5">
            Match each column from your file to the correct field. Required fields are marked with *.
          </p>
          <div className="space-y-3">
            {csvHeaders.map((header) => (
              <div key={header} className="flex items-center gap-4">
                <div className="w-48 shrink-0 px-3 py-2 rounded-lg bg-slate-100 text-sm font-mono text-slate-600 truncate" title={header}>
                  {header}
                </div>
                <span className="text-slate-300">→</span>
                <Select
                  label=""
                  value={mapping[header] ?? ""}
                  onChange={(e) => setMapping((m) => ({ ...m, [header]: e.target.value }))}
                  className="flex-1"
                >
                  <option value="">(Skip this column)</option>
                  {SYSTEM_FIELDS.map((f) => (
                    <option key={f} value={f}>
                      {CSV_FIELD_LABELS[f]}
                      {CSV_REQUIRED_FIELDS.includes(f) ? " *" : ""}
                    </option>
                  ))}
                </Select>
              </div>
            ))}
          </div>
          <div className="flex gap-3 mt-6 pt-4 border-t border-slate-100">
            <Button variant="ghost" onClick={resetAll}>← Back</Button>
            <Button className="flex-1" size="lg" onClick={handlePreview}>
              Preview Data →
            </Button>
          </div>
        </Card>
      )}

      {/* ─── Step 3: Preview ─── */}
      {step === 3 && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-3 items-center">
            <Badge variant="success">{validCount} valid rows</Badge>
            {invalidCount > 0 && (
              <Badge variant="danger">{invalidCount} rows with errors (will be skipped)</Badge>
            )}
            <div className="ml-auto flex gap-3">
              <Button variant="ghost" onClick={() => setStep(2)}>← Back</Button>
              <Button
                size="lg"
                variant="success"
                icon={<CheckCircle size={18} />}
                onClick={handleImport}
                loading={importing}
                disabled={validCount === 0}
              >
                Import {validCount} Medicine{validCount !== 1 ? "s" : ""}
              </Button>
            </div>
          </div>

          <Card padding="sm">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-100">
                  <tr>
                    <th className="text-left py-2 px-3 text-xs font-semibold text-slate-400 uppercase">Status</th>
                    <th className="text-left py-2 px-3 text-xs font-semibold text-slate-400 uppercase">Name</th>
                    <th className="text-left py-2 px-3 text-xs font-semibold text-slate-400 uppercase">Stock</th>
                    <th className="text-left py-2 px-3 text-xs font-semibold text-slate-400 uppercase">Expiry</th>
                    <th className="text-left py-2 px-3 text-xs font-semibold text-slate-400 uppercase">Sale Price</th>
                    <th className="text-left py-2 px-3 text-xs font-semibold text-slate-400 uppercase">Error</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {parsedRows.map((row, i) => (
                    <tr
                      key={i}
                      className={row.isValid ? "hover:bg-emerald-50/30" : "bg-rose-50 hover:bg-rose-50"}
                    >
                      <td className="px-3 py-2.5">
                        {row.isValid ? (
                          <CheckCircle size={16} className="text-emerald-500" />
                        ) : (
                          <XCircle size={16} className="text-rose-400" />
                        )}
                      </td>
                      <td className="px-3 py-2.5 font-medium text-slate-800">
                        {(row.parsed.name as string) ?? row.raw[csvHeaders[0]] ?? "—"}
                      </td>
                      <td className="px-3 py-2.5 text-slate-600">{row.parsed.quantity ?? "—"}</td>
                      <td className="px-3 py-2.5 text-slate-600">{(row.parsed.expiryDate as string) ?? "—"}</td>
                      <td className="px-3 py-2.5 text-slate-600">{row.parsed.salePrice ?? "—"}</td>
                      <td className="px-3 py-2.5">
                        {row.errors.length > 0 && (
                          <div className="flex items-start gap-1 text-rose-600 text-xs">
                            <AlertTriangle size={12} className="mt-0.5 shrink-0" />
                            <span>{row.errors.join("; ")}</span>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
