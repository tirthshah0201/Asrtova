"use client";

import { createElement, use, useState } from "react";
import Link from "next/link";
import { Container } from "@/components/ui/Container";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";
import { useApi } from "@/hooks/useApi";
import {
  Landmark,
  ArrowLeft,
  MapPin,
  Clock,
  Users,
  Palette,
  Calendar,
  UtensilsCrossed,
  BookOpen,
  ExternalLink,
  Sparkles,
  Shield,
  CheckCircle,
} from "lucide-react";
import { getHeritageImage } from "@/constants/images";
import { GalleryLightbox } from "@/components/ui/GalleryLightbox";
import { FavoriteButton } from "@/components/ui/FavoriteButton";
import { useFavorites } from "@/hooks/useFavorites";
import { useAuth } from "@/hooks/useAuth";
import { getCategoryIcon, getCategoryColor } from "@/constants/categories";
import { LiveVisitorIntelligence } from "@/components/heritage/LiveVisitorIntelligence";
import { ExternalReferences } from "@/components/heritage/ExternalReferences";

/* ========================================
   Types
   ======================================== */

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
  source: {
    id: string;
    title: string | null;
    publisher: string | null;
    author: string | null;
    url: string | null;
    source_type: string;
    verification_status: string;
    publication_date: string | null;
    retrieved_date: string | null;
    authority_tier: number | null;
    tier_label: string;
    license: string | null;
    verified_date: string | null;
  } | null;
  period?: {
    id: string;
    name: string;
    start_year: number | null;
    end_year: number | null;
    description: string | null;
  } | null;
  media?: Array<{
    id: string;
    entity_id: string;
    type: string;
    url: string;
    caption: string | null;
    alt_text: string | null;
    credit: string | null;
    display_order: number | null;
    is_primary: boolean;
    verification_status: string | null;
  }>;
  related?: Array<{
    id: string;
    name: string;
    slug: string;
    category: string;
    relationship_type: string;
    relationship_description: string | null;
  }>;
}

interface Location {
  id: string;
  name: string;
  slug: string;
  type: string;
  state: string;
  latitude: number | null;
  longitude: number | null;
}

/* ========================================
   Helpers
   ======================================== */



/* ========================================
   Page Component
   ======================================== */

export default function HeritageDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);

  const { user } = useAuth();
  const { favorites, isFavorited, toggleFavorite, loaded: favLoaded } = useFavorites(!!user, false);

  const { data: heritage, loading, error, refetch } = useApi<HeritageEntity>(`/heritage/${id}`);
  const { data: location, loading: locationLoading } = useApi<Location>(
    heritage?.location_id ? `/locations/${heritage.location_id}` : "",
    { immediate: !!heritage?.location_id }
  );

  const [galleryOpen, setGalleryOpen] = useState(false);
  const [galleryIndex, setGalleryIndex] = useState(0);

  // Lowercase + createElement: getCategoryIcon returns a module-level icon
  // component; avoids react-hooks/static-components false positive.
  const categoryIcon = getCategoryIcon(heritage?.category || "monument");
  const colorClass = getCategoryColor(heritage?.category || "monument");

  return (
    <div className="min-h-screen">
      <Container>
        {/* Breadcrumb */}
        <div className="pt-6 pb-4">
          <Breadcrumb
            items={[
              { label: "Home", href: "/" },
              { label: "Heritage", href: "/heritage" },
              { label: loading ? "Loading..." : heritage?.name ?? "Not Found" },
            ]}
          />
        </div>

        {/* Loading */}
        {loading && <LoadingState message="Loading heritage entity..." />}

        {/* Error */}
        {error && (
          <ErrorState
            title="Unable to load heritage entity"
            message={error}
            onRetry={refetch}
          />
        )}

        {/* Heritage Detail */}
        {!loading && !error && heritage && (
          <>
            {/* Hero Section */}
            {(() => {
              // Priority: 1) database primary media, 2) database image_url, 3) frontend fallback
              const primaryMedia = heritage.media?.find(m => m.is_primary) || heritage.media?.[0];
              const heroSrc = primaryMedia?.url || heritage.image_url || null;
              const heroAlt = primaryMedia?.alt_text || `${heritage.name} - ${heritage.category}`;
              const heroImage = heroSrc ? { src: heroSrc, alt: heroAlt } : getHeritageImage(heritage.name, heritage.category);
              const isVideo = primaryMedia?.type === 'video' || heroSrc?.match(/\.mp4|\.webm|\.ogg|video/i);
              return heroImage ? (
                <div className="relative rounded-2xl overflow-hidden mb-10 h-72 sm:h-96 lg:h-[28rem]">
                  {isVideo ? (
                    <video
                      src={heroImage.src}
                      className="w-full h-full object-cover"
                      muted
                      playsInline
                      loop
                      controls={false}
                    />
                  ) : (
                    <img
                      src={heroImage.src}
                      alt={heroImage.alt}
                      className="w-full h-full object-cover"
                      loading="eager"
                    />
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent" />
                  <div className="absolute bottom-0 left-0 right-0 p-6 sm:p-10">
                    <div className="max-w-3xl">
                      <div className="flex flex-wrap items-center gap-3 mb-3">
                        <Badge variant="secondary" className="bg-white/90 text-charcoal backdrop-blur-sm">
                          {heritage.category}
                        </Badge>
                        {location && (
                          <span className="text-white/80 text-sm">
                            {location.name}, {location.state}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3">
                        <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl text-white drop-shadow-lg mb-3">
                          {heritage.name}
                        </h1>
                        <FavoriteButton
                          heritageId={heritage.id}
                          isFavorited={isFavorited(heritage.id)}
                          onToggle={toggleFavorite}
                          size="md"
                          className="!text-white/80 hover:!text-white"
                        />
                      </div>
                      {heritage.period && (
                        <p className="text-sm text-white/70 mt-1">
                          {heritage.period.name}
                          {heritage.period.start_year != null && (
                            <span className="ml-1">
                              · {heritage.period.start_year < 0 ? `${Math.abs(heritage.period.start_year)} BCE` : `${heritage.period.start_year} CE`}
                            </span>
                          )}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="mb-10 pt-4">
                  <div className="max-w-3xl">
                    <div className="flex flex-wrap items-center gap-3 mb-3">
                      <Badge variant="secondary" className={colorClass}>
                        {heritage.category}
                      </Badge>
                      {location && (
                        <span className="text-muted text-sm">
                          {location.name}, {location.state}
                        </span>
                      )}
                    </div>
                    <h1 className="font-display text-4xl sm:text-5xl text-charcoal mb-3">
                      {heritage.name}
                    </h1>
                    {heritage.period && (
                      <p className="text-sm text-muted mt-1">
                        {heritage.period.name}
                        {heritage.period.start_year != null && (
                          <span className="ml-1">
                            · {heritage.period.start_year < 0 ? `${Math.abs(heritage.period.start_year)} BCE` : `${heritage.period.start_year} CE`}
                          </span>
                        )}
                      </p>
                    )}
                  </div>
                </div>
              );
            })()}

            {/* Editorial Content Section */}
            <div className="mb-16">
              <div className="max-w-3xl mx-auto">
                <div className="border-l-4 border-terracotta pl-6 mb-8">
                  <h2 className="font-display text-3xl sm:text-4xl text-charcoal">Discover the Story</h2>
                </div>
                <div className="prose prose-lg max-w-none text-charcoal/85 leading-relaxed">
                  {heritage.description.split('\n\n').map((paragraph, idx) => (
                    <p key={idx} className="mb-6 text-lg">
                      {paragraph}
                    </p>
                  ))}
                </div>
              </div>
            </div>

            {/* At a Glance */}
            <div className="mb-16">
              <div className="max-w-3xl mx-auto">
                <h2 className="font-display text-2xl sm:text-3xl text-charcoal mb-6">At a Glance</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {/* Category */}
                  <div className="flex items-center gap-3 p-4 bg-cream/50 rounded-xl">
                    <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${colorClass}`}>
                      {createElement(categoryIcon, { className: "h-5 w-5" })}
                    </div>
                    <div>
                      <p className="text-xs text-muted uppercase tracking-wider">Category</p>
                      <p className="text-sm font-semibold text-charcoal capitalize">{heritage.category}</p>
                    </div>
                  </div>

                  {/* Location */}
                  {location && (
                    <Link href={`/explore?focus=${location.id}`} className="block">
                      <div className="flex items-center gap-3 p-4 bg-cream/50 rounded-xl hover:bg-cream transition-colors">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-terracotta/10">
                          <MapPin className="h-5 w-5 text-terracotta" />
                        </div>
                        <div>
                          <p className="text-xs text-muted uppercase tracking-wider">Location</p>
                          <p className="text-sm font-semibold text-terracotta">{location.name}</p>
                          <p className="text-xs text-muted">{location.state}</p>
                        </div>
                      </div>
                    </Link>
                  )}

                  {/* Period */}
                  {heritage.period && (
                    <Link href={`/heritage?period=${heritage.period.id}`} className="block">
                      <div className="flex items-center gap-3 p-4 bg-cream/50 rounded-xl hover:bg-cream transition-colors">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-heritage-gold/10">
                          <Clock className="h-5 w-5 text-heritage-gold" />
                        </div>
                        <div>
                          <p className="text-xs text-muted uppercase tracking-wider">Historical Period</p>
                          <p className="text-sm font-semibold text-heritage-gold">{heritage.period.name}</p>
                          {heritage.period.start_year != null && (
                            <p className="text-xs text-muted">
                              {heritage.period.start_year < 0
                                ? `${Math.abs(heritage.period.start_year)} BCE`
                                : `${heritage.period.start_year} CE`}
                              {heritage.period.end_year != null && (
                                <>
                                  {' — '}
                                  {heritage.period.end_year < 0
                                    ? `${Math.abs(heritage.period.end_year)} BCE`
                                    : heritage.period.end_year > 2000
                                      ? 'Present'
                                      : `${heritage.period.end_year} CE`}
                                </>
                              )}
                            </p>
                          )}
                          {heritage.period.description && (
                            <p className="text-xs text-muted mt-1 line-clamp-2">{heritage.period.description}</p>
                          )}
                        </div>
                      </div>
                    </Link>
                  )}
                </div>
              </div>
            </div>

            {/* Explore the Place */}
            {location && (
              <div className="mb-16">
                <div className="max-w-3xl mx-auto">
                  <h2 className="font-display text-2xl sm:text-3xl text-charcoal mb-6">Explore the Place</h2>
                  <Link href={`/explore?focus=${location.id}`} className="block">
                    <div className="p-6 bg-gradient-to-br from-terracotta/5 to-heritage-gold/5 rounded-2xl border border-terracotta/10 hover:border-terracotta/20 transition-all">
                      <div className="flex items-start gap-4">
                        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-terracotta/10 shrink-0">
                          <MapPin className="h-6 w-6 text-terracotta" />
                        </div>
                        <div className="flex-1">
                          <h3 className="font-display text-xl text-charcoal mb-1">{location.name}</h3>
                          <p className="text-sm text-muted mb-2">{location.state} · {location.type}</p>
                          {location.latitude && location.longitude && (
                            <p className="text-sm text-muted">
                              {Number(location.latitude).toFixed(4)}°N, {Number(location.longitude).toFixed(4)}°E
                            </p>
                          )}
                        </div>
                        <span className="text-terracotta font-medium text-sm">View on Map →</span>
                      </div>
                    </div>
                  </Link>
                </div>
              </div>
            )}

            {/* Heritage Gallery */}
            {heritage.media && heritage.media.length > 0 && (
              <div className="mb-16">
                <div className="max-w-3xl mx-auto">
                  <div className="flex items-center justify-between mb-6">
                    <h2 className="font-display text-2xl sm:text-3xl text-charcoal">Gallery</h2>
                    <span className="text-sm text-muted">
                      {heritage.media.length} image{heritage.media.length !== 1 ? 's' : ''}
                    </span>
                  </div>
                  {heritage.media.length === 1 ? (
                    <button
                      onClick={() => setGalleryOpen(true)}
                      className="rounded-2xl overflow-hidden w-full text-left group"
                      aria-label={`Open gallery for ${heritage.name}`}
                    >
                      <img
                        src={heritage.media[0].url}
                        alt={heritage.media[0].alt_text || `${heritage.name} - ${heritage.category}`}
                        className="w-full h-auto object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                        loading="eager"
                        onError={(e) => {
                          const img = e.currentTarget;
                          const heroFallback = getHeritageImage(heritage.name, heritage.category);
                          if (heroFallback && img.src !== heroFallback.src) {
                            img.src = heroFallback.src;
                          }
                        }}
                      />
                      {(heritage.media[0].caption || heritage.media[0].credit) && (
                        <div className="mt-3 flex items-center justify-between text-xs text-muted">
                          {heritage.media[0].caption && <span>{heritage.media[0].caption}</span>}
                          {heritage.media[0].credit && <span className="italic">Credit: {heritage.media[0].credit}</span>}
                        </div>
                      )}
                    </button>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-3">
                      {heritage.media.map((m, idx) => (
                        <button
                          key={m.id}
                          onClick={() => { setGalleryIndex(idx); setGalleryOpen(true); }}
                          className={`rounded-xl overflow-hidden text-left group ${idx === 0 ? 'col-span-2 sm:col-span-2' : ''}`}
                          aria-label={`Open image ${idx + 1}: ${m.alt_text || m.caption || heritage.name}`}
                        >
                          <div className={`relative overflow-hidden ${idx === 0 ? 'h-48 sm:h-72' : 'h-32 sm:h-40'}`}>
                            {m.type === 'video' ? (
                              <video
                                src={m.url}
                                className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                                muted
                                onError={() => {}}
                              />
                            ) : (
                              <img
                                src={m.url}
                                alt={m.alt_text || `${heritage.name} - image ${idx + 1}`}
                                className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                                loading="lazy"
                                onError={(e) => {
                                  const img = e.currentTarget;
                                  const fallback = getHeritageImage(heritage.name, heritage.category);
                                  if (fallback && img.src !== fallback.src) {
                                    img.src = fallback.src;
                                  }
                                }}
                              />
                            )}
                            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors" />
                          </div>
                          {(m.caption || m.credit) && (
                            <div className="mt-2 flex items-center justify-between text-xs text-muted px-0.5">
                              {m.caption && <span className="truncate mr-2">{m.caption}</span>}
                              {m.credit && <span className="italic shrink-0">Credit: {m.credit}</span>}
                            </div>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Sources & References */}
            {heritage.source && heritage.source.id && (
              <div className="mb-16">
                <div className="max-w-3xl mx-auto">
                  <div className="flex items-center gap-2 mb-6">
                    <Shield className="h-5 w-5 text-heritage-gold" />
                    <h2 className="font-display text-2xl sm:text-3xl text-charcoal">Sources & References</h2>
                  </div>
                  <div className="p-6 bg-cream/30 rounded-2xl border border-cream">
                    <div className="flex items-start gap-4">
                      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-heritage-gold/10 shrink-0">
                        <BookOpen className="h-6 w-6 text-heritage-gold" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-charcoal text-lg mb-1">{heritage.source.title || "Unknown Source"}</h3>
                        <div className="flex flex-wrap items-center gap-2 mb-3">
                          <Badge variant="secondary" className="text-xs">
                            {heritage.source.source_type}
                          </Badge>
                          {heritage.source.tier_label && (
                            <Badge
                              variant="secondary"
                              className={`text-xs ${
                                heritage.source.authority_tier === 1
                                  ? "bg-green-100 text-green-700"
                                  : heritage.source.authority_tier === 5
                                  ? "bg-stone-100 text-stone-600"
                                  : "bg-blue-50 text-blue-700"
                              }`}
                            >
                              {heritage.source.tier_label === "OFFICIAL"
                                ? "Official source"
                                : heritage.source.tier_label}
                            </Badge>
                          )}
                          {heritage.source.verification_status ? (
                            <Badge
                              variant="secondary"
                              className={`text-xs flex items-center gap-1 ${
                                heritage.source.verification_status === "VERIFIED"
                                  ? "bg-green-100 text-green-700"
                                  : heritage.source.verification_status === "REVIEWED"
                                  ? "bg-amber-100 text-amber-700"
                                  : "bg-gray-100 text-gray-600"
                              }`}
                            >
                              {heritage.source.verification_status === "VERIFIED" && <CheckCircle className="h-3 w-3" />}
                              {heritage.source.verification_status.toLowerCase()}
                            </Badge>
                          ) : null}
                        </div>
                        <div className="space-y-1 text-sm text-muted">
                          {heritage.source.author && (
                            <p>Author: <span className="text-charcoal font-medium">{heritage.source.author}</span></p>
                          )}
                          {heritage.source.publisher && (
                            <p>Publisher: <span className="text-charcoal">{heritage.source.publisher}</span></p>
                          )}
                          {heritage.source.publication_date && (
                            <p>Published: {heritage.source.publication_date}</p>
                          )}
                          {heritage.source.retrieved_date && (
                            <p>Retrieved: {heritage.source.retrieved_date}</p>
                          )}
                          {heritage.source.verified_date && (
                            <p>Verified: {heritage.source.verified_date}</p>
                          )}
                          {heritage.source.license && (
                            <p>Terms: {heritage.source.license}</p>
                          )}
                        </div>
                        {heritage.source.url && (
                          <a
                            href={heritage.source.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 mt-4 px-4 py-2 rounded-lg bg-terracotta/5 border border-terracotta/15 text-sm text-terracotta hover:bg-terracotta/10 hover:border-terracotta/25 font-medium transition-colors"
                          >
                            View Reference <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* External open-data references (Feature H, PARTIAL — proposals only) */}
                  <ExternalReferences heritageId={heritage.id} />
                </div>
              </div>
            )}

            {/* Related Heritage */}
            {heritage.related && heritage.related.length > 0 && (
              <div className="mb-16">
                <div className="max-w-3xl mx-auto">
                  <h2 className="font-display text-2xl sm:text-3xl text-charcoal mb-2">You May Also Explore</h2>
                  <p className="text-sm text-muted mb-6">Discover connections across India&apos;s heritage traditions</p>
                  {(() => {
                    // Group by relationship type
                    const grouped = heritage.related.reduce((acc, rel) => {
                      const key = rel.relationship_type;
                      if (!acc[key]) acc[key] = [];
                      acc[key].push(rel);
                      return acc;
                    }, {} as Record<string, typeof heritage.related>);
                    const typeLabels: Record<string, string> = {
                      ASSOCIATED_WITH: 'Cultural Connections',
                      PRACTICED_BY: 'Practiced By',
                      PART_OF: 'Part Of',
                      INFLUENCED_BY: 'Influenced By',
                      RELATED_TO: 'Related Heritage',
                    };
                    return (
                      <div className="space-y-6">
                        {Object.entries(grouped).map(([type, rels]) => (
                          <div key={type}>
                            <h3 className="text-sm font-semibold text-muted uppercase tracking-wider mb-3">
                              {typeLabels[type] || type.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, l => l.toUpperCase())}
                            </h3>
                            <div className="space-y-3">
                              {rels.map((rel) => {
                                const RelIcon = getCategoryIcon(rel.category);
                                const relColor = getCategoryColor(rel.category);
                                const relTypeLabel = rel.relationship_type
                                  .replace(/_/g, ' ')
                                  .toLowerCase()
                                  .replace(/\b\w/g, l => l.toUpperCase());
                                return (
                                  <Link key={rel.id} href={`/heritage/${rel.slug || rel.id}`}>
                                    <div className="group bg-cream/30 rounded-xl overflow-hidden hover:bg-cream/60 transition-all border border-transparent hover:border-terracotta/15 hover:shadow-sm">
                                      {/* Image */}
                                      {(() => {
                                        const relImage = getHeritageImage(rel.name, rel.category);
                                        return relImage ? (
                                          <div className="relative h-24 overflow-hidden">
                                            <img
                                              src={relImage.src}
                                              alt={relImage.alt}
                                              className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                                              loading="lazy"
                                            />
                                            <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent" />
                                          </div>
                                        ) : null;
                                      })()}
                                      <div className="p-4">
                                        <div className="flex items-start gap-3">
                                          <div className={`flex h-9 w-9 items-center justify-center rounded-lg shrink-0 ${relColor} group-hover:scale-105 transition-transform`}>
                                            <RelIcon className="h-4 w-4" />
                                          </div>
                                          <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 mb-1">
                                              <h3 className="font-semibold text-charcoal text-sm truncate group-hover:text-terracotta transition-colors">{rel.name}</h3>
                                            </div>
                                            <div className="flex flex-wrap items-center gap-1.5">
                                              <Badge variant="outline" className="text-[9px] capitalize">
                                                {rel.category}
                                              </Badge>
                                              <Badge variant="secondary" className="text-[9px] bg-heritage-gold/10 text-heritage-gold">
                                                {relTypeLabel}
                                              </Badge>
                                            </div>
                                            {rel.relationship_description && (
                                              <p className="text-xs text-charcoal/60 mt-1.5 line-clamp-2 leading-relaxed">{rel.relationship_description}</p>
                                            )}
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                  </Link>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                </div>
              </div>
            )}

            {/* Visitor Intelligence — Live conditions, situation, best time,
                cost estimator, nearby heritage/places/stays */}
            {!locationLoading && heritage && (
              <LiveVisitorIntelligence
                heritageId={heritage.id}
                hasCoordinates={Boolean(
                  location &&
                    location.latitude != null &&
                    location.longitude != null &&
                    Number.isFinite(Number(location.latitude)) &&
                    Number.isFinite(Number(location.longitude))
                )}
              />
            )}

            {/* Ask Astrova — live RAG chat */}
            <div className="mb-16">
              <div className="max-w-3xl mx-auto">
                <div className="p-8 rounded-2xl border" style={{ background: 'linear-gradient(135deg, #fef2f2, #fee2e2)', borderColor: '#fecaca' }}>
                  <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6">
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl shrink-0" style={{ backgroundColor: '#fee2e2' }}>
                      <Sparkles className="h-7 w-7" style={{ color: '#ef4444' }} />
                    </div>
                    <div className="flex-1">
                      <h3 className="font-display text-xl text-charcoal mb-2">Want to explore this heritage further?
                        <span className="ml-2 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold align-middle" style={{ backgroundColor: '#dcfce7', color: '#15803d' }}>Live</span>
                      </h3>
                      <p className="text-muted">Ask Astrova for AI-powered insights about {heritage.name}.</p>
                    </div>
                    <Link href={`/ai?question=Tell me about ${encodeURIComponent(heritage.name)}${location ? ` in ${encodeURIComponent(location.state)}` : ""}`}>
                      <Button size="lg" variant="ghost" style={{ backgroundColor: '#dc2626', color: '#ffffff' }} className="font-semibold">
                        <Sparkles className="h-4 w-4 mr-2" />
                        Ask Astrova
                      </Button>
                    </Link>
                  </div>
                </div>
              </div>
            </div>

            {/* Continue Exploring */}
            <div className="text-center pb-12 flex flex-wrap items-center justify-center gap-3">
              <Link href="/heritage">
                <Button variant="outline" size="lg">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Browse All Heritage
                </Button>
              </Link>
              {heritage.period && (
                <Link href={`/heritage?period=${heritage.period.id}`}>
                  <Button variant="outline" size="lg">
                    <Clock className="h-4 w-4 mr-2" />
                    Explore {heritage.period.name}
                  </Button>
                </Link>
              )}
              <Link href="/timeline">
                <Button variant="outline" size="lg">
                  <Calendar className="h-4 w-4 mr-2" />
                  View Timeline
                </Button>
              </Link>
            </div>
          </>
        )}

        {/* Not found */}
        {!loading && !error && !heritage && (
          <ErrorState
            title="Heritage entity not found"
            message="The heritage entity you're looking for doesn't exist or has been removed."
          />
        )}
      </Container>

      {/* Gallery Lightbox */}
      {heritage?.media && heritage.media.length > 0 && (
        <GalleryLightbox
          media={heritage.media}
          initialIndex={galleryIndex}
          open={galleryOpen}
          onClose={() => setGalleryOpen(false)}
          entityName={heritage.name}
        />
      )}
    </div>
  );
}
