"use client";

import { MapPin, Sparkles, ExternalLink, Landmark, Palette, Users, Calendar, Clock, UtensilsCrossed, BookOpen, Theater } from "lucide-react";

/* ========================================
   Types
   ======================================== */

interface HeritagePopupProps {
  name: string;
  type: string;
  description: string;
  state: string;
  category: string;
  id?: string;
  slug?: string;
  source?: "database" | "famous";
  period?: string;
  onAskAI?: (context: { name: string; state: string; category: string }) => void;
}

/* ========================================
   Helpers
   ======================================== */

const CATEGORY_ICONS: Record<string, typeof Landmark> = {
  state: MapPin,
  district: MapPin,
  city: MapPin,
  village: MapPin,
  site: Landmark,
  monument: Landmark,
  temple: Landmark,
  fort: Landmark,
  museum: Landmark,
  craft: Palette,
  festival: Calendar,
  person: Users,
  food: UtensilsCrossed,
  tradition: BookOpen,
  community: Theater,
  architecture: Landmark,
  event: Clock,
};

/* ========================================
   Component
   ======================================== */

export function HeritagePopup({
  name,
  type,
  description,
  state,
  category,
  id,
  slug,
  source,
  period,
  onAskAI,
}: HeritagePopupProps) {
  const Icon = CATEGORY_ICONS[category] || CATEGORY_ICONS[type] || MapPin;

  // Determine the detail link based on entity type
  // Heritage entities link to /heritage/{id}, locations to /explore/{id}
  const HERITAGE_TYPES = new Set(["monument", "craft", "festival", "architecture", "event", "food", "community", "tradition", "person"]);
  const detailHref = id
    ? HERITAGE_TYPES.has(type) || HERITAGE_TYPES.has(category)
      ? `/heritage/${slug || id}`
      : `/explore/${slug || id}`
    : "/heritage";

  return (
    <div className="p-0 min-w-[220px] max-w-[280px]" style={{ fontFamily: "system-ui, sans-serif" }}>
      {/* Header */}
      <div className="px-3 pt-3 pb-2 border-b border-gray-100">
        <div className="flex items-start gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#C2703E]/10 shrink-0 mt-0.5">
            <Icon className="h-4 w-4 text-[#C2703E]" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-sm text-gray-900 leading-tight">{name}</h3>
            <div className="flex items-center gap-1 mt-0.5">
              <MapPin className="h-3 w-3 text-gray-400" />
              <span className="text-[11px] text-gray-500">{state}</span>
              <span className="text-[11px] text-gray-300">·</span>
              <span className="text-[11px] text-[#C2703E] font-medium capitalize">{type}</span>
            </div>
            {period && (
              <div className="flex items-center gap-1 mt-1">
                <Clock className="h-3 w-3 text-[#B8963E]" />
                <span className="text-[11px] text-[#B8963E] font-medium">{period}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Description */}
      {description && (
        <div className="px-3 py-2">
          <p className="text-xs text-gray-600 leading-relaxed line-clamp-3">{description}</p>
        </div>
      )}

      {/* Actions */}
      <div className="px-3 pb-3 flex gap-2">
        <button
          onClick={() => onAskAI?.({ name, state, category: type })}
          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 bg-red-600 text-white text-xs font-medium rounded-md hover:bg-red-700 transition-colors cursor-pointer"
          title="Ask Astrova about this place"
        >
          <Sparkles className="h-3 w-3" />
          Ask AI
        </button>
        <a
          href={detailHref}
          className="flex items-center justify-center gap-1 px-3 py-1.5 border border-gray-200 text-gray-600 text-xs font-medium rounded-md hover:bg-gray-50 transition-colors"
        >
          <ExternalLink className="h-3 w-3" />
          View Heritage
        </a>
      </div>
    </div>
  );
}
