"use client";

import { ExternalLink, GitMerge, RefreshCw, ShieldAlert } from "lucide-react";
import { useApi } from "@/hooks/useApi";

/* ========================================
   Astrova — External References (Feature H, PARTIAL)

   Displays Wikidata-sourced candidate facts with full provenance.
   Nothing here is merged into Astrova data — proposals are shown for
   review only, and conflicts/duplicates are surfaced honestly.
   ======================================== */

interface ExternalReferencesProps {
  heritageId: string;
}

interface EnrichmentField {
  field: string;
  value: string;
  provenance: {
    source: string;
    sourceUrl: string;
    license: string;
    retrievedAt: string;
  };
}

interface EnrichmentData {
  status:
    | "matched"
    | "matched_with_conflicts"
    | "duplicate"
    | "no_match"
    | "unavailable";
  candidate: {
    wikidataId: string;
    label: string;
    description: string | null;
    url: string;
    distanceFromEntityKm: number | null;
    matchScore: number;
  } | null;
  proposals: EnrichmentField[];
  conflicts: Array<{ type: string; detail: string }>;
  duplicateOf: { reason: string } | null;
  sources: Array<{ name: string; type: string; url: string }>;
  meta: {
    generatedAt: string;
    provider: string;
    license: string;
    approvalStatus: "pending_review" | "not_applicable";
    note: string;
  };
}

const FIELD_LABELS: Record<string, string> = {
  description: "Description",
  official_website: "Official website",
  inception_year: "Established",
  coordinates: "Coordinates",
  instance_of: "Classified as",
};

function formatTimestamp(value: string): string {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return value;
  return new Date(parsed).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function ExternalReferences({ heritageId }: ExternalReferencesProps) {
  const endpoint = heritageId ? `/heritage/${heritageId}/enrichment` : "";
  const { data, loading, error, refetch } = useApi<EnrichmentData>(endpoint, {
    immediate: Boolean(heritageId),
  });

  if (!heritageId) return null;

  return (
    <div className="mt-6 p-6 bg-cream/20 rounded-2xl border border-cream">
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <GitMerge className="h-5 w-5 text-heritage-gold" aria-hidden="true" />
          <h3 className="font-semibold text-charcoal text-lg">External references</h3>
        </div>
        {!loading && !error && data && (
          <span className="text-[11px] uppercase tracking-wider text-muted">
            {data.meta.provider} · {data.meta.license}
          </span>
        )}
      </div>

      {loading && (
        <div
          className="h-20 animate-pulse rounded-xl bg-cream/50"
          role="status"
          aria-label="Loading external references"
        />
      )}

      {error && (
        <div
          role="alert"
          className="flex items-center justify-between gap-3 rounded-xl border border-terracotta/15 bg-terracotta/5 p-4"
        >
          <p className="text-sm text-muted">
            External references are temporarily unavailable.
          </p>
          <button
            type="button"
            onClick={refetch}
            className="inline-flex items-center gap-1.5 rounded-lg border border-terracotta/20 px-3 py-1.5 text-sm text-terracotta hover:bg-terracotta/10"
            aria-label="Retry external references"
          >
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" /> Retry
          </button>
        </div>
      )}

      {!loading && !error && data && (
        <>
          {data.status === "no_match" && (
            <p className="text-sm text-muted">
              No matching record was found in {data.meta.provider} for this
              heritage entity. Astrova shows nothing rather than a guessed
              reference.
            </p>
          )}

          {data.status === "unavailable" && (
            <div
              role="alert"
              className="flex items-center justify-between gap-3 rounded-xl border border-terracotta/15 bg-terracotta/5 p-4"
            >
              <p className="text-sm text-muted">
                {data.conflicts[0]?.detail ||
                  "External reference service is temporarily unavailable."}
              </p>
              <button
                type="button"
                onClick={refetch}
                className="inline-flex items-center gap-1.5 rounded-lg border border-terracotta/20 px-3 py-1.5 text-sm text-terracotta hover:bg-terracotta/10"
                aria-label="Retry external references"
              >
                <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" /> Retry
              </button>
            </div>
          )}

          {data.status === "duplicate" && (
            <p className="text-sm text-muted">
              {data.duplicateOf?.reason ||
                "Astrova already carries this external reference."}
            </p>
          )}

          {(data.status === "matched" ||
            data.status === "matched_with_conflicts") &&
            data.candidate && (
              <div className="space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-medium text-charcoal">
                      {data.candidate.label}
                    </p>
                    {data.candidate.description && (
                      <p className="text-sm text-muted">
                        {data.candidate.description}
                      </p>
                    )}
                  </div>
                  <a
                    href={data.candidate.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-sm text-terracotta hover:underline shrink-0"
                  >
                    View source
                    <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                  </a>
                </div>

                {data.conflicts.length > 0 && (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                    <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-amber-700 mb-1">
                      <ShieldAlert className="h-3.5 w-3.5" aria-hidden="true" />
                      Conflicts detected — review before using
                    </p>
                    {data.conflicts.map((conflict) => (
                      <p key={conflict.detail} className="text-sm text-amber-800">
                        {conflict.detail}
                      </p>
                    ))}
                  </div>
                )}

                <p className="text-xs font-medium uppercase tracking-wider text-muted">
                  Proposed facts (not merged into Astrova)
                </p>
                <dl className="space-y-2">
                  {data.proposals.map((proposal) => (
                    <div
                      key={proposal.field}
                      className="flex flex-wrap items-baseline gap-x-2 text-sm"
                    >
                      <dt className="text-muted min-w-28">
                        {FIELD_LABELS[proposal.field] || proposal.field}
                      </dt>
                      <dd className="text-charcoal flex-1 min-w-0 break-words">
                        {proposal.field === "official_website" ? (
                          <a
                            href={proposal.value}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-terracotta hover:underline break-all"
                          >
                            {proposal.value}
                          </a>
                        ) : (
                          proposal.value
                        )}
                      </dd>
                    </div>
                  ))}
                </dl>

                <p className="text-xs text-muted border-t border-cream pt-3">
                  {data.meta.note} Source:{" "}
                  <a
                    href={data.candidate.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-terracotta hover:underline"
                  >
                    {data.meta.provider}
                  </a>{" "}
                  ({data.meta.license}) · Retrieved{" "}
                  {formatTimestamp(data.meta.generatedAt)} · Match confidence{" "}
                  {Math.round(data.candidate.matchScore * 100)}%
                  {data.candidate.distanceFromEntityKm != null &&
                    ` · ${data.candidate.distanceFromEntityKm} km from mapped location`}
                  .
                </p>
              </div>
            )}
        </>
      )}
    </div>
  );
}
