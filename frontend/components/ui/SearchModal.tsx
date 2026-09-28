"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/services/api";
import { INDIAN_STATES } from "@/constants/india";
import {
  Search,
  X,
  MapPin,
  Landmark,
  Globe,
  ArrowRight,
  Command,
  BookOpen,
} from "lucide-react";

/* ---- Types ---- */

interface SearchResult {
  id: string;
  name: string;
  category: string;
  description: string;
  location_id: string | null;
  period_id: string | null;
  source: "heritage" | "location";
}

interface SearchResponse {
  success: boolean;
  data: SearchResult[];
}

type ResultItem =
  | { type: "heritage"; id: string; name: string; subtitle: string; href: string }
  | { type: "state"; name: string; subtitle: string; href: string }
  | { type: "collection"; id: string; name: string; subtitle: string; href: string };

/* ---- Component ---- */

export function SearchModal() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ResultItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  /* ---- Keyboard shortcut ---- */
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  /* ---- Focus input on open ---- */
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
      setQuery("");
      setResults([]);
      setActiveIndex(0);
    }
  }, [open]);

  /* ---- Search logic ---- */
  const search = useCallback(async (q: string) => {
    const trimmed = q.trim();
    if (!trimmed) {
      setResults([]);
      return;
    }

    setLoading(true);
    const lower = trimmed.toLowerCase();

    try {
      // 1) Fetch heritage search results from API
      const apiResults: ResultItem[] = [];
      try {
        const res = await api.get<SearchResponse>(
          `/search?q=${encodeURIComponent(trimmed)}`
        );
        if (res.data && Array.isArray(res.data)) {
          res.data.forEach((item) => {
            const isLocation = item.source === "location";
            apiResults.push({
              type: isLocation ? "state" : "heritage",
              id: item.id,
              name: item.name,
              subtitle: `${item.category.charAt(0).toUpperCase() + item.category.slice(1)}`,
              href: isLocation ? `/explore?focus=${item.id}` : `/heritage/${item.id}`,
            });
          });
        }
      } catch {
        // API search unavailable — continue with state results
      }

      // 2) Filter states by name match
      const stateResults: ResultItem[] = INDIAN_STATES.filter(
        (s) =>
          s.name.toLowerCase().includes(lower) ||
          s.region.toLowerCase().includes(lower) ||
          s.highlights.some((h) => h.toLowerCase().includes(lower))
      ).map((s) => ({
        type: "state" as const,
        name: s.name,
        subtitle: `${s.region} · ${s.heritageCount} heritage sites`,
        href: `/explore?state=${encodeURIComponent(s.name)}`,
      }));

      // 3) Search collections
      const collectionResults: ResultItem[] = [];
      try {
        const colRes = await api.get<{ success: boolean; data: Array<{ id: string; name: string; slug: string; description: string; entity_count: number }> }>(
          "/collections"
        );
        if (colRes.data && Array.isArray(colRes.data)) {
          colRes.data.forEach((col) => {
            if (
              col.name.toLowerCase().includes(lower) ||
              col.description.toLowerCase().includes(lower)
            ) {
              collectionResults.push({
                type: "collection",
                id: col.id,
                name: col.name,
                subtitle: `${col.entity_count} entities · Collection`,
                href: `/collections/${col.slug}`,
              });
            }
          });
        }
      } catch {
        // Collections API unavailable
      }

      // 4) Merge: heritage + collections + states
      setResults([...apiResults, ...collectionResults, ...stateResults]);
      setActiveIndex(0);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  /* ---- Debounced search ---- */
  useEffect(() => {
    const timeout = setTimeout(() => search(query), 250);
    return () => clearTimeout(timeout);
  }, [query, search]);

  /* ---- Keyboard navigation ---- */
  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && results[activeIndex]) {
      e.preventDefault();
      router.push(results[activeIndex].href);
      setOpen(false);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  /* ---- Render ---- */
  return (
    <>
      {/* Trigger — rendered by Navbar via renderProp or exposed via ref. 
          For simplicity we render the trigger inline in the Navbar and 
          this component exposes a static openSearch method below. */}
      <AnimatePresence>
        {open && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm"
              onClick={() => setOpen(false)}
            />

            {/* Modal */}
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: -10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: -10 }}
              transition={{ duration: 0.18, ease: [0.25, 0.1, 0.25, 1] }}
              className="fixed inset-x-4 top-[12vh] sm:inset-x-auto sm:left-1/2 sm:-translate-x-1/2 sm:w-full sm:max-w-lg z-50"
            >
              <div className="rounded-2xl border border-cream bg-white shadow-2xl shadow-black/10 overflow-hidden">
                {/* Search input */}
                <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
                  <Search className="h-4 w-4 text-muted shrink-0" />
                  <input
                    ref={inputRef}
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Search heritage, states, categories..."
                    className="flex-1 bg-transparent text-sm text-charcoal placeholder:text-warm-gray outline-none"
                    aria-label="Search"
                  />
                  <kbd className="hidden sm:inline-flex h-5 items-center rounded border border-cream bg-parchment/60 px-1.5 text-[10px] font-mono text-stone">
                    ESC
                  </kbd>
                  <button
                    onClick={() => setOpen(false)}
                    className="p-1 rounded hover:bg-parchment transition-colors"
                    aria-label="Close search"
                  >
                    <X className="h-4 w-4 text-muted" />
                  </button>
                </div>

                {/* Results */}
                <div className="max-h-[350px] overflow-y-auto">
                  {loading && (
                    <div className="px-4 py-6 text-center">
                      <div className="inline-flex h-5 w-5 border-2 border-terracotta border-t-transparent rounded-full animate-spin" />
                      <p className="text-xs text-muted mt-2">Searching...</p>
                    </div>
                  )}

                  {!loading && query.trim() && results.length === 0 && (
                    <div className="px-4 py-8 text-center">
                      <Search className="h-8 w-8 text-warm-gray mx-auto mb-2 opacity-40" />
                      <p className="text-sm text-muted">
                        No results for &ldquo;{query}&rdquo;
                      </p>
                      <p className="text-xs text-warm-gray mt-1">
                        Try searching for a heritage site, state, or category
                      </p>
                    </div>
                  )}

                  {!loading && results.length > 0 && (
                    <ul className="py-2" role="listbox">
                      {results.map((item, index) => {
                        const isActive = index === activeIndex;
                        const icon =
                          item.type === "state" ? (
                            <MapPin className="h-4 w-4 text-terracotta" />
                          ) : item.type === "collection" ? (
                            <BookOpen className="h-4 w-4 text-terracotta" />
                          ) : (
                            <Landmark className="h-4 w-4 text-heritage-gold" />
                          );

                        return (
                          <li key={`${item.type}-${item.name}-${item.href}`}>
                            <Link
                              href={item.href}
                              onClick={() => setOpen(false)}
                              className={`flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${
                                isActive
                                  ? "bg-terracotta/5 text-charcoal"
                                  : "text-charcoal hover:bg-parchment"
                              }`}
                              role="option"
                              aria-selected={isActive}
                            >
                              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-parchment shrink-0">
                                {icon}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="font-medium truncate">
                                  {item.name}
                                </p>
                                <p className="text-xs text-muted truncate">
                                  {item.subtitle}
                                </p>
                              </div>
                              <ArrowRight className="h-3.5 w-3.5 text-muted shrink-0 opacity-0 group-hover:opacity-100" />
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  )}

                  {!loading && !query.trim() && (
                    <div className="px-4 py-6">
                      <p className="text-xs text-muted mb-3 font-medium">
                        Quick links
                      </p>
                      <div className="space-y-1">
                        <Link
                          href="/explore"
                          onClick={() => setOpen(false)}
                          className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-charcoal hover:bg-parchment transition-colors"
                        >
                          <Globe className="h-4 w-4 text-terracotta" />
                          Explore India
                        </Link>
                        <Link
                          href="/heritage"
                          onClick={() => setOpen(false)}
                          className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-charcoal hover:bg-parchment transition-colors"
                        >
                          <Landmark className="h-4 w-4 text-heritage-gold" />
                          Heritage Directory
                        </Link>
                        <Link
                          href="/ai"
                          onClick={() => setOpen(false)}
                          className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-red-600 hover:bg-red-50 transition-colors"
                        >
                          <Search className="h-4 w-4 text-red-500" />
                          Ask Astrova
                        </Link>
                      </div>
                    </div>
                  )}
                </div>

                {/* Footer */}
                <div className="px-4 py-2 border-t border-border bg-ivory/50 flex items-center gap-4 text-[10px] text-warm-gray">
                  <span className="flex items-center gap-1">
                    <kbd className="inline-flex h-4 items-center rounded border border-cream bg-white px-1 font-mono">
                      ↑↓
                    </kbd>
                    Navigate
                  </span>
                  <span className="flex items-center gap-1">
                    <kbd className="inline-flex h-4 items-center rounded border border-cream bg-white px-1 font-mono">
                      ↵
                    </kbd>
                    Open
                  </span>
                  <span className="flex items-center gap-1">
                    <kbd className="inline-flex h-4 items-center rounded border border-cream bg-white px-1 font-mono">
                      esc
                    </kbd>
                    Close
                  </span>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}

/* ---- Global open trigger ---- */
// A simple module-level event system so Navbar can open the modal
let _openSearch: (() => void) | null = null;

export function registerSearchOpener(fn: () => void) {
  _openSearch = fn;
}

export function openSearchModal() {
  _openSearch?.();
}

/* ---- Wrapper that provides the trigger ---- */
export function SearchModalProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ResultItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  // Register the opener
  useEffect(() => {
    registerSearchOpener(() => setOpen(true));
    return () => registerSearchOpener(() => {});
  }, []);

  /* Keyboard shortcut */
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  /* Focus input on open */
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
      setQuery("");
      setResults([]);
      setActiveIndex(0);
    }
  }, [open]);

  /* Search */
  const search = useCallback(async (q: string) => {
    const trimmed = q.trim();
    if (!trimmed) {
      setResults([]);
      return;
    }
    setLoading(true);
    const lower = trimmed.toLowerCase();
    try {
      const apiResults: ResultItem[] = [];
      try {
        const res = await api.get<SearchResponse>(
          `/search?q=${encodeURIComponent(trimmed)}`
        );
        if (res.data && Array.isArray(res.data)) {
          res.data.forEach((item) => {
            const isLocation = item.source === "location";
            apiResults.push({
              type: isLocation ? "state" : "heritage",
              id: item.id,
              name: item.name,
              subtitle: item.category.charAt(0).toUpperCase() + item.category.slice(1),
              href: isLocation ? `/explore?focus=${item.id}` : `/heritage/${item.id}`,
            });
          });
        }
      } catch {
        // API unavailable
      }

      const stateResults: ResultItem[] = INDIAN_STATES.filter(
        (s) =>
          s.name.toLowerCase().includes(lower) ||
          s.region.toLowerCase().includes(lower) ||
          s.highlights.some((h) => h.toLowerCase().includes(lower))
      ).map((s) => ({
        type: "state" as const,
        name: s.name,
        subtitle: `${s.region} · ${s.heritageCount} heritage sites`,
        href: `/explore?state=${encodeURIComponent(s.name)}`,
      }));

      // Search collections
      const collectionResults: ResultItem[] = [];
      try {
        const colRes = await api.get<{ success: boolean; data: Array<{ id: string; name: string; slug: string; description: string; entity_count: number }> }>(
          "/collections"
        );
        if (colRes.data && Array.isArray(colRes.data)) {
          colRes.data.forEach((col) => {
            if (
              col.name.toLowerCase().includes(lower) ||
              col.description.toLowerCase().includes(lower)
            ) {
              collectionResults.push({
                type: "collection",
                id: col.id,
                name: col.name,
                subtitle: `${col.entity_count} entities · Collection`,
                href: `/collections/${col.slug}`,
              });
            }
          });
        }
      } catch {
        // Collections API unavailable
      }

      setResults([...apiResults, ...collectionResults, ...stateResults]);
      setActiveIndex(0);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  /* Debounced search */
  useEffect(() => {
    const timeout = setTimeout(() => search(query), 250);
    return () => clearTimeout(timeout);
  }, [query, search]);

  /* Keyboard nav */
  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && results[activeIndex]) {
      e.preventDefault();
      router.push(results[activeIndex].href);
      setOpen(false);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <>
      {children}
      <AnimatePresence>
        {open && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm"
              onClick={() => setOpen(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: -10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: -10 }}
              transition={{ duration: 0.18, ease: [0.25, 0.1, 0.25, 1] }}
              className="fixed inset-x-4 top-[12vh] sm:inset-x-auto sm:left-1/2 sm:-translate-x-1/2 sm:w-full sm:max-w-lg z-50"
            >
              <div className="rounded-2xl border border-cream bg-white shadow-2xl shadow-black/10 overflow-hidden">
                <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
                  <Search className="h-4 w-4 text-muted shrink-0" />
                  <input
                    ref={inputRef}
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Search heritage, states, categories..."
                    className="flex-1 bg-transparent text-sm text-charcoal placeholder:text-warm-gray outline-none"
                    aria-label="Search heritage, states, and categories"
                  />
                  <kbd className="hidden sm:inline-flex h-5 items-center rounded border border-cream bg-parchment/60 px-1.5 text-[10px] font-mono text-stone">
                    ESC
                  </kbd>
                  <button
                    onClick={() => setOpen(false)}
                    className="p-1 rounded hover:bg-parchment transition-colors"
                    aria-label="Close search"
                  >
                    <X className="h-4 w-4 text-muted" />
                  </button>
                </div>

                <div className="max-h-[350px] overflow-y-auto">
                  {loading && (
                    <div className="px-4 py-6 text-center">
                      <div className="inline-flex h-5 w-5 border-2 border-terracotta border-t-transparent rounded-full animate-spin" />
                      <p className="text-xs text-muted mt-2">Searching...</p>
                    </div>
                  )}

                  {!loading && query.trim() && results.length === 0 && (
                    <div className="px-4 py-8 text-center">
                      <Search className="h-8 w-8 text-warm-gray mx-auto mb-2 opacity-40" />
                      <p className="text-sm text-muted">
                        No results for &ldquo;{query}&rdquo;
                      </p>
                      <p className="text-xs text-warm-gray mt-1">
                        Try a heritage site, state, or category
                      </p>
                    </div>
                  )}

                  {!loading && results.length > 0 && (
                    <ul className="py-2" role="listbox">
                      {results.map((item, index) => {
                        const isActive = index === activeIndex;
                        return (
                          <li key={`${item.type}-${item.name}-${item.href}`}>
                            <Link
                              href={item.href}
                              onClick={() => setOpen(false)}
                              className={`flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${
                                isActive
                                  ? "bg-terracotta/5 text-charcoal"
                                  : "text-charcoal hover:bg-parchment"
                              }`}
                              role="option"
                              aria-selected={isActive}
                            >
                              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-parchment shrink-0">
                                {item.type === "state" ? (
                                  <MapPin className="h-4 w-4 text-terracotta" />
                                ) : item.type === "collection" ? (
                                  <BookOpen className="h-4 w-4 text-terracotta" />
                                ) : (
                                  <Landmark className="h-4 w-4 text-heritage-gold" />
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="font-medium truncate">{item.name}</p>
                                <p className="text-xs text-muted truncate">{item.subtitle}</p>
                              </div>
                              <ArrowRight className="h-3.5 w-3.5 text-muted shrink-0" />
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  )}

                  {!loading && !query.trim() && (
                    <div className="px-4 py-6">
                      <p className="text-xs text-muted mb-3 font-medium">Quick links</p>
                      <div className="space-y-1">
                        <Link href="/explore" onClick={() => setOpen(false)} className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-charcoal hover:bg-parchment transition-colors">
                          <Globe className="h-4 w-4 text-terracotta" />
                          Explore India
                        </Link>
                        <Link href="/heritage" onClick={() => setOpen(false)} className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-charcoal hover:bg-parchment transition-colors">
                          <Landmark className="h-4 w-4 text-heritage-gold" />
                          Heritage Directory
                        </Link>
                        <Link href="/ai" onClick={() => setOpen(false)} className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-red-600 hover:bg-red-50 transition-colors">
                          <Search className="h-4 w-4 text-red-500" />
                          Ask Astrova
                        </Link>
                      </div>
                    </div>
                  )}
                </div>

                <div className="px-4 py-2 border-t border-border bg-ivory/50 flex items-center gap-4 text-[10px] text-warm-gray">
                  <span className="flex items-center gap-1">
                    <kbd className="inline-flex h-4 items-center rounded border border-cream bg-white px-1 font-mono">↑↓</kbd> Navigate
                  </span>
                  <span className="flex items-center gap-1">
                    <kbd className="inline-flex h-4 items-center rounded border border-cream bg-white px-1 font-mono">↵</kbd> Open
                  </span>
                  <span className="flex items-center gap-1">
                    <kbd className="inline-flex h-4 items-center rounded border border-cream bg-white px-1 font-mono">esc</kbd> Close
                  </span>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
