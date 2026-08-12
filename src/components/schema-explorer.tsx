"use client";

import { useState } from "react";
import { ChevronDown, Table2 } from "lucide-react";
import { ACCOUNT_SCHEMA, schemaStats, type SchemaField } from "@/lib/account-schema";
import { StatusPill } from "@/components/ui";

const TYPE_TONE: Record<string, string> = {
  string: "bg-charcoal-100 text-charcoal-700",
  text: "bg-charcoal-100 text-charcoal-700",
  number: "bg-sky-100 text-sky-800",
  currency: "bg-emerald-100 text-emerald-800",
  percent: "bg-emerald-100 text-emerald-800",
  date: "bg-amber-100 text-amber-800",
  datetime: "bg-amber-100 text-amber-800",
  boolean: "bg-fuchsia-100 text-fuchsia-800",
  picklist: "bg-iris-100 text-iris-700",
  multipicklist: "bg-iris-100 text-iris-700",
  reference: "bg-indigo-100 text-indigo-800",
  email: "bg-charcoal-100 text-charcoal-700",
  phone: "bg-charcoal-100 text-charcoal-700",
  url: "bg-charcoal-100 text-charcoal-700",
};

function FieldRow({ field }: { field: SchemaField }) {
  return (
    <div className="grid grid-cols-1 gap-2 border-t border-charcoal-100 px-3 py-3 md:grid-cols-12 md:items-start">
      <div className="md:col-span-3">
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-semibold text-charcoal-900">{field.label}</span>
          {field.required ? <span className="text-xs font-bold text-rose-500">*</span> : null}
        </div>
        <code className="mt-0.5 block text-[11px] text-charcoal-500">{field.key}</code>
      </div>

      <div className="md:col-span-3">
        <code className="block break-all text-xs font-semibold text-charcoal-800">
          {field.sfdcObject}.{field.sfdcApiName}
        </code>
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${TYPE_TONE[field.type] ?? "bg-charcoal-100 text-charcoal-700"}`}>
            {field.type}
          </span>
          {field.custom ? (
            <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800" title="Custom field. Verify this API name against your Salesforce org">
              custom · verify
            </span>
          ) : (
            <span className="rounded bg-charcoal-100 px-1.5 py-0.5 text-[10px] font-medium text-charcoal-600">standard</span>
          )}
        </div>
      </div>

      <div className="md:col-span-6">
        <p className="text-xs text-charcoal-700">{field.description}</p>
        <p className="mt-1 text-xs text-iris-700">
          <span className="font-semibold">SE/AE value:</span> {field.seValue}
        </p>
        <p className="mt-1 text-[11px] text-charcoal-500">
          <span className="font-semibold">Example:</span> <code>{field.example}</code>
        </p>
        {field.picklistValues && field.picklistValues.length > 0 ? (
          <p className="mt-1 text-[11px] text-charcoal-500">
            <span className="font-semibold">Values:</span> {field.picklistValues.join(", ")}
          </p>
        ) : null}
      </div>
    </div>
  );
}

export function SchemaExplorer() {
  const stats = schemaStats();
  const [open, setOpen] = useState<Record<string, boolean>>(() => ({ [ACCOUNT_SCHEMA[0]?.key ?? ""]: true }));

  const toggle = (key: string) => setOpen((prev) => ({ ...prev, [key]: !prev[key] }));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <StatusPill tone="info">{stats.objectCount} objects</StatusPill>
        <StatusPill tone="neutral">{stats.fieldCount} fields</StatusPill>
        <StatusPill tone="good">{stats.standardCount} standard</StatusPill>
        <StatusPill tone="warning">{stats.customCount} custom</StatusPill>
      </div>

      <p className="text-xs text-charcoal-600">
        This is the shape we will map to Salesforce. Fields marked{" "}
        <span className="rounded bg-amber-100 px-1 py-0.5 text-[10px] font-semibold text-amber-800">custom · verify</span> use a
        best-guess <code>__c</code> API name. Confirm each one against your SFDC org before the live connection.
      </p>

      <div className="space-y-3">
        {ACCOUNT_SCHEMA.map((object) => {
          const isOpen = Boolean(open[object.key]);
          return (
            <div key={object.key} className="overflow-hidden rounded-lg border border-charcoal-200 bg-white">
              <button
                type="button"
                onClick={() => toggle(object.key)}
                className="flex w-full items-center justify-between gap-3 bg-charcoal-50 px-3 py-2.5 text-left hover:bg-charcoal-100"
              >
                <div className="flex items-center gap-2.5">
                  <Table2 className="h-4 w-4 shrink-0 text-iris-600" />
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-charcoal-900">{object.label}</span>
                      <code className="rounded bg-white px-1.5 py-0.5 text-[11px] font-semibold text-iris-700">{object.sfdcObject}</code>
                      <span className="text-[11px] text-charcoal-500">{object.fields.length} fields</span>
                    </div>
                    <p className="mt-0.5 text-xs text-charcoal-500">{object.relationship}</p>
                  </div>
                </div>
                <ChevronDown className={`h-4 w-4 shrink-0 text-charcoal-500 transition-transform ${isOpen ? "rotate-180" : ""}`} />
              </button>
              {isOpen ? (
                <div>
                  <p className="border-t border-charcoal-100 bg-white px-3 py-2 text-xs text-charcoal-600">{object.description}</p>
                  <div className="hidden grid-cols-12 gap-2 border-t border-charcoal-100 bg-white px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-charcoal-400 md:grid">
                    <div className="col-span-3">App field</div>
                    <div className="col-span-3">Salesforce mapping</div>
                    <div className="col-span-6">Description &amp; value</div>
                  </div>
                  {object.fields.map((field) => (
                    <FieldRow key={field.key} field={field} />
                  ))}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
