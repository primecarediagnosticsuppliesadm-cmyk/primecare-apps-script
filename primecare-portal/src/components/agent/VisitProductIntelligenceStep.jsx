import React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ChevronDown, ChevronUp, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  FREQUENCY_OPTIONS,
  PAIN_POINT_OPTIONS,
  PRODUCT_CATEGORY_OPTIONS,
  SWITCH_OPTIONS,
  createEmptyProductLine,
  isProductLineCaptured,
} from "@/visits/labProductIntelligenceModel.js";

function FieldLabel({ children, helper }) {
  return (
    <div className="mb-1">
      <p className="text-sm font-semibold text-foreground">{children}</p>
      {helper ? <p className="text-[11px] text-muted-foreground">{helper}</p> : null}
    </div>
  );
}

function ProductCard({ line, index, onChange, onRemove, canRemove }) {
  const captured = isProductLineCaptured(line);

  function patch(partial) {
    onChange({ ...line, ...partial });
  }

  return (
    <div
      className={cn(
        "space-y-3 rounded-2xl border p-3 shadow-sm md:p-4",
        captured
          ? "border-[var(--pc-brand-primary)]/30 bg-card"
          : "border-border/70 bg-muted/20"
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-bold text-foreground">Product {index + 1}</p>
        {canRemove ? (
          <Button
            type="button"
            variant="ghost"
            className="h-11 min-h-11 px-3 text-sm text-destructive"
            onClick={onRemove}
            aria-label={`Remove product ${index + 1}`}
          >
            <Trash2 className="mr-1 h-4 w-4" />
            Remove
          </Button>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-3">
        <div>
          <FieldLabel helper="What do they buy?">Category / product</FieldLabel>
          <Select
            value={line.productCategory || ""}
            onValueChange={(value) => patch({ productCategory: value })}
          >
            <SelectTrigger className="h-12 rounded-xl text-base">
              <SelectValue placeholder="Select category" />
            </SelectTrigger>
            <SelectContent>
              {PRODUCT_CATEGORY_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <FieldLabel helper="e.g. BD, Vacuette, local">Brand</FieldLabel>
          <Input
            value={line.brand}
            onChange={(e) => patch({ brand: e.target.value })}
            placeholder="Current brand"
            className="h-12 rounded-xl text-base"
          />
        </div>

        <div>
          <FieldLabel helper="Packs or units per month — approximate is fine">
            Approx monthly quantity
          </FieldLabel>
          <Input
            inputMode="decimal"
            value={line.monthlyQuantity}
            onChange={(e) => patch({ monthlyQuantity: e.target.value })}
            placeholder="e.g. 20"
            className="h-12 rounded-xl text-base"
          />
        </div>

        <div>
          <FieldLabel helper="Who supplies this line today?">Current supplier</FieldLabel>
          <Input
            value={line.currentSupplier}
            onChange={(e) => patch({ currentSupplier: e.target.value })}
            placeholder="Distributor / supplier name"
            className="h-12 rounded-xl text-base"
          />
        </div>

        <div>
          <FieldLabel helper="Why might they switch?">Primary pain point</FieldLabel>
          <Select
            value={line.primaryPainPoint || ""}
            onValueChange={(value) => patch({ primaryPainPoint: value })}
          >
            <SelectTrigger className="h-12 rounded-xl text-base">
              <SelectValue placeholder="Select pain point" />
            </SelectTrigger>
            <SelectContent>
              {PAIN_POINT_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <Button
        type="button"
        variant="ghost"
        className="h-11 min-h-11 w-full justify-between rounded-xl text-sm"
        onClick={() => patch({ expanded: !line.expanded })}
      >
        <span>{line.expanded ? "Hide extra details" : "More details (optional)"}</span>
        {line.expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </Button>

      {line.expanded ? (
        <div className="grid grid-cols-1 gap-3 border-t border-border/60 pt-3">
          <div>
            <FieldLabel>SKU / size / spec</FieldLabel>
            <Input
              value={line.skuSpec}
              onChange={(e) => patch({ skuSpec: e.target.value })}
              placeholder="e.g. 2ml K2 EDTA"
              className="h-12 rounded-xl text-base"
            />
          </div>
          <div>
            <FieldLabel>Pack size</FieldLabel>
            <Input
              value={line.packSize}
              onChange={(e) => patch({ packSize: e.target.value })}
              placeholder="e.g. 100 / box"
              className="h-12 rounded-xl text-base"
            />
          </div>
          <div>
            <FieldLabel>Current purchase price (₹)</FieldLabel>
            <Input
              inputMode="decimal"
              value={line.currentPurchasePrice}
              onChange={(e) => patch({ currentPurchasePrice: e.target.value })}
              placeholder="Unit or pack price"
              className="h-12 rounded-xl text-base"
            />
          </div>
          <div>
            <FieldLabel>Purchase frequency</FieldLabel>
            <Select
              value={line.purchaseFrequency || ""}
              onValueChange={(value) => patch({ purchaseFrequency: value })}
            >
              <SelectTrigger className="h-12 rounded-xl text-base">
                <SelectValue placeholder="How often?" />
              </SelectTrigger>
              <SelectContent>
                {FREQUENCY_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <FieldLabel>Willingness to switch</FieldLabel>
            <Select
              value={line.willingnessToSwitch || ""}
              onValueChange={(value) => patch({ willingnessToSwitch: value })}
            >
              <SelectTrigger className="h-12 rounded-xl text-base">
                <SelectValue placeholder="Switch intent" />
              </SelectTrigger>
              <SelectContent>
                {SWITCH_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <FieldLabel>Alternative brand acceptable</FieldLabel>
            <Input
              value={line.alternativeBrandOk}
              onChange={(e) => patch({ alternativeBrandOk: e.target.value })}
              placeholder="Yes / No / which brand"
              className="h-12 rounded-xl text-base"
            />
          </div>
          <div className="rounded-xl border border-violet-200/80 bg-violet-50/50 p-3">
            <label className="flex min-h-11 items-center gap-2 text-sm font-semibold">
              <input
                type="checkbox"
                className="h-5 w-5"
                checked={Boolean(line.sampleRequested)}
                onChange={(e) => patch({ sampleRequested: e.target.checked })}
              />
              Sample requested or issued for this product
            </label>
            {line.sampleRequested ? (
              <div className="mt-3 grid grid-cols-1 gap-3">
                <Input
                  value={line.sampleSku}
                  onChange={(e) => patch({ sampleSku: e.target.value })}
                  placeholder="Sample SKU (PrimeCare or incumbent)"
                  className="h-12 rounded-xl text-base"
                />
                <Input
                  inputMode="decimal"
                  value={line.sampleQuantity}
                  onChange={(e) => patch({ sampleQuantity: e.target.value })}
                  placeholder="Sample quantity"
                  className="h-12 rounded-xl text-base"
                />
                <Input
                  type="date"
                  value={line.sampleIssuedAt}
                  onChange={(e) => patch({ sampleIssuedAt: e.target.value })}
                  className="h-12 rounded-xl text-base"
                />
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default function VisitProductIntelligenceStep({
  lines,
  onChange,
  loading,
}) {
  const list = Array.isArray(lines) && lines.length ? lines : [createEmptyProductLine()];

  function updateAt(index, next) {
    const copy = list.map((row, i) => (i === index ? next : row));
    onChange(copy);
  }

  function removeAt(index) {
    const copy = list.filter((_, i) => i !== index);
    onChange(copy.length ? copy : [createEmptyProductLine()]);
  }

  function addLine() {
    onChange([...list, createEmptyProductLine()]);
  }

  return (
    <div className="space-y-3">
      {loading ? (
        <p className="text-sm text-muted-foreground">Loading products already on file…</p>
      ) : null}
      <p className="text-sm text-muted-foreground">
        Capture what this lab already buys. One card per product line — EDTA, SST, gloves can each have a
        different brand and supplier. Skip any field you do not know.
      </p>
      {list.map((line, index) => (
        <ProductCard
          key={line.clientKey || line.id || `line-${index}`}
          line={line}
          index={index}
          onChange={(next) => updateAt(index, next)}
          onRemove={() => removeAt(index)}
          canRemove={list.length > 1 || isProductLineCaptured(line)}
        />
      ))}
      <Button
        type="button"
        variant="outline"
        className="h-12 min-h-12 w-full rounded-xl text-base font-semibold"
        onClick={addLine}
      >
        <Plus className="mr-2 h-4 w-4" />
        Add another product
      </Button>
    </div>
  );
}
