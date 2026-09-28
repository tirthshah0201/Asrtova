"use client";

import { Suspense, useState, useCallback, useMemo, useEffect } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { openSearchModal } from "@/components/ui/SearchModal";
import { motion } from "motion/react";
import { Container } from "@/components/ui/Container";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { SearchInput } from "@/components/ui/SearchInput";
import { SearchSuggestions } from "@/components/ui/SearchSuggestions";
import { LoadingState } from "@/components/ui/LoadingState";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { FadeIn } from "@/components/motion/FadeIn";
import { Stagger, StaggerItem } from "@/components/motion/Stagger";
import { useApi } from "@/hooks/useApi";
import { INDIAN_STATES } from "@/constants/india";
import {
  MapPin,
  Building2,
  Search,
  Landmark,
  ChevronRight,
  Compass,
  Bot,
  X,
  Clock,
} from "lucide-react";

// Dynamic import for Leaflet map (no SSR)
const AstrovaMap = dynamic(
  () => import("@/components/map/AstrovaMap").then((mod) => mod.AstrovaMap),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-[500px] rounded-xl border border-border bg-parchment animate-pulse flex items-center justify-center">
        <div className="flex items-center gap-2 text-muted">
          <div className="h-4 w-4 border-2 border-terracotta border-t-transparent rounded-full animate-spin" />
          <span className="text-sm">Loading map...</span>
        </div>
      </div>
    ),
  }
);

/* ========================================
   Types
   ======================================== */

interface Location {
  id: string;
  name: string;
  type: string;
  description: string;
  latitude: number | null;
  longitude: number | null;
  parent_id: string | null;
  state: string;
}

interface SearchResult {
  id: string;
  name: string;
  category: string;
  description: string;
  location_id: string | null;
  period_id: string | null;
  period_name: string | null;
  state: string | null;
  source: "heritage" | "location";
}



/* ========================================
   Helpers
   ======================================== */

const locationTypeIcons: Record<string, typeof Building2> = {
  state: MapPin,
  district: Building2,
  city: Building2,
  village: MapPin,
  site: Landmark,
};

/* ========================================
   Page Component
   ======================================== */

function ExploreContent() {
  const router = useRouter();

  // Read URL search params reactively — updates when URL changes via Link navigation
  const searchParams = useSearchParams();
  const selectedState = searchParams.get("state") || "";
  const focusLocationId = searchParams.get("focus") || null;

  const [activeTab, setActiveTab] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");



  // Fetch heritage counts per state
  const { data: stateCounts } = useApi<Array<{ state: string; heritage_count: number }>>("/heritage/state-counts");
  const stateCountMap = useMemo(() => {
    if (!stateCounts) return new Map<string, number>();
    return new Map(stateCounts.map(sc => [sc.state, sc.heritage_count]));
  }, [stateCounts]);

  // Fetch locations based on type filter
  const typeParam = activeTab !== "all" ? `?type=${activeTab}` : "";
  const { data: locations, loading, error, refetch } = useApi<Location[]>(`/locations${typeParam}`);

  // Filter locations by selected state
  const filteredLocations = useMemo(() => {
    if (!locations) return null;
    if (!selectedState) return locations;
    return locations.filter((loc) =>
      loc.state?.toLowerCase() === selectedState.toLowerCase()
    );
  }, [locations, selectedState]);

  // Update URL when state changes (selectedState is derived from searchParams)
  const handleStateChange = (state: string) => {
    if (state) {
      router.push(`/explore?state=${encodeURIComponent(state)}`, { scroll: false });
    } else {
      router.push("/explore", { scroll: false });
    }
  };

  // Fetch search results when there's a query, with state filter
  const searchUrl = debouncedQuery.trim()
    ? `/search?q=${encodeURIComponent(debouncedQuery.trim())}${selectedState ? `&state=${encodeURIComponent(selectedState)}` : ""}`
    : "";
  const { data: searchResults, loading: searchLoading } = useApi<SearchResult[]>(
    searchUrl,
    { immediate: false }
  );

  // Trigger search with debounce
  const debounceRef = useCallback(() => {
    let timeoutId: ReturnType<typeof setTimeout>;
    return (value: string) => {
      clearTimeout(timeoutId);
      setSearchQuery(value);
      timeoutId = setTimeout(() => {
        setDebouncedQuery(value);
      }, 400);
    };
  }, []);

  const handleSearch = debounceRef();

  const tabs = [
    { id: "all", label: "All" },
    { id: "district", label: "Districts" },
    { id: "city", label: "Cities" },
    { id: "site", label: "Heritage Sites" },
  ];

  const isSearching = debouncedQuery.trim().length > 0;
  const displayResults = isSearching ? searchResults : locations;

  return (
    <div className="py-8 sm:py-12">
      <Container>
        {/* Header */}
        <FadeIn>
          <div className="mb-8">
            <div className="flex items-center gap-2 mb-2">
              <Compass className="h-5 w-5 text-terracotta" />
              <span className="text-sm font-medium text-terracotta">Explore India</span>
            </div>
            <h1 className="font-display text-3xl sm:text-4xl text-charcoal mb-2">
              {focusLocationId ? "Viewing Location" : selectedState ? `Heritage in ${selectedState}` : "Discover India's Heritage"}
            </h1>
            <p className="text-muted max-w-xl">
              {focusLocationId ? (
                <>
                  Location highlighted on the map below.
                  <button                     onClick={() => { router.push('/explore', { scroll: false }); }}
                    className="inline-flex items-center gap-1 ml-2 text-terracotta font-medium hover:text-terracotta-dark transition-colors"
                  >
                    <X className="h-3 w-3" /> Clear focus
                  </button>
                </>
              ) : selectedState ? (
                <>
                  Exploring cultural heritage sites and landmarks in {selectedState}.
                  <button
                    onClick={() => handleStateChange("")}
                    className="inline-flex items-center gap-1 ml-2 text-terracotta font-medium hover:text-terracotta-dark transition-colors"
                  >
                    <X className="h-3 w-3" /> Clear filter
                  </button>
                </>
              ) : (
                "Search and explore locations, heritage sites, and cultural landmarks across India."
              )}
            </p>
          </div>
        </FadeIn>

        {/* Interactive Heritage Map */}
        <FadeIn delay={0.08}>
          <div className="mb-10">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-semibold text-charcoal">Heritage Map</h2>
                <p className="text-sm text-muted">Interactive map of India&apos;s cultural heritage sites</p>
              </div>
              <a
                href="/ai"
                className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 text-white text-xs font-semibold rounded-lg transition-colors"
                style={{ backgroundColor: '#dc2626' }}
              >
                <Bot className="h-3.5 w-3.5" />
                Ask AI
              </a>
            </div>
            <AstrovaMap
              height="520px"
              focusLocationId={focusLocationId}
              focusState={selectedState || null}
              onAskAI={(ctx) => {
                window.location.href = `/ai?question=Tell me about ${encodeURIComponent(ctx.name)} in ${ctx.state}`;
              }}
            />
          </div>
        </FadeIn>

        {/* State Cards */}
        <FadeIn delay={0.1}>
          <div className="mb-8">
            <h2 className="text-lg font-semibold text-charcoal mb-4">Explore by State</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {INDIAN_STATES.map((state) => (
                <Link key={state.code} href={`/explore?state=${encodeURIComponent(state.name)}`} onClick={(e) => { e.preventDefault(); handleStateChange(state.name); }}>
                  <motion.div
                    whileHover={{ y: -2, boxShadow: "0 6px 20px rgba(45,42,38,0.08)" }}
                    className={`rounded-lg border p-4 cursor-pointer transition-colors ${selectedState === state.name ? "border-terracotta bg-terracotta/5" : "border-border bg-card"}`}
                  >
                    <div className="h-1 w-full rounded-full mb-3" style={{ backgroundColor: state.color }} />
                    <h3 className={`font-semibold text-sm ${selectedState === state.name ? "text-terracotta" : "text-charcoal"}`}>{state.name}</h3>
                    <p className="text-xs text-muted mt-0.5">{state.region}</p>
                    <p className="text-[11px] text-terracotta mt-2 flex items-center gap-1">
                      {stateCountMap.get(state.name) ?? state.heritageCount} sites <ChevronRight className="h-3 w-3" />
                    </p>
                  </motion.div>
                </Link>
              ))}
            </div>
          </div>
        </FadeIn>            {/* Search and Tabs */}
        <FadeIn delay={0.15}>
          <div className="mb-6">
            <div className="relative max-w-md mb-4">
              <SearchInput
                placeholder="Search locations, heritage sites, states..."
                aria-label="Search explore"
                onSearch={handleSearch}
                value={searchQuery}
              />
              <SearchSuggestions
                query={searchQuery}
                onSelect={() => { setSearchQuery(""); setDebouncedQuery(""); }}
              />
            </div>

            {!isSearching && (
              <>
                <div className="flex gap-1 border-b border-border">
                  {tabs.map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
                        activeTab === tab.id
                          ? "border-terracotta text-charcoal"
                          : "border-transparent text-muted hover:text-charcoal hover:border-warm-gray"
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
                {selectedState && (
                  <div className="flex items-center gap-2 mt-3">
                    <span className="text-xs text-muted">Filtering by:</span>
                    <span className="inline-flex items-center gap-1 px-2 py-1 bg-terracotta/10 text-terracotta rounded-full text-xs font-medium">
                      {selectedState}
                      <button onClick={() => handleStateChange("")} className="hover:text-terracotta-dark">
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  </div>
                )}
              </>
            )}
          </div>
        </FadeIn>

        {/* Results */}
        <FadeIn delay={0.2}>
          {/* Loading */}
          {(loading || searchLoading) && <LoadingState message={isSearching ? "Searching..." : "Loading locations..."} />}

          {/* Error */}
          {error && (
            <ErrorState title="Unable to load locations" message={error} onRetry={refetch} />
          )}

          {/* Results */}
          {!loading && !searchLoading && !error && displayResults && (isSearching ? displayResults.length > 0 : (filteredLocations?.length ?? 0) > 0) && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {isSearching
                ? (displayResults as SearchResult[]).map((result) => (
                    <Link key={result.id} href={result.source === "location" ? `/explore?focus=${result.id}` : `/heritage/${result.id}`}>
                      <motion.div
                        whileHover={{ y: -2, boxShadow: "0 6px 20px rgba(45,42,38,0.08)" }}
                        className="rounded-xl border border-border bg-card p-4 cursor-pointer"
                      >
                        <div className="flex items-start gap-3">
                          <div className={`flex h-9 w-9 items-center justify-center rounded-lg shrink-0 ${result.source === 'heritage' ? 'bg-heritage-gold/10' : 'bg-terracotta/10'}`}>
                            {result.source === 'heritage' ? (
                              <Landmark className="h-4 w-4 text-heritage-gold" />
                            ) : (
                              <MapPin className="h-4 w-4 text-terracotta" />
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <h4 className="text-sm font-semibold text-charcoal truncate">{result.name}</h4>
                              <Badge variant="outline" className="text-[10px] shrink-0 capitalize">{result.source}</Badge>
                            </div>
                            <div className="flex items-center gap-2 mt-0.5">
                              <Badge variant="outline" className="text-[10px]">{result.category}</Badge>
                              {result.state && (
                                <span className="text-[10px] text-muted">{result.state}</span>
                              )}
                              {result.period_name && (
                                <Badge variant="secondary" className="text-[9px] bg-heritage-gold/10 text-heritage-gold border-heritage-gold/20">
                                  <Clock className="h-2.5 w-2.5 mr-0.5" />
                                  {result.period_name}
                                </Badge>
                              )}
                            </div>
                            <p className="text-xs text-muted mt-1.5 line-clamp-2 leading-relaxed">{result.description}</p>
                          </div>
                        </div>
                      </motion.div>
                    </Link>
                  ))
                : (filteredLocations as Location[]).map((loc) => {
                    const Icon = locationTypeIcons[loc.type] || Building2;
                    return (
                      <Link key={loc.id} href={`/explore?focus=${loc.id}`}>
                        <motion.div
                          whileHover={{ y: -2, boxShadow: "0 6px 20px rgba(45,42,38,0.08)" }}
                          className="rounded-xl border border-border bg-card p-4 cursor-pointer"
                        >
                          <div className="flex items-start gap-3">
                            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-terracotta/10 shrink-0">
                              <Icon className="h-4 w-4 text-terracotta" />
                            </div>
                            <div className="min-w-0">
                              <h4 className="text-sm font-semibold text-charcoal">{loc.name}</h4>
                              <Badge variant="outline" className="mt-1 text-[10px]">{loc.type}</Badge>
                              <p className="text-xs text-muted mt-1.5 line-clamp-2">{loc.description}</p>
                            </div>
                          </div>
                        </motion.div>
                      </Link>
                    );
                  })}
            </div>
          )}

          {/* Search result count */}
          {isSearching && !loading && !searchLoading && !error && displayResults && displayResults.length > 0 && (
            <div className="mb-4">
              <p className="text-sm text-muted">
                Found <span className="font-medium text-charcoal">{displayResults.length}</span> result{displayResults.length !== 1 ? 's' : ''} for &quot;{debouncedQuery}&quot;
              </p>
            </div>
          )}

          {/* Empty state */}
          {!loading && !searchLoading && !error && (!displayResults || displayResults.length === 0) && (
            <EmptyState
              icon={<Search className="h-8 w-8" />}
              title={isSearching ? "No results found" : "No locations available"}
              description={
                isSearching
                  ? `No results found for "${debouncedQuery}". Try a different search term or explore by state above.`
                  : "Locations will appear here once they are added to the database."
              }
            />
          )}
        </FadeIn>
      </Container>
    </div>
  );
}

export default function ExplorePage() {
  // useSearchParams() requires a Suspense boundary for static generation.
  return (
    <Suspense
      fallback={
        <div className="min-h-[60vh] animate-pulse rounded-2xl bg-cream/40 m-6" aria-label="Loading explore" />
      }
    >
      <ExploreContent />
    </Suspense>
  );
}
