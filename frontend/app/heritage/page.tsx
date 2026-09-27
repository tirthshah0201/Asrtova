"use client";

import { useState, useMemo, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { motion } from "motion/react";
import { Container } from "@/components/ui/Container";
import { Badge } from "@/components/ui/Badge";
import { LoadingState } from "@/components/ui/LoadingState";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { FadeIn } from "@/components/motion/FadeIn";
import { Stagger, StaggerItem } from "@/components/motion/Stagger";
import { useApi } from "@/hooks/useApi";
import {
  Landmark,
  Users,
  Palette,
  Calendar,
  UtensilsCrossed,
  Clock,
  MapPin,
  BookOpen,
  Theater,
  Search,
  X,
  Timer,
} from "lucide-react";
import { SearchSuggestions } from "@/components/ui/SearchSuggestions";
import { FavoriteButton } from "@/components/ui/FavoriteButton";
import { useFavorites } from "@/hooks/useFavorites";
import { useAuth } from "@/hooks/useAuth";
import { getHeritageImage } from "@/constants/images";
import { getCategoryIcon } from "@/constants/categories";

/* ========================================
   Types
   ======================================== */

interface HeritagePeriod {
  id: string;
  name: string;
  start_year: number;
  end_year: number | null;
}

interface HeritageEntity {
  id: string;
  name: string;
  slug: string;
  category: string;
  description: string;
  location_id: string | null;
  period_id: string | null;
  image_url: string | null;
  created_at: string;
  source?: {
    id: string;
    title: string | null;
    publisher: string | null;
    source_type: string;
    verification_status: string;
  } | null;
  location?: {
    id: string;
    name: string;
    state: string;
  } | null;
  period?: {
    id: string;
    name: string;
    start_year: number;
    end_year: number | null;
  } | null;
}

/* ========================================
   Helpers
   ======================================== */

function formatYearRange(start: number, end: number | null): string {
  const fmt = (y: number) => (y < 0 ? `${Math.abs(y)} BCE` : `${y} CE`);
  return end != null ? `${fmt(start)}–${fmt(end)}` : `${fmt(start)}–Present`;
}

/* ========================================
   Category icons
   ======================================== */



const categories = [
  { id: "monument", label: "Monuments", icon: Landmark },
  { id: "person", label: "People", icon: Users },
  { id: "craft", label: "Crafts", icon: Palette },
  { id: "festival", label: "Festivals", icon: Calendar },
  { id: "architecture", label: "Architecture", icon: Landmark },
  { id: "event", label: "Events", icon: Clock },
  { id: "food", label: "Food", icon: UtensilsCrossed },
  { id: "community", label: "Communities", icon: Theater },
  { id: "tradition", label: "Traditions", icon: BookOpen },
];

/* Human-readable label for a category id not in the curated list
   (e.g. "natural_landmark" → "Natural Landmark"). */
function prettifyCategory(id: string): string {
  return id.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/* ========================================
   Page Component
   ======================================== */

function HeritageContent() {
  const { user } = useAuth();
  const { favorites, isFavorited, toggleFavorite } = useFavorites(!!user, false);
  const searchParams = useSearchParams();
  const initialCategory = searchParams.get("category") || null;
  const initialPeriod = searchParams.get("period") || null;
  const initialState = searchParams.get("state") || null;

  const [activeCategory, setActiveCategory] = useState<string | null>(initialCategory);
  const [activeState, setActiveState] = useState<string | null>(initialState);
  const [activePeriod, setActivePeriod] = useState<string | null>(initialPeriod);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<string>("name");

  // Build API query params for server-side filtering
  const apiParams = useMemo(() => {
    const params = new URLSearchParams();
    if (activeCategory) params.set("category", activeCategory);
    if (activeState) params.set("state", activeState);
    if (activePeriod) params.set("period", activePeriod);
    if (searchQuery.trim()) params.set("q", searchQuery.trim());
    params.set("sort", sortBy);
    const qs = params.toString();
    return qs ? `?${qs}` : "";
  }, [activeCategory, activeState, activePeriod, searchQuery, sortBy]);

  const { data: heritage, loading, error, refetch } = useApi<HeritageEntity[]>(
    `/heritage${apiParams}`
  );

  // Fetch periods for the filter dropdown
  const { data: periods } = useApi<HeritagePeriod[]>("/periods");

  // Display heritage (already server-filtered/sorted)
  const displayHeritage = useMemo(() => heritage || [], [heritage]);

  // Use state-counts endpoint for state filter options (avoids fetching all heritage)
  const { data: stateCounts } = useApi<Array<{ state: string; heritage_count: number }>>("/heritage/state-counts");
  const availableStates = useMemo(() => {
    if (!stateCounts) return [];
    return stateCounts.map(s => s.state).sort();
  }, [stateCounts]);

  const groupedHeritage = useMemo(() => {
    return displayHeritage.reduce(
      (acc, item) => {
        if (!acc[item.category]) {
          acc[item.category] = [];
        }
        acc[item.category].push(item);
        return acc;
      },
      {} as Record<string, HeritageEntity[]>
    );
  }, [displayHeritage]);

  // Additional categories present in the data but not in the curated list
  // (waterfall, lake, wildlife, …) — surfaced so no entry is ever hidden.
  const extraCategories = useMemo(() => {
    const known = new Set(categories.map((cat) => cat.id));
    return Object.keys(groupedHeritage)
      .filter((id) => !known.has(id))
      .sort()
      .map((id) => ({ id, label: prettifyCategory(id), icon: getCategoryIcon(id) }));
  }, [groupedHeritage]);

  const categoryChips = useMemo(
    () => [...categories, ...extraCategories],
    [extraCategories]
  );

  // Get unique categories from results (curated + data-derived)
  const activeCategories = useMemo(() => {
    return categoryChips.filter((cat) => groupedHeritage[cat.id]?.length > 0);
  }, [categoryChips, groupedHeritage]);

  const hasResults = displayHeritage.length > 0;
  const isSearching = searchQuery.trim().length > 0 || activeState !== null || activePeriod !== null || activeCategory !== null;

  const hasActiveFilters = searchQuery.trim().length > 0 || activeCategory || activeState || activePeriod;

  return (
    <div className="py-8 sm:py-12">
      <Container>
        {/* Header */}
        <FadeIn>
          <div className="mb-6">
            <div className="flex items-center gap-2 mb-2">
              <BookOpen className="h-5 w-5 text-terracotta" />
              <span className="text-sm font-medium text-terracotta">Heritage Directory</span>
            </div>
            <h1 className="font-display text-3xl sm:text-4xl text-charcoal mb-2">
              India&apos;s Heritage
            </h1>
            <p className="text-muted max-w-xl">
              Explore heritage across monuments, people, crafts, traditions, festivals, and more.
            </p>
            <Link
              href="/timeline"
              className="inline-flex items-center gap-1.5 mt-3 text-sm text-terracotta hover:text-terracotta-dark font-medium transition-colors"
            >
              <Timer className="h-4 w-4" />
              View Historical Timeline
            </Link>
          </div>
        </FadeIn>

        {/* Search and Filters */}
        <FadeIn delay={0.1}>
          <div className="mb-6 space-y-4">
            {/* Search Input */}
            <div className="relative max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") e.currentTarget.blur();
                }}
                placeholder="Search heritage by name, category, or description..."
                className="w-full rounded-lg border border-border bg-white pl-10 pr-10 py-2.5 text-sm text-charcoal placeholder:text-warm-gray outline-none focus:border-terracotta focus:ring-1 focus:ring-terracotta/30 transition-colors"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-parchment transition-colors"
                >
                  <X className="h-4 w-4 text-muted" />
                </button>
              )}
              <SearchSuggestions query={searchQuery} onSelect={() => setSearchQuery("")} />
            </div>

            {/* Category Chips */}
            <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 sm:flex-wrap sm:overflow-visible sm:pb-0">
              <button
                onClick={() => { setActiveCategory(null); window.history.replaceState({}, '', '/heritage'); }}
                className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                  activeCategory === null
                    ? "bg-terracotta text-white"
                    : "bg-parchment text-muted hover:bg-cream hover:text-charcoal"
                }`}
              >
                All
              </button>
              {categoryChips.map((cat) => {
                const Icon = cat.icon;
                const count = groupedHeritage[cat.id]?.length ?? 0;
                return (
                  <button
                    key={cat.id}
                    onClick={() => { setActiveCategory(cat.id); window.history.replaceState({}, '', `/heritage?category=${cat.id}`); }}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                      activeCategory === cat.id
                        ? "bg-terracotta text-white"
                        : "bg-parchment text-muted hover:bg-cream hover:text-charcoal"
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {cat.label}
                    {!isSearching && count > 0 && (
                      <span className="text-[10px] opacity-70">({count})</span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* State + Period Filters */}
            <div className="space-y-3 sm:space-y-0 sm:flex sm:flex-wrap sm:gap-4 sm:items-start min-w-0">
              {/* State Filter */}
              {availableStates.length > 0 && (
                <div className="flex gap-1.5 items-center overflow-x-auto pb-1 max-w-full min-w-0">
                  <span className="text-xs text-muted mr-1">State:</span>
                  <button
                    onClick={() => setActiveState(null)}
                    className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                      activeState === null
                        ? "bg-charcoal text-white"
                        : "bg-parchment/50 text-muted hover:text-charcoal"
                    }`}
                  >
                    All
                  </button>
                  {availableStates.map((state) => (
                    <button
                      key={state}
                      onClick={() => { setActiveState(state); window.history.replaceState({}, '', `/heritage?state=${encodeURIComponent(state)}`); }}
                      className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                        activeState === state
                          ? "bg-charcoal text-white"
                          : "bg-parchment/50 text-muted hover:text-charcoal"
                      }`}
                    >
                      {state}
                    </button>
                  ))}
                </div>
              )}

              {/* Period Filter */}
              {periods && periods.length > 0 && (
                <div className="flex gap-1.5 items-center overflow-x-auto pb-1 max-w-full min-w-0">
                  <span className="text-xs text-muted mr-1">Period:</span>
                  <button
                    onClick={() => setActivePeriod(null)}
                    className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                      activePeriod === null
                        ? "bg-charcoal text-white"
                        : "bg-parchment/50 text-muted hover:text-charcoal"
                    }`}
                  >
                    All
                  </button>
                  {periods.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => { setActivePeriod(p.id); window.history.replaceState({}, '', `/heritage?period=${p.id}`); }}
                      className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                        activePeriod === p.id
                          ? "bg-charcoal text-white"
                          : "bg-parchment/50 text-muted hover:text-charcoal"
                      }`}
                    >
                      {p.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </FadeIn>

        {/* Loading */}
        {loading && <LoadingState message="Loading heritage..." />}

        {/* Error */}
        {error && (
          <ErrorState title="Unable to load heritage" message={error} onRetry={refetch} />
        )}

        {/* Empty */}
        {!loading && !error && displayHeritage.length === 0 && (
          <EmptyState
            icon={<Search className="h-8 w-8" />}
            title={isSearching ? "No results found" : "No heritage entries"}
            description={
              isSearching
                ? `No heritage entries match your current filters. Try adjusting your search or filters.`
                : activeCategory
                ? `No heritage entries found in the "${activeCategory}" category.`
                : "Heritage entries will appear here once they are added to the database."
            }
          />
        )}

        {/* Results */}
        {!loading && !error && hasResults && (
          <div>
            {/* Result count + Sort + Clear */}
            <div className="mb-6 flex items-center justify-between flex-wrap gap-3">
              <p className="text-sm text-muted">
                {isSearching ? (
                  <>
                    Showing <span className="font-medium text-charcoal">{displayHeritage.length}</span>{" "}
                    result{displayHeritage.length !== 1 ? "s" : ""}
                    {searchQuery && <> for &quot;{searchQuery}&quot;</>}
                    {activeState && <> in {activeState}</>}
                    {activeCategory && <> · {activeCategory}</>}
                    {activePeriod && <> · {periods?.find(p => p.id === activePeriod)?.name}</>}
                  </>
                ) : (
                  <>
                    Showing <span className="font-medium text-charcoal">{displayHeritage.length}</span>{" "}
                    heritage {displayHeritage.length === 1 ? "entry" : "entries"} across{" "}
                    <span className="font-medium text-charcoal">{activeCategories.length}</span>{" "}
                    categor{activeCategories.length !== 1 ? "ies" : "y"}
                  </>
                )}
              </p>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted">Sort:</span>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  className="text-xs border border-border rounded-md px-2 py-1 bg-white text-charcoal outline-none focus:border-terracotta"
                >
                  <option value="name">Name A–Z</option>
                  <option value="name-desc">Name Z–A</option>
                  <option value="state">State</option>
                  <option value="category">Category</option>
                </select>
                {hasActiveFilters && (                    <button
                    onClick={() => {
                      setSearchQuery("");
                      setActiveCategory(null);
                      setActiveState(null);
                      setActivePeriod(null);
                      window.history.replaceState({}, '', '/heritage');
                    }}
                    className="text-xs text-terracotta hover:text-terracotta-dark font-medium transition-colors"
                  >
                    Clear all
                  </button>
                )}
              </div>
            </div>

            {/* All view — grouped by category */}
            {!activeCategory && !isSearching && Object.keys(groupedHeritage).length > 0 && (
              <Stagger className="space-y-8" staggerDelay={0.05}>
                {activeCategories.map((cat) => {
                  const items = groupedHeritage[cat.id];
                  const Icon = cat.icon;

                  return (
                    <StaggerItem key={cat.id}>
                      <div className="flex items-center gap-2 mb-4">
                        <Icon className="h-5 w-5 text-terracotta" />
                        <h2 className="font-display text-xl text-charcoal">{cat.label}</h2>
                        <Badge variant="outline" className="ml-1">
                          {items.length}
                        </Badge>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        {items.map((item) => {                           const ItemIcon = getCategoryIcon(item.category);
                          const heritageImage = getHeritageImage(item.name, item.category);
                          return (
                            <motion.div
                              key={item.id}
                              whileHover={{
                                y: -2,
                                boxShadow: "0 6px 20px rgba(139,69,19,0.08)",
                              }}
                              className="rounded-xl border border-border bg-card overflow-hidden group"
                            >
                              {/* Image header */}
                              <Link href={`/heritage/${item.slug || item.id}`} className="block cursor-pointer">
                                <div className="relative h-24 overflow-hidden">
                                  {heritageImage ? (
                                    <img
                                      src={heritageImage.src}
                                      alt={heritageImage.alt}
                                      className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                                      loading="lazy"
                                    />
                                  ) : (
                                    <div className="w-full h-full bg-gradient-to-br from-terracotta-mist to-parchment flex items-center justify-center">
                                      <ItemIcon className="h-8 w-8 text-terracotta/20" />
                                    </div>
                                  )}
                                  <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent" />
                                </div>
                              </Link>
                              <div className="p-4">
                                <div className="flex items-start gap-3">
                                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-terracotta/8 shrink-0">
                                    <ItemIcon className="h-4 w-4 text-terracotta" />
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <Link href={`/heritage/${item.slug || item.id}`} className="block">
                                      <div className="flex items-center gap-1">
                                        <h3 className="font-semibold text-charcoal font-display text-sm hover:text-terracotta transition-colors">
                                          {item.name}
                                        </h3>
                                        <FavoriteButton heritageId={item.id} isFavorited={isFavorited(item.id)} onToggle={toggleFavorite} />
                                      </div>
                                    </Link>
                                    <div className="flex flex-wrap items-center gap-1.5 mt-1">
                                      {item.location_id && (
                                        <div className="flex items-center gap-1">
                                          <MapPin className="h-3 w-3 text-terracotta" />
                                          <Link
                                            href={`/explore?focus=${item.location_id}`}
                                            className="text-xs text-muted hover:text-terracotta transition-colors"
                                          >
                                            {item.location?.state || "View location"}
                                          </Link>
                                        </div>
                                      )}
                                      {item.period && (
                                        <Badge variant="secondary" className="text-[9px] bg-heritage-gold/10 text-heritage-gold border-heritage-gold/20">
                                          <Clock className="h-2.5 w-2.5 mr-0.5" />
                                          {item.period.name}
                                        </Badge>
                                      )}
                                    </div>
                                    <p className="text-xs text-muted mt-1.5 line-clamp-2">
                                      {item.description}
                                    </p>
                                  </div>
                                </div>
                              </div>
                            </motion.div>
                          );
                        })}
                      </div>
                    </StaggerItem>
                  );
                })}
              </Stagger>
            )}

            {/* Category-filtered or search view */}
            {(activeCategory || isSearching) && (
              <Stagger className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {displayHeritage.map((item) => {
                  const ItemIcon = getCategoryIcon(item.category);
                  const heritageImage = getHeritageImage(item.name, item.category);
                  return (
                    <StaggerItem key={item.id}>
                      <motion.div
                        whileHover={{
                          y: -2,
                          boxShadow: "0 6px 20px rgba(139,69,19,0.08)",
                        }}
                        className="rounded-xl border border-border bg-card overflow-hidden group"
                      >
                        {/* Image header */}
                        <Link href={`/heritage/${item.slug || item.id}`} className="block cursor-pointer">
                          <div className="relative h-24 overflow-hidden">
                            {heritageImage ? (
                              <img
                                src={heritageImage.src}
                                alt={heritageImage.alt}
                                className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                                loading="lazy"
                              />
                            ) : (
                              <div className="w-full h-full bg-gradient-to-br from-terracotta-mist to-parchment flex items-center justify-center">
                                <ItemIcon className="h-8 w-8 text-terracotta/20" />
                              </div>
                            )}
                            <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent" />
                          </div>
                        </Link>
                        <div className="p-4">
                          <div className="flex items-start gap-3">
                            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-terracotta/8 shrink-0">
                              <ItemIcon className="h-4 w-4 text-terracotta" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <Link href={`/heritage/${item.slug || item.id}`} className="block">
                                <div className="flex items-center gap-1">
                                  <h3 className="font-semibold text-charcoal font-display text-sm hover:text-terracotta transition-colors">
                                    {item.name}
                                  </h3>                                   <FavoriteButton heritageId={item.id} isFavorited={isFavorited(item.id)} onToggle={toggleFavorite} />
                                </div>
                              </Link>
                              <div className="flex flex-wrap items-center gap-1.5 mt-1">
                                <Badge variant="outline" className="text-[10px] capitalize">
                                  {item.category}
                                </Badge>
                                {item.location?.state && (
                                  <span className="text-[10px] text-muted flex items-center gap-0.5">
                                    <MapPin className="h-2.5 w-2.5" />
                                    {item.location.state}
                                  </span>
                                )}
                                {item.period && (
                                  <Badge variant="secondary" className="text-[9px] bg-heritage-gold/10 text-heritage-gold border-heritage-gold/20">
                                    <Clock className="h-2.5 w-2.5 mr-0.5" />
                                    {item.period.name}
                                  </Badge>
                                )}
                              </div>
                              <p className="text-xs text-muted mt-1.5 line-clamp-2">
                                {item.description}
                              </p>
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    </StaggerItem>
                  );
                })}
              </Stagger>
            )}
          </div>
        )}
      </Container>
    </div>
  );
}

export default function HeritagePage() {
  return (
    <Suspense fallback={
      <div className="py-8 sm:py-12">
        <Container>
          <div className="text-center py-20">
            <div className="inline-flex h-6 w-6 border-2 border-terracotta border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-muted mt-3">Loading heritage...</p>
          </div>
        </Container>
      </div>
    }>
      <HeritageContent />
    </Suspense>
  );
}
