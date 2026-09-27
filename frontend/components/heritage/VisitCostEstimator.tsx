"use client";

import { useMemo, useState } from "react";
import { Info, RefreshCw, Wallet } from "lucide-react";
import { useApi } from "@/hooks/useApi";

/* ========================================
   Astrova — Visit Cost Estimator (Feature D)
   Every figure is an Astrova model ESTIMATE.
   Official fees are never claimed.
   ======================================== */

interface CostLine {
  category: string;
  min: number;
  typical: number;
  max: number;
  basis: string;
  provenance: "astrova_model";
}

interface CostEstimate {
  currency: "INR";
  visitors: number;
  durationHours: number;
  days: number;
  nights: number;
  lines: CostLine[];
  total: { min: number; typical: number; max: number };
  officialFee: null;
  notes: string[];
}

interface CostResponse {
  estimate: CostEstimate;
}

const TRANSPORTS = [
  { value: "public", label: "Public transport" },
  { value: "private", label: "Private vehicle" },
  { value: "taxi", label: "Taxi / cab" },
  { value: "walk", label: "On foot" },
  { value: "none", label: "No transport" },
];
const FOODS = [
  { value: "budget", label: "Budget" },
  { value: "mid", label: "Mid-range" },
  { value: "premium", label: "Premium" },
  { value: "none", label: "Not included" },
];
const STAYS = [
  { value: "none", label: "No stay (day trip)" },
  { value: "budget", label: "Budget" },
  { value: "mid", label: "Mid-range" },
  { value: "premium", label: "Premium" },
];
const MISC = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
];
const DURATIONS = [
  { value: "2", label: "2 hours" },
  { value: "4", label: "4 hours" },
  { value: "6", label: "6 hours" },
  { value: "8", label: "Full day (8 h)" },
  { value: "12", label: "12 hours" },
];

function inr(value: number): string {
  return `₹${new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(value)}`;
}

interface SelectProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  id: string;
}

function CompactSelect({ label, value, onChange, options, id }: SelectProps) {
  return (
    <label htmlFor={id} className="block">
      <span className="text-xs text-muted">{label}</span>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 w-full rounded-lg border border-cream bg-white/80 px-2.5 py-2 text-sm text-charcoal focus:border-terracotta focus:outline-none"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function VisitCostEstimator({ heritageId }: { heritageId: string }) {
  const [visitors, setVisitors] = useState(2);
  const [duration, setDuration] = useState("4");
  const [transport, setTransport] = useState("public");
  const [food, setFood] = useState("mid");
  const [stay, setStay] = useState("none");
  const [misc, setMisc] = useState("medium");
  const [guide, setGuide] = useState(false);
  const [parking, setParking] = useState(false);

  const query = useMemo(
    () =>
      new URLSearchParams({
        visitors: String(visitors),
        durationHours: duration,
        transport,
        food,
        stay,
        misc,
        guide: String(guide),
        parking: String(parking),
      }).toString(),
    [visitors, duration, transport, food, stay, misc, guide, parking]
  );

  const endpoint = heritageId ? `/heritage/${heritageId}/visit-cost?${query}` : "";
  const { data, loading, error, refetch } = useApi<CostResponse>(endpoint);
  const estimate = data?.estimate;

  return (
    <section aria-labelledby="visit-cost-heading" className="mt-4">
      <div className="rounded-2xl border border-cream bg-white/60 p-6">
        <div className="flex flex-wrap items-end justify-between gap-3 mb-5">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-muted flex items-center gap-1.5">
              <Wallet className="h-3.5 w-3.5" aria-hidden="true" /> Plan your budget
            </p>
            <h3 id="visit-cost-heading" className="mt-1 font-display text-xl text-charcoal">
              Visit cost estimator
            </h3>
          </div>
          <span className="rounded-full bg-heritage-gold/15 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-heritage-gold">
            Astrova estimate
          </span>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          <div>
            <label htmlFor="cost-visitors" className="block text-xs text-muted">
              Visitors
            </label>
            <input
              id="cost-visitors"
              type="number"
              min={1}
              max={50}
              value={visitors}
              onChange={(event) => setVisitors(Math.min(50, Math.max(1, Number(event.target.value) || 1)))}
              className="mt-1 w-full rounded-lg border border-cream bg-white/80 px-2.5 py-2 text-sm text-charcoal focus:border-terracotta focus:outline-none"
            />
          </div>
          <CompactSelect id="cost-duration" label="Visit duration" value={duration} onChange={setDuration} options={DURATIONS} />
          <CompactSelect id="cost-transport" label="Transport" value={transport} onChange={setTransport} options={TRANSPORTS} />
          <CompactSelect id="cost-food" label="Food" value={food} onChange={setFood} options={FOODS} />
          <CompactSelect id="cost-stay" label="Accommodation" value={stay} onChange={setStay} options={STAYS} />
          <CompactSelect id="cost-misc" label="Miscellaneous" value={misc} onChange={setMisc} options={MISC} />
          <label className="flex items-center gap-2 text-sm text-charcoal mt-5 cursor-pointer">
            <input type="checkbox" checked={guide} onChange={(event) => setGuide(event.target.checked)} className="h-4 w-4 accent-terracotta" />
            Guide
          </label>
          <label className="flex items-center gap-2 text-sm text-charcoal mt-5 cursor-pointer">
            <input type="checkbox" checked={parking} onChange={(event) => setParking(event.target.checked)} className="h-4 w-4 accent-terracotta" />
            Parking
          </label>
        </div>

        {loading && !estimate && (
          <div className="mt-5 h-24 animate-pulse rounded-xl bg-cream/50" role="status" aria-label="Calculating estimate" />
        )}

        {error && (
          <div role="alert" className="mt-5 flex items-center justify-between gap-3 rounded-xl border border-terracotta/15 bg-terracotta/5 p-4">
            <p className="text-sm text-muted">The estimate could not be calculated right now.</p>
            <button
              type="button"
              onClick={refetch}
              className="inline-flex items-center gap-1.5 rounded-lg border border-terracotta/20 px-3 py-1.5 text-sm text-terracotta hover:bg-terracotta/10"
              aria-label="Retry cost estimate"
            >
              <RefreshCw className="h-3.5 w-3.5" /> Retry
            </button>
          </div>
        )}

        {estimate && !error && (
          <div className="mt-5">
            <div className="grid gap-3 sm:grid-cols-3">
              {[
                { label: "Minimum", value: estimate.total.min, tone: "text-charcoal" },
                { label: "Typical", value: estimate.total.typical, tone: "text-terracotta" },
                { label: "Maximum", value: estimate.total.max, tone: "text-charcoal" },
              ].map((band) => (
                <div key={band.label} className="rounded-xl bg-cream/40 p-4 text-center">
                  <p className="text-[11px] uppercase tracking-wider text-muted">{band.label}</p>
                  <p className={`mt-1 font-display text-2xl ${band.tone}`}>{inr(band.value)}</p>
                </div>
              ))}
            </div>

            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <caption className="sr-only">Category-wise cost breakdown</caption>
                <thead>
                  <tr className="border-b border-cream text-left text-xs uppercase tracking-wider text-muted">
                    <th scope="col" className="py-2 pr-3 font-medium">Category</th>
                    <th scope="col" className="py-2 pr-3 font-medium text-right">Min</th>
                    <th scope="col" className="py-2 pr-3 font-medium text-right">Typical</th>
                    <th scope="col" className="py-2 font-medium text-right">Max</th>
                  </tr>
                </thead>
                <tbody>
                  {estimate.lines.map((lineItem) => (
                    <tr key={lineItem.category} className="border-b border-cream/60 align-top">
                      <td className="py-2.5 pr-3">
                        <span className="font-medium text-charcoal">{lineItem.category}</span>
                        <span className="mt-0.5 block text-xs text-muted leading-snug">{lineItem.basis}</span>
                      </td>
                      <td className="py-2.5 pr-3 text-right text-charcoal/80">{inr(lineItem.min)}</td>
                      <td className="py-2.5 pr-3 text-right font-semibold text-charcoal">{inr(lineItem.typical)}</td>
                      <td className="py-2.5 text-right text-charcoal/80">{inr(lineItem.max)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="mt-4 flex items-start gap-2 text-xs text-muted">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>
                {estimate.notes.join(" ")}
                {estimate.nights > 0 && ` Modelled stay: ${estimate.nights} night(s), ${estimate.days} day(s).`}
              </span>
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
