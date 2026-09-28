"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { LoadingState } from "@/components/ui/LoadingState";
import { FadeIn } from "@/components/motion/FadeIn";
import {
  Landmark, Image, Users, BookOpen, Map, Clock, BarChart3,
  Shield, RefreshCw, Eye, Search, ChevronRight, ExternalLink,
  AlertCircle, CheckCircle, Plus, Trash2, Edit3, Save, X,
  Video, FileText, Headphones, Globe, Database, Heart,
  ChevronLeft, MapPin, Calendar, Layers, AlertTriangle, ShieldCheck,
} from "lucide-react";
import { api } from "@/services/api";
import { useAuth } from "@/hooks/useAuth";

/* ========================================
   Types
   ======================================== */

interface OverviewData {
  heritage_entities: number;
  media: number;
  images: number;
  videos: number;
  relationships: number;
  collections: number;
  collection_items: number;
  chatbot_knowledge: number;
  supported_states: number;
  historical_periods: number;
  analytics_events: number;
  locations: number;
  sources: number;
  users: number;
  user_favorites: number;
}

interface HeritageItem {
  id: string;
  name: string;
  slug: string;
  category: string;
  description: string;
  period_id: string | null;
  location_id: string | null;
  source_id: string | null;
  state: string | null;
  location_name: string | null;
  period_name: string | null;
  source_title: string | null;
  media?: MediaItem[];
}

interface MediaItem {
  id: string;
  entity_id: string;
  entity_name?: string;
  entity_slug?: string;
  type: string;
  url: string;
  caption: string;
  alt_text: string;
  credit: string;
  is_primary: boolean;
  display_order: number;
}

interface LocationItem {
  id: string;
  name: string;
  slug: string;
  type: string;
  description: string;
  latitude: number | null;
  longitude: number | null;
  state: string | null;
  parent_id: string | null;
  heritage_count: number;
}

interface SourceItem {
  id: string;
  title: string;
  author: string | null;
  url: string | null;
  source_type: string;
  verification_status: string;
  publisher: string | null;
  publication_date: string | null;
  heritage_count: number;
}

interface UserItem {
  id: string;
  name: string;
  email: string;
  created_at: string;
  favorite_count: number;
  favorites?: Array<{ heritage_id: string; name: string; slug: string }>;
}

interface CollectionItem {
  id: string;
  name: string;
  slug: string;
  description: string;
  entity_count: number;
  is_active: boolean;
  display_order: number;
}

interface PeriodItem {
  id: string;
  name: string;
  start_year: number;
  end_year: number | null;
  description: string;
  heritage_count: number;
}

type AdminTab = "overview" | "heritage" | "media" | "locations" | "sources" | "users" | "collections" | "periods" | "review" | "dataops";

/* ---- Phase 37 Part U: data-ops types ---- */

interface OperatingHoursRow {
  id: string;
  heritage_id: string;
  heritage_name: string;
  day_of_week: number;
  open_time: string | null;
  close_time: string | null;
  is_closed: boolean;
  is_24_hours: boolean;
  special_note: string | null;
  source_url: string | null;
  source_type: string;
  schedule_status: string;
  verification_status: string;
}

interface DemoPlaceRow {
  id: string;
  heritage_id: string;
  heritage_name: string;
  name: string;
  category: string;
  latitude: number;
  longitude: number;
  address: string | null;
  source_type: string;
  verification_status: string;
}

interface RagStatusData {
  pgvector: boolean;
  embedding: { model: string; dimensions: number; dtype: string };
  chunks: {
    total: number;
    embedded: number;
    verified: number;
    languages: Record<string, number>;
    tiers: Record<string, number>;
  };
  lastRun: {
    model: string;
    chunks_seen: number;
    chunks_inserted: number;
    status: string;
    started_at: string;
    finished_at: string | null;
    error: string | null;
  } | null;
  generation: { backend: string; model: string | null; reason: string };
  note: string;
}

/* ========================================
   Auth Gate
   ======================================== */

type AdminIdentity = { id: string; name: string; email: string; role: string };

function AdminLogin({ onAuth, note }: {
  onAuth: (admin: AdminIdentity) => void;
  note?: string;
}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleLogin = async () => {
    if (!username.trim() || !password.trim()) return;
    setLoading(true);
    setError("");
    try {
      const res = await api.requestWithHeaders<{
        success: boolean;
        data?: AdminIdentity;
        error?: { message: string };
      }>("/admin/auth/login", "POST", {}, { username: username.trim(), password });
      if (res.success && res.data) {
        onAuth(res.data);
      } else {
        setError(res.error?.message || "Invalid username or password.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <FadeIn>
          <div className="text-center mb-6">
            <Link href="/" className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-charcoal transition-colors mb-6">
              <ChevronLeft className="h-3.5 w-3.5" /> Back to public site
            </Link>
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-charcoal mx-auto mb-5">
              <Shield className="h-7 w-7 text-terracotta" />
            </div>
            <div className="text-[11px] font-medium uppercase tracking-[0.2em] text-muted mb-2">Astrova</div>
            <h1 className="font-display text-2xl sm:text-3xl text-charcoal mb-2">Admin Portal</h1>
            <p className="text-muted">Sign in with your admin credentials to access the management dashboard.</p>
          </div>

          <div className="rounded-2xl border border-border bg-white p-6 shadow-sm">
            {note && (
              <div className="flex items-start gap-2 text-sm text-amber-700 mb-4 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>{note}</span>
              </div>
            )}
            <div className="relative mb-3">
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                  placeholder="Username (email)"
                  className="w-full rounded-lg border border-border bg-white px-4 py-2.5 text-sm text-charcoal placeholder:text-warm-gray outline-none focus:border-terracotta focus:ring-1 focus:ring-terracotta/30"
                  aria-label="Admin username"
                  autoComplete="username"
                />
              </div>
              <div className="relative mb-3">
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                  placeholder="Password"
                  className="w-full rounded-lg border border-border bg-white px-4 py-2.5 text-sm text-charcoal placeholder:text-warm-gray outline-none focus:border-terracotta focus:ring-1 focus:ring-terracotta/30"
                  aria-label="Admin password"
                  autoComplete="current-password"
                />
              </div>
              {error && (
                <div className="flex items-center gap-2 text-sm text-red-600 mb-3 bg-red-50 rounded-lg px-3 py-2">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  {error}
                </div>
              )}
              <button
                onClick={handleLogin}
                disabled={loading || !username.trim() || !password.trim()}
                className="w-full rounded-lg bg-terracotta hover:bg-terracotta-dark text-white py-2.5 text-sm font-medium transition-colors disabled:opacity-50"
              >
                {loading ? "Signing in..." : "Sign In"}
              </button>
          </div>
        </FadeIn>
      </div>
    </main>
  );
}

/* ========================================
   Notification Toast
   ======================================== */

function Toast({ message, type, onClose }: { message: string; type: "success" | "error"; onClose: () => void }) {
  useEffect(() => {
    const t = setTimeout(onClose, 3000);
    return () => clearTimeout(t);
  }, [onClose]);

  return (
    <div className={`fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-3 rounded-lg shadow-lg text-sm font-medium ${
      type === "success" ? "bg-green-600 text-white" : "bg-red-600 text-white"
    }`}>
      {type === "success" ? <CheckCircle className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
      {message}
    </div>
  );
}

/* ========================================
   Confirmation Dialog
   ======================================== */

function ConfirmDialog({ title, message, onConfirm, onCancel }: {
  title: string; message: string; onConfirm: () => void; onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onCancel}>
      <div className="bg-white rounded-xl p-6 max-w-sm w-full shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 mb-3">
          <AlertTriangle className="h-5 w-5 text-amber-500" />
          <h3 className="font-display text-lg text-charcoal">{title}</h3>
        </div>
        <p className="text-sm text-muted mb-5">{message}</p>
        <div className="flex gap-2 justify-end">
          <button onClick={onCancel} className="px-4 py-2 rounded-lg border border-border text-sm text-muted hover:text-charcoal">Cancel</button>
          <button onClick={onConfirm} className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700">Confirm</button>
        </div>
      </div>
    </div>
  );
}

/* ========================================
   Overview Tab
   ======================================== */

function OverviewTab({ overview }: { overview: OverviewData }) {
  const stats = [
    { label: "Heritage Entities", value: overview.heritage_entities, icon: Landmark, color: "text-terracotta" },
    { label: "Locations", value: overview.locations, icon: MapPin, color: "text-heritage-gold" },
    { label: "Media Records", value: overview.media, icon: Image, color: "text-terracotta" },
    { label: "Images", value: overview.images, icon: Image, color: "text-heritage-gold" },
    { label: "Videos", value: overview.videos, icon: Video, color: "text-terracotta-dark" },
    { label: "Sources", value: overview.sources, icon: BookOpen, color: "text-terracotta" },
    { label: "Collections", value: overview.collections, icon: Layers, color: "text-heritage-gold" },
    { label: "Collection Items", value: overview.collection_items, icon: Database, color: "text-terracotta-dark" },
    { label: "Users", value: overview.users, icon: Users, color: "text-terracotta" },
    { label: "States", value: overview.supported_states, icon: Globe, color: "text-heritage-gold" },
    { label: "Periods", value: overview.historical_periods, icon: Clock, color: "text-terracotta-dark" },
    { label: "Relationships", value: overview.relationships, icon: Heart, color: "text-terracotta" },
    { label: "Chatbot Knowledge", value: overview.chatbot_knowledge, icon: BookOpen, color: "text-heritage-gold" },
    { label: "Analytics Events", value: overview.analytics_events, icon: BarChart3, color: "text-terracotta-dark" },
    { label: "Favorites", value: overview.user_favorites, icon: Heart, color: "text-terracotta" },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
      {stats.map((stat) => {
        const Icon = stat.icon;
        return (
          <div key={stat.label} className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center gap-2 mb-2">
              <Icon className={`h-4 w-4 ${stat.color}`} />
              <span className="text-[10px] text-muted font-medium uppercase tracking-wider">{stat.label}</span>
            </div>
            <div className="font-display text-xl text-charcoal">{stat.value.toLocaleString()}</div>
          </div>
        );
      })}
    </div>
  );
}

/* ========================================
   Heritage Tab
   ======================================== */

function HeritageTab({ showToast }: { showToast: (msg: string, type: "success" | "error") => void }) {
  const [heritage, setHeritage] = useState<HeritageItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [stateFilter, setStateFilter] = useState("");
  const [editing, setEditing] = useState<HeritageItem | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<HeritageItem | null>(null);
  const [locations, setLocations] = useState<LocationItem[]>([]);
  const [periods, setPeriods] = useState<PeriodItem[]>([]);
  const [sources, setSources] = useState<SourceItem[]>([]);

  // Form state
  const [form, setForm] = useState({ name: "", category: "monument", description: "", period_id: "", location_id: "", source_id: "" });

  const categories = ["monument", "craft", "tradition", "natural_landmark", "waterfall", "festival", "cuisine", "person", "architecture", "event", "food", "community"];
  const states = ["Gujarat", "Rajasthan", "Punjab", "Goa", "Tamil Nadu", "Maharashtra", "Madhya Pradesh", "Delhi", "Kerala", "Jammu & Kashmir", "Assam", "Odisha"];

  const fetchHeritage = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (search) params.set("q", search);
      if (categoryFilter) params.set("category", categoryFilter);
      if (stateFilter) params.set("state", stateFilter);
      const qs = params.toString();
      const res = await api.requestWithHeaders<{ success: boolean; data: HeritageItem[] }>(
        `/admin/heritage${qs ? `?${qs}` : ""}`, "GET", 
      );
      if (res.success) setHeritage(res.data || []);
    } catch { /* ignore */ } finally { setLoading(false); }
  }, [search, categoryFilter, stateFilter]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { fetchHeritage(); }, [fetchHeritage]);

  // Load dropdowns
  useEffect(() => {
    const loadDropdowns = async () => {
      const [locRes, perRes, srcRes] = await Promise.all([
        api.requestWithHeaders<{ success: boolean; data: LocationItem[] }>("/admin/locations", "GET", ),
        api.requestWithHeaders<{ success: boolean; data: PeriodItem[] }>("/admin/periods", "GET", ),
        api.requestWithHeaders<{ success: boolean; data: SourceItem[] }>("/admin/sources", "GET", ),
      ]);
      if (locRes.success) setLocations(locRes.data || []);
      if (perRes.success) setPeriods(perRes.data || []);
      if (srcRes.success) setSources(srcRes.data || []);
    };
    loadDropdowns();
  }, []);

  const startEdit = (item: HeritageItem) => {
    setEditing(item);
    setCreating(false);
    setForm({
      name: item.name,
      category: item.category,
      description: item.description || "",
      period_id: item.period_id || "",
      location_id: item.location_id || "",
      source_id: item.source_id || "",
    });
  };

  const startCreate = () => {
    setCreating(true);
    setEditing(null);
    setForm({ name: "", category: "monument", description: "", period_id: "", location_id: "", source_id: "" });
  };

  const handleSave = async () => {
    try {
      if (creating) {
        const res = await api.requestWithHeaders<{ success: boolean; error?: { message: string } }>(
          "/admin/heritage", "POST", form
        );
        if (res.success) { showToast("Heritage created", "success"); setCreating(false); fetchHeritage(); }
        else { showToast(res.error?.message || "Create failed", "error"); }
      } else if (editing) {
        const res = await api.requestWithHeaders<{ success: boolean; error?: { message: string } }>(
          `/admin/heritage/${editing.id}`, "PUT", form
        );
        if (res.success) { showToast("Heritage updated", "success"); setEditing(null); fetchHeritage(); }
        else { showToast(res.error?.message || "Update failed", "error"); }
      }
    } catch (err) { showToast("Request failed", "error"); }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      const res = await api.requestWithHeaders<{ success: boolean; error?: { message: string } }>(
        `/admin/heritage/${deleteTarget.id}`, "DELETE", 
      );
      if (res.success) { showToast("Heritage deleted", "success"); setDeleteTarget(null); fetchHeritage(); }
      else { showToast(res.error?.message || "Delete failed", "error"); }
    } catch { showToast("Delete failed", "error"); }
  };

  return (
    <div>
      {/* Filters + Actions */}
      <div className="flex flex-wrap gap-3 mb-4">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search heritage..."
            className="w-full rounded-lg border border-border bg-white pl-9 pr-3 py-2 text-sm text-charcoal placeholder:text-warm-gray outline-none focus:border-terracotta focus:ring-1 focus:ring-terracotta/30" />
        </div>
        <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}
          className="rounded-lg border border-border bg-white px-3 py-2 text-sm outline-none focus:border-terracotta">
          <option value="">All Categories</option>
          {categories.map((c) => <option key={c} value={c}>{c.replace("_", " ")}</option>)}
        </select>
        <select value={stateFilter} onChange={(e) => setStateFilter(e.target.value)}
          className="rounded-lg border border-border bg-white px-3 py-2 text-sm outline-none focus:border-terracotta">
          <option value="">All States</option>
          {states.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <button onClick={startCreate}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-terracotta text-white text-sm font-medium hover:bg-terracotta-dark">
          <Plus className="h-4 w-4" /> Add Heritage
        </button>
      </div>

      {/* Create/Edit Form */}
      {(creating || editing) && (
        <div className="mb-6 rounded-xl border border-terracotta/20 bg-card p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-display text-lg text-charcoal">{creating ? "Create Heritage" : `Edit: ${editing?.name}`}</h3>
            <button onClick={() => { setCreating(false); setEditing(null); }} className="text-muted hover:text-charcoal"><X className="h-5 w-5" /></button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-muted mb-1">Name *</label>
              <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm outline-none focus:border-terracotta" />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted mb-1">Category *</label>
              <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}
                className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm outline-none focus:border-terracotta">
                {categories.map((c) => <option key={c} value={c}>{c.replace("_", " ")}</option>)}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-muted mb-1">Description</label>
              <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3}
                className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm outline-none focus:border-terracotta resize-none" />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted mb-1">Location</label>
              <select value={form.location_id} onChange={(e) => setForm({ ...form, location_id: e.target.value })}
                className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm outline-none focus:border-terracotta">
                <option value="">None</option>
                {locations.map((l) => <option key={l.id} value={l.id}>{l.name} ({l.state || l.type})</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-muted mb-1">Period</label>
              <select value={form.period_id} onChange={(e) => setForm({ ...form, period_id: e.target.value })}
                className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm outline-none focus:border-terracotta">
                <option value="">None</option>
                {periods.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.start_year}{p.end_year ? ` – ${p.end_year}` : " – present"})</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-muted mb-1">Source</label>
              <select value={form.source_id} onChange={(e) => setForm({ ...form, source_id: e.target.value })}
                className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm outline-none focus:border-terracotta">
                <option value="">None</option>
                {sources.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
              </select>
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <button onClick={handleSave}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-terracotta text-white text-sm font-medium hover:bg-terracotta-dark">
              <Save className="h-4 w-4" /> {creating ? "Create" : "Save Changes"}
            </button>
            <button onClick={() => { setCreating(false); setEditing(null); }}
              className="px-4 py-2 rounded-lg border border-border text-sm text-muted hover:text-charcoal">Cancel</button>
          </div>
        </div>
      )}

      {/* Heritage Table */}
      {loading ? <LoadingState /> : heritage.length === 0 ? (
        <div className="text-center py-12">
          <Landmark className="h-10 w-10 text-muted mx-auto mb-3" />
          <p className="text-muted">No heritage entities found.</p>
        </div>
      ) : (
        <div className="rounded-xl border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-parchment border-b border-border">
                  <th className="text-left px-4 py-3 font-medium text-stone">Name</th>
                  <th className="text-left px-4 py-3 font-medium text-stone">Category</th>
                  <th className="text-left px-4 py-3 font-medium text-stone hidden sm:table-cell">State</th>
                  <th className="text-left px-4 py-3 font-medium text-stone hidden md:table-cell">Period</th>
                  <th className="text-left px-4 py-3 font-medium text-stone hidden md:table-cell">Source</th>
                  <th className="text-right px-4 py-3 font-medium text-stone">Actions</th>
                </tr>
              </thead>
              <tbody>
                {heritage.map((item) => (
                  <tr key={item.id} className="border-b border-border/50 hover:bg-cream/30 transition-colors">
                    <td className="px-4 py-3">
                      <div className="font-medium text-charcoal">{item.name}</div>
                      <div className="text-xs text-muted truncate max-w-[200px]">{item.slug}</div>
                    </td>
                    <td className="px-4 py-3"><Badge variant="outline" className="text-xs capitalize">{item.category?.replace("_", " ")}</Badge></td>
                    <td className="px-4 py-3 text-stone hidden sm:table-cell">{item.state || "—"}</td>
                    <td className="px-4 py-3 text-stone hidden md:table-cell">{item.period_name || "—"}</td>
                    <td className="px-4 py-3 text-stone hidden md:table-cell">{item.source_title || "—"}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center gap-1 justify-end">
                        <button onClick={() => startEdit(item)} className="p-1.5 rounded text-muted hover:text-terracotta hover:bg-terracotta/5" title="Edit">
                          <Edit3 className="h-3.5 w-3.5" />
                        </button>
                        <a href={`/heritage/${item.slug}`} target="_blank" rel="noopener noreferrer"
                          className="p-1.5 rounded text-muted hover:text-terracotta hover:bg-terracotta/5" title="View">
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                        <button onClick={() => setDeleteTarget(item)} className="p-1.5 rounded text-muted hover:text-red-600 hover:bg-red-50" title="Delete">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <div className="mt-3 text-xs text-muted">Showing {heritage.length} heritage entities</div>

      {deleteTarget && (
        <ConfirmDialog
          title="Delete Heritage"
          message={`Are you sure you want to delete "${deleteTarget.name}"? This will also remove associated media, relationships, collection items, and favorites. This cannot be undone.`}
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}

/* ========================================
   Media Tab
   ======================================== */

function MediaTab({ showToast }: { showToast: (msg: string, type: "success" | "error") => void }) {
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState("");
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<MediaItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<MediaItem | null>(null);
  const [heritageList, setHeritageList] = useState<HeritageItem[]>([]);
  const [form, setForm] = useState({ entity_id: "", type: "image", url: "", caption: "", alt_text: "", credit: "", is_primary: false });
  
  // File upload state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchMedia = useCallback(async () => {
    try {
      const qs = typeFilter ? `?type=${typeFilter}` : "";
      const res = await api.requestWithHeaders<{ success: boolean; data: MediaItem[] }>(
        `/admin/media${qs}`, "GET", 
      );
      if (res.success) setMedia(res.data || []);
    } catch { /* ignore */ } finally { setLoading(false); }
  }, [typeFilter]);

  // Fetch-on-mount/filter-change pattern: the loading/data setState calls all
  // happen after `await`, so renders stay async — this lint rule traces the
  // callee regardless and would otherwise flag every admin list.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { fetchMedia(); }, [fetchMedia]);

  useEffect(() => {
    api.requestWithHeaders<{ success: boolean; data: HeritageItem[] }>(
      "/admin/heritage", "GET", 
    ).then((r) => { if (r.success) setHeritageList(r.data || []); });
  }, []);

  const handleSave = async () => {
    try {
      if (creating) {
        // If a file is selected, use upload endpoint
        if (selectedFile) {
          await handleFileUpload();
        } else {
          // Otherwise use URL-based endpoint
          const formData = {
            ...form,
            is_primary: String(form.is_primary),
          };
          const res = await api.requestWithHeaders<{ success: boolean; error?: { message: string } }>(
            "/admin/media", "POST", {}, formData
          );
          if (res.success) { showToast("Media added", "success"); setCreating(false); fetchMedia(); }
          else { showToast(res.error?.message || "Failed", "error"); }
        }
      } else if (editing) {
        const formData = {
          ...form,
          is_primary: String(form.is_primary),
        };
        const res = await api.requestWithHeaders<{ success: boolean; error?: { message: string } }>(
          `/admin/media/${editing.id}`, "PUT", {}, formData
        );
        if (res.success) { showToast("Media updated", "success"); setEditing(null); fetchMedia(); }
        else { showToast(res.error?.message || "Failed", "error"); }
      }
    } catch { showToast("Request failed", "error"); }
  };

  const handleFileUpload = async () => {
    if (!selectedFile || !form.entity_id) {
      setUploadError("Please select a file and heritage entity.");
      return;
    }

    setUploading(true);
    setUploadError(null);
    setUploadProgress(0);

    try {
      const formData = new FormData();
      formData.append("file", selectedFile);
      formData.append("entity_id", form.entity_id);
      formData.append("caption", form.caption);
      formData.append("alt_text", form.alt_text);
      formData.append("credit", form.credit);
      formData.append("is_primary", String(form.is_primary));
      formData.append("display_order", "0");

      const response = await fetch("/api/proxy/admin/media/upload", {
        method: "POST",
        credentials: "include",
        body: formData,
      });

      const data = await response.json();

      if (response.ok && data.success) {
        showToast("Media uploaded successfully", "success");
        setCreating(false);
        setSelectedFile(null);
        setFilePreview(null);
        fetchMedia();
      } else {
        setUploadError(data.error?.message || "Upload failed. Please try again.");
        showToast(data.error?.message || "Upload failed", "error");
      }
    } catch (err) {
      setUploadError("Upload failed. Please check your connection and try again.");
      showToast("Upload failed", "error");
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    const allowedImageTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
    const allowedVideoTypes = ["video/mp4", "video/webm", "video/quicktime"];
    const isImage = allowedImageTypes.includes(file.type);
    const isVideo = allowedVideoTypes.includes(file.type);
    if (!isImage && !isVideo) {
      setUploadError("Unsupported format. Please upload JPG, PNG, WebP, MP4, WebM, or MOV.");
      return;
    }

    // Validate file size
    const maxSize = isVideo ? 50 * 1024 * 1024 : 5 * 1024 * 1024;
    if (file.size > maxSize) {
      const limit = isVideo ? "50 MB" : "5 MB";
      setUploadError(`${isVideo ? "Video" : "Image"} exceeds the allowed file size of ${limit}.`);
      return;
    }

    setSelectedFile(file);
    setUploadError(null);

    // Auto-set type based on file MIME
    if (isVideo && form.type === "image") {
      setForm(prev => ({ ...prev, type: "video" }));
    } else if (isImage && form.type === "video") {
      setForm(prev => ({ ...prev, type: "image" }));
    }

    // Create preview (images only — videos use object URL)
    if (isImage) {
      const reader = new FileReader();
      reader.onload = (event) => {
        setFilePreview(event.target?.result as string);
      };
      reader.readAsDataURL(file);
    } else {
      // For videos, create an object URL for preview
      const url = URL.createObjectURL(file);
      setFilePreview(url);
    }
  };

  const handleFileRemove = () => {
    setSelectedFile(null);
    setFilePreview(null);
    setUploadError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      const res = await api.requestWithHeaders<{ success: boolean }>(
        `/admin/media/${deleteTarget.id}`, "DELETE", 
      );
      if (res.success) { showToast("Media deleted", "success"); setDeleteTarget(null); fetchMedia(); }
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Delete failed", "error");
      setDeleteTarget(null);
    }
  };

  const startEdit = (item: MediaItem) => {
    setEditing(item); setCreating(false);
    setForm({ entity_id: item.entity_id, type: item.type, url: item.url, caption: item.caption || "", alt_text: item.alt_text || "", credit: item.credit || "", is_primary: item.is_primary });
  };

  // Admin only manages image and video. Existing audio/document records are preserved but not created via Admin.
  const typeIcon = (t: string) => {
    switch (t) { case "image": return <Image className="h-4 w-4" />; case "video": return <Video className="h-4 w-4" />; default: return <FileText className="h-4 w-4" />; }
  };

  return (
    <div>
      <div className="flex flex-wrap gap-3 mb-4">
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}
          className="rounded-lg border border-border bg-white px-3 py-2 text-sm outline-none focus:border-terracotta">
          <option value="">All Types</option>
          <option value="image">Image</option>
          <option value="video">Video</option>
          <option value="document">Document</option>
          <option value="audio">Audio</option>
        </select>
        <button onClick={() => { setCreating(true); setEditing(null); setForm({ entity_id: "", type: "image", url: "", caption: "", alt_text: "", credit: "", is_primary: false }); setSelectedFile(null); setFilePreview(null); setUploadError(null); }}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-terracotta text-white text-sm font-medium hover:bg-terracotta-dark">
          <Plus className="h-4 w-4" /> Add Media
        </button>
      </div>

      {(creating || editing) && (
        <div className="mb-6 rounded-xl border border-terracotta/20 bg-card p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-display text-lg text-charcoal">{creating ? "Add Media" : "Edit Media"}</h3>
            <button onClick={() => { setCreating(false); setEditing(null); }} className="text-muted hover:text-charcoal"><X className="h-5 w-5" /></button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-muted mb-1">Heritage Entity *</label>
              <select value={form.entity_id} onChange={(e) => setForm({ ...form, entity_id: e.target.value })}
                className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm outline-none focus:border-terracotta">
                <option value="">Select heritage...</option>
                {heritageList.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-muted mb-1">Type *</label>
              <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}
                className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm outline-none focus:border-terracotta" disabled={!!selectedFile}>
                <option value="image">Image</option>
                <option value="video">Video</option>
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-muted mb-1">
                {creating ? "Upload Media *" : "URL *"}
              </label>
              {creating ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <input
                      type="file"
                      ref={fileInputRef}
                      onChange={handleFileSelect}
                      accept="image/jpeg,image/jpg,image/png,image/webp,video/mp4,video/webm,video/quicktime"
                      className="hidden"
                      id="media-upload"
                    />
                    <label
                      htmlFor="media-upload"
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-3 border-2 border-dashed border-border rounded-lg cursor-pointer hover:border-terracotta/50 hover:bg-cream/30 transition-colors"
                    >
                      <Image className="h-5 w-5 text-muted" />
                      <span className="text-sm text-muted">
                        {selectedFile ? "Change file" : "Browse / Choose Media"}
                      </span>
                    </label>
                    {selectedFile && (
                      <button
                        type="button"
                        onClick={handleFileRemove}
                        className="p-2 text-muted hover:text-red-600"
                        title="Remove file"
                      >
                        <X className="h-5 w-5" />
                      </button>
                    )}
                  </div>

                  {/* File info */}
                  {selectedFile && (
                    <div className="bg-cream/50 rounded-lg p-3">
                      <div className="flex items-center gap-3">
                        {filePreview && selectedFile.type.startsWith("video/") ? (
                          <video
                            src={filePreview}
                            className="h-16 w-16 object-cover rounded-lg"
                            controls
                            muted
                          />
                        ) : filePreview ? (
                          <img
                            src={filePreview}
                            alt="Preview"
                            className="h-16 w-16 object-cover rounded-lg"
                          />
                        ) : null}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-charcoal truncate">
                            {selectedFile.name}
                          </p>
                          <p className="text-xs text-muted">
                            {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB • {selectedFile.type.split("/")[1].toUpperCase()}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Error message */}
                  {uploadError && (
                    <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">
                      <AlertCircle className="h-4 w-4 shrink-0" />
                      {uploadError}
                    </div>
                  )}

                  {/* Upload progress */}
                  {uploading && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-xs text-muted">
                        <span>Uploading...</span>
                        <span>{uploadProgress}%</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div
                          className="bg-terracotta h-2 rounded-full transition-all duration-300"
                          style={{ width: `${uploadProgress}%` }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <input type="url" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="https://..."
                  className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm outline-none focus:border-terracotta" />
              )}
            </div>
            <div>
              <label className="block text-xs font-medium text-muted mb-1">Caption</label>
              <input type="text" value={form.caption} onChange={(e) => setForm({ ...form, caption: e.target.value })}
                className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm outline-none focus:border-terracotta" />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted mb-1">Alt Text</label>
              <input type="text" value={form.alt_text} onChange={(e) => setForm({ ...form, alt_text: e.target.value })}
                className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm outline-none focus:border-terracotta" />
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" checked={form.is_primary} onChange={(e) => setForm({ ...form, is_primary: e.target.checked })} id="is_primary"
                className="rounded border-border text-terracotta focus:ring-terracotta" />
              <label htmlFor="is_primary" className="text-sm text-muted">Primary media</label>
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <button onClick={handleSave} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-terracotta text-white text-sm font-medium hover:bg-terracotta-dark">
              <Save className="h-4 w-4" /> {creating ? "Add" : "Save"}
            </button>
            <button onClick={() => { setCreating(false); setEditing(null); }} className="px-4 py-2 rounded-lg border border-border text-sm text-muted hover:text-charcoal">Cancel</button>
          </div>
        </div>
      )}

      {loading ? <LoadingState /> : media.length === 0 ? (
        <div className="text-center py-12"><Image className="h-10 w-10 text-muted mx-auto mb-3" /><p className="text-muted">No media records found.</p></div>
      ) : (
        <div className="rounded-xl border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-parchment border-b border-border">
                  <th className="text-left px-4 py-3 font-medium text-stone">Type</th>
                  <th className="text-left px-4 py-3 font-medium text-stone">Entity</th>
                  <th className="text-left px-4 py-3 font-medium text-stone hidden md:table-cell">URL</th>
                  <th className="text-left px-4 py-3 font-medium text-stone hidden sm:table-cell">Primary</th>
                  <th className="text-right px-4 py-3 font-medium text-stone">Actions</th>
                </tr>
              </thead>
              <tbody>
                {media.map((item) => (
                  <tr key={item.id} className="border-b border-border/50 hover:bg-cream/30 transition-colors">
                    <td className="px-4 py-3"><div className="flex items-center gap-1.5">{typeIcon(item.type)}<span className="capitalize">{item.type}</span></div></td>
                    <td className="px-4 py-3"><div className="text-charcoal text-xs">{item.entity_name || "—"}</div></td>
                    <td className="px-4 py-3 hidden md:table-cell"><div className="text-muted text-xs truncate max-w-[300px]">{item.url}</div></td>
                    <td className="px-4 py-3 hidden sm:table-cell">{item.is_primary ? <Badge variant="default" className="text-[10px]">Primary</Badge> : "—"}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center gap-1 justify-end">
                        <button onClick={() => startEdit(item)} className="p-1.5 rounded text-muted hover:text-terracotta"><Edit3 className="h-3.5 w-3.5" /></button>
                        <button onClick={() => setDeleteTarget(item)} className="p-1.5 rounded text-muted hover:text-red-600"><Trash2 className="h-3.5 w-3.5" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <div className="mt-3 text-xs text-muted">Showing {media.length} media records</div>

      {deleteTarget && (
        <ConfirmDialog title="Delete Media" message="Are you sure you want to delete this media record?"
          onConfirm={handleDelete} onCancel={() => setDeleteTarget(null)} />
      )}
    </div>
  );
}

/* ========================================
   Locations Tab
   ======================================== */

function LocationsTab({ showToast }: { showToast: (msg: string, type: "success" | "error") => void }) {
  const [locations, setLocations] = useState<LocationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<LocationItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<LocationItem | null>(null);
  const [form, setForm] = useState({ name: "", type: "site", description: "", latitude: "", longitude: "", state: "", parent_id: "" });

  const fetchLocations = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (search) params.set("q", search);
      if (typeFilter) params.set("type", typeFilter);
      const qs = params.toString();
      const res = await api.requestWithHeaders<{ success: boolean; data: LocationItem[] }>(
        `/admin/locations${qs ? `?${qs}` : ""}`, "GET", 
      );
      if (res.success) setLocations(res.data || []);
    } catch { /* ignore */ } finally { setLoading(false); }
  }, [search, typeFilter]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch after await; see note above fetchMedia
  useEffect(() => { fetchLocations(); }, [fetchLocations]);

  const handleSave = async () => {
    const payload = { ...form };
    try {
      if (creating) {
        const res = await api.requestWithHeaders<{ success: boolean; error?: { message: string } }>("/admin/locations", "POST", {}, payload);
        if (res.success) { showToast("Location created", "success"); setCreating(false); fetchLocations(); } else { showToast(res.error?.message || "Failed", "error"); }
      } else if (editing) {
        const res = await api.requestWithHeaders<{ success: boolean; error?: { message: string } }>(`/admin/locations/${editing.id}`, "PUT", {}, payload);
        if (res.success) { showToast("Location updated", "success"); setEditing(null); fetchLocations(); } else { showToast(res.error?.message || "Failed", "error"); }
      }
    } catch { showToast("Request failed", "error"); }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      const res = await api.requestWithHeaders<{ success: boolean; error?: { message: string } }>(`/admin/locations/${deleteTarget.id}`, "DELETE", );
      if (res.success) { showToast("Location deleted", "success"); setDeleteTarget(null); fetchLocations(); }
      else { showToast(res.error?.message || "Cannot delete — location is in use", "error"); setDeleteTarget(null); }
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Delete failed", "error");
      setDeleteTarget(null);
    }
  };

  return (
    <div>
      <div className="flex flex-wrap gap-3 mb-4">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search locations..."
            className="w-full rounded-lg border border-border bg-white pl-9 pr-3 py-2 text-sm text-charcoal placeholder:text-warm-gray outline-none focus:border-terracotta focus:ring-1 focus:ring-terracotta/30" />
        </div>
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}
          className="rounded-lg border border-border bg-white px-3 py-2 text-sm outline-none focus:border-terracotta">
          <option value="">All Types</option>
          <option value="state">State</option>
          <option value="district">District</option>
          <option value="city">City</option>
          <option value="village">Village</option>
          <option value="site">Site</option>
        </select>
        <button onClick={() => { setCreating(true); setEditing(null); setForm({ name: "", type: "site", description: "", latitude: "", longitude: "", state: "", parent_id: "" }); }}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-terracotta text-white text-sm font-medium hover:bg-terracotta-dark">
          <Plus className="h-4 w-4" /> Add Location
        </button>
      </div>

      {(creating || editing) && (
        <div className="mb-6 rounded-xl border border-terracotta/20 bg-card p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-display text-lg text-charcoal">{creating ? "Create Location" : `Edit: ${editing?.name}`}</h3>
            <button onClick={() => { setCreating(false); setEditing(null); }} className="text-muted hover:text-charcoal"><X className="h-5 w-5" /></button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-muted mb-1">Name *</label>
              <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm outline-none focus:border-terracotta" />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted mb-1">Type *</label>
              <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}
                className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm outline-none focus:border-terracotta">
                <option value="state">State</option><option value="district">District</option><option value="city">City</option>
                <option value="village">Village</option><option value="site">Site</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-muted mb-1">State</label>
              <input type="text" value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} placeholder="e.g. Gujarat"
                className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm outline-none focus:border-terracotta" />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted mb-1">Latitude (-90 to 90)</label>
              <input type="number" step="any" value={form.latitude} onChange={(e) => setForm({ ...form, latitude: e.target.value })} placeholder="23.0225"
                className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm outline-none focus:border-terracotta" />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted mb-1">Longitude (-180 to 180)</label>
              <input type="number" step="any" value={form.longitude} onChange={(e) => setForm({ ...form, longitude: e.target.value })} placeholder="72.5714"
                className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm outline-none focus:border-terracotta" />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-muted mb-1">Description</label>
              <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2}
                className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm outline-none focus:border-terracotta resize-none" />
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <button onClick={handleSave} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-terracotta text-white text-sm font-medium hover:bg-terracotta-dark">
              <Save className="h-4 w-4" /> {creating ? "Create" : "Save"}
            </button>
            <button onClick={() => { setCreating(false); setEditing(null); }} className="px-4 py-2 rounded-lg border border-border text-sm text-muted hover:text-charcoal">Cancel</button>
          </div>
        </div>
      )}

      {loading ? <LoadingState /> : locations.length === 0 ? (
        <div className="text-center py-12"><MapPin className="h-10 w-10 text-muted mx-auto mb-3" /><p className="text-muted">No locations found.</p></div>
      ) : (
        <div className="rounded-xl border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-parchment border-b border-border">
                  <th className="text-left px-4 py-3 font-medium text-stone">Name</th>
                  <th className="text-left px-4 py-3 font-medium text-stone">Type</th>
                  <th className="text-left px-4 py-3 font-medium text-stone hidden sm:table-cell">State</th>
                  <th className="text-left px-4 py-3 font-medium text-stone hidden md:table-cell">Coords</th>
                  <th className="text-left px-4 py-3 font-medium text-stone">Heritage</th>
                  <th className="text-right px-4 py-3 font-medium text-stone">Actions</th>
                </tr>
              </thead>
              <tbody>
                {locations.map((item) => (
                  <tr key={item.id} className="border-b border-border/50 hover:bg-cream/30 transition-colors">
                    <td className="px-4 py-3"><div className="font-medium text-charcoal">{item.name}</div></td>
                    <td className="px-4 py-3"><Badge variant="outline" className="text-xs capitalize">{item.type}</Badge></td>
                    <td className="px-4 py-3 text-stone hidden sm:table-cell">{item.state || "—"}</td>
                    <td className="px-4 py-3 text-muted text-xs hidden md:table-cell">
                      {(() => {
                        const lat = item.latitude != null ? Number(item.latitude) : null;
                        const lng = item.longitude != null ? Number(item.longitude) : null;
                        if (lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng)) {
                          return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
                        }
                        return "—";
                      })()}
                    </td>
                    <td className="px-4 py-3 text-stone">{item.heritage_count}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center gap-1 justify-end">
                        <button onClick={() => { setEditing(item); setCreating(false); setForm({ name: item.name, type: item.type, description: item.description || "", latitude: item.latitude?.toString() || "", longitude: item.longitude?.toString() || "", state: item.state || "", parent_id: item.parent_id || "" }); }}
                          className="p-1.5 rounded text-muted hover:text-terracotta"><Edit3 className="h-3.5 w-3.5" /></button>
                        <button onClick={() => setDeleteTarget(item)} className="p-1.5 rounded text-muted hover:text-red-600"><Trash2 className="h-3.5 w-3.5" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <div className="mt-3 text-xs text-muted">Showing {locations.length} locations</div>

      {deleteTarget && (
        <ConfirmDialog title="Delete Location" message={`Delete "${deleteTarget.name}"? It must not be used by any heritage entities.`}
          onConfirm={handleDelete} onCancel={() => setDeleteTarget(null)} />
      )}
    </div>
  );
}

/* ========================================
   Sources Tab
   ======================================== */

/* ========================================
   Data Review Tab (Phase 36 — controlled enrichment workflow)

   Lists persisted enrichment proposals, lets admins verify/reject/
   reopen with a note, trigger an admin-boundary refresh for one
   entity, and run a read-only POSSIBLE DUPLICATE scan.
   Approval is reference-only — curated heritage data is untouched.
   ======================================== */

interface EnrichmentProposal {
  id: string;
  entity_id: string;
  entity_name: string;
  entity_slug: string | null;
  external_id: string;
  field: string;
  proposed_value: string;
  current_value: string | null;
  source_name: string;
  source_url: string | null;
  license: string | null;
  conflicts: Array<{ type: string; detail: string }>;
  status: "DRAFT" | "PENDING_REVIEW" | "VERIFIED" | "REJECTED" | "CONFLICT";
  reviewer_note: string | null;
  retrieved_at: string;
  reviewed_at: string | null;
}

interface DuplicatePair {
  a: { id: string; name: string; slug: string | null };
  b: { id: string; name: string; slug: string | null };
  score: number;
  reasons: string[];
}

const PROPOSAL_STATUS_STYLES: Record<EnrichmentProposal["status"], string> = {
  PENDING_REVIEW: "bg-stone-100 text-stone-600",
  CONFLICT: "bg-amber-100 text-amber-700",
  VERIFIED: "bg-green-100 text-green-700",
  REJECTED: "bg-red-100 text-red-600",
  DRAFT: "bg-blue-50 text-blue-700",
};

const PROPOSAL_STATUS_LABELS: Record<EnrichmentProposal["status"], string> = {
  PENDING_REVIEW: "Pending review",
  CONFLICT: "Conflict — requires review",
  VERIFIED: "Verified",
  REJECTED: "Rejected",
  DRAFT: "Draft",
};

function ReviewTab({ showToast }: { showToast: (msg: string, type: "success" | "error") => void }) {
  const [proposals, setProposals] = useState<EnrichmentProposal[]>([]);
  const [total, setTotal] = useState(0);
  const [statusFilter, setStatusFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [noteFor, setNoteFor] = useState<string | null>(null);
  const [noteText, setNoteText] = useState("");
  const [duplicates, setDuplicates] = useState<DuplicatePair[] | null>(null);
  const [dupScanned, setDupScanned] = useState(0);
  const [scanning, setScanning] = useState(false);
  const [refreshEntity, setRefreshEntity] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const fetchProposals = useCallback(async () => {
    setLoading(true);
    try {
      const qs = statusFilter ? `?status=${encodeURIComponent(statusFilter)}` : "";
      const res = await api.requestWithHeaders<{
        success: boolean;
        data?: { proposals: EnrichmentProposal[]; total: number };
      }>(`/admin/enrichment/proposals${qs}`, "GET");
      if (res.success && res.data) {
        setProposals(res.data.proposals);
        setTotal(res.data.total);
      }
    } catch { /* session handled globally */ } finally { setLoading(false); }
  }, [statusFilter]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch after await
  useEffect(() => { fetchProposals(); }, [fetchProposals]);

  const handleReview = async (id: string, action: "verify" | "reject" | "reopen") => {
    try {
      const res = await api.requestWithHeaders<{ success: boolean; error?: { message?: string } }>(
        `/admin/enrichment/proposals/${id}/review`,
        "POST",
        {},
        { action, note: noteFor === id ? noteText : undefined }
      );
      if (res.success) {
        showToast(`Proposal ${action === "verify" ? "verified" : action === "reject" ? "rejected" : "reopened"}`, "success");
        setNoteFor(null);
        setNoteText("");
        fetchProposals();
      } else {
        showToast(res.error?.message || "Review action failed", "error");
      }
    } catch { showToast("Request failed", "error"); }
  };

  const handleRefresh = async () => {
    const id = refreshEntity.trim();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      showToast("Enter a valid heritage UUID", "error");
      return;
    }
    setRefreshing(true);
    try {
      const res = await api.requestWithHeaders<{
        success: boolean;
        data?: { enrichment_status: string; inserted: number; refreshed: number; skipped: number };
        error?: { message?: string };
      }>(`/admin/enrichment/refresh/${id}`, "POST", {});
      if (res.success && res.data) {
        showToast(
          `Refresh: ${res.data.enrichment_status} — ${res.data.inserted} new, ${res.data.refreshed} refreshed, ${res.data.skipped} kept`,
          "success"
        );
        fetchProposals();
      } else {
        showToast(res.error?.message || "Refresh failed", "error");
      }
    } catch { showToast("Request failed", "error"); } finally { setRefreshing(false); }
  };

  const handleScan = async () => {
    setScanning(true);
    try {
      const res = await api.requestWithHeaders<{
        success: boolean;
        data?: { pairs: DuplicatePair[]; scanned: number };
      }>("/admin/enrichment/duplicates", "GET");
      if (res.success && res.data) {
        setDuplicates(res.data.pairs);
        setDupScanned(res.data.scanned);
        showToast(
          res.data.pairs.length === 0
            ? `No possible duplicates in ${res.data.scanned} records`
            : `${res.data.pairs.length} possible duplicate flag(s)`,
          "success"
        );
      }
    } catch { showToast("Scan failed", "error"); } finally { setScanning(false); }
  };

  return (
    <div>
      <div className="mb-6 rounded-xl border border-border bg-card p-5">
        <h2 className="font-semibold text-charcoal mb-1">Enrichment review queue</h2>
        <p className="text-sm text-muted mb-4">
          External proposals are validated, duplicate- and conflict-checked, then held for
          review. Verifying a proposal records a verified reference with provenance — it never
          overwrites curated heritage data.
        </p>
        <div className="flex flex-wrap gap-2 items-center">
          <label htmlFor="review-status-filter" className="sr-only">Filter by status</label>
          <select
            id="review-status-filter"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-lg border border-border bg-white px-3 py-2 text-sm text-charcoal outline-none focus:border-terracotta focus:ring-1 focus:ring-terracotta/30"
          >
            <option value="">All statuses</option>
            <option value="PENDING_REVIEW">Pending review</option>
            <option value="CONFLICT">Conflict — requires review</option>
            <option value="VERIFIED">Verified</option>
            <option value="REJECTED">Rejected</option>
          </select>
          <button
            type="button"
            onClick={fetchProposals}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border text-sm text-charcoal hover:bg-cream/40"
          >
            <RefreshCw className="h-4 w-4" /> Refresh list
          </button>
          <span className="text-xs text-muted">{total} proposal(s)</span>
        </div>
      </div>

      {/* Admin-triggered external refresh — one entity, bounded */}
      <div className="mb-6 rounded-xl border border-border bg-card p-5">
        <h2 className="font-semibold text-charcoal mb-1">Extract proposals for one entity</h2>
        <p className="text-sm text-muted mb-3">
          Runs the controlled extraction pipeline (validation → duplicate → conflict →
          provenance) for a single heritage UUID. Existing review decisions are preserved.
        </p>
        <div className="flex flex-wrap gap-2">
          <label htmlFor="refresh-entity-id" className="sr-only">Heritage entity UUID</label>
          <input
            id="refresh-entity-id"
            type="text"
            value={refreshEntity}
            onChange={(e) => setRefreshEntity(e.target.value)}
            placeholder="Heritage entity UUID"
            className="flex-1 min-w-[240px] rounded-lg border border-border bg-white px-3 py-2 text-sm text-charcoal placeholder:text-warm-gray outline-none focus:border-terracotta focus:ring-1 focus:ring-terracotta/30 font-mono"
          />
          <button
            type="button"
            onClick={handleRefresh}
            disabled={refreshing}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-terracotta text-white text-sm font-medium hover:bg-terracotta-dark disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            {refreshing ? "Extracting..." : "Extract"}
          </button>
        </div>
      </div>

      {/* Proposal list */}
      <div className="mb-6 rounded-xl border border-border bg-card">
        <div className="px-5 py-4 border-b border-border">
          <h2 className="font-semibold text-charcoal">Proposals</h2>
        </div>
        {loading ? (
          <div className="px-5 py-8 text-sm text-muted" role="status">Loading proposals...</div>
        ) : proposals.length === 0 ? (
          <div className="px-5 py-8 text-sm text-muted">
            No proposals yet. Use the extraction tool above to pull external references for a
            heritage entity.
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {proposals.map((p) => (
              <li key={p.id} className="px-5 py-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <span className="font-medium text-charcoal text-sm">{p.entity_name}</span>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${PROPOSAL_STATUS_STYLES[p.status]}`}>
                        {PROPOSAL_STATUS_LABELS[p.status]}
                      </span>
                      <span className="text-xs text-muted">{p.field}</span>
                    </div>
                    <p className="text-sm text-charcoal break-words">
                      <span className="text-muted">Proposed:</span> {p.proposed_value}
                    </p>
                    {p.current_value && (
                      <p className="text-sm text-muted break-words">
                        Current Astrova value: {p.current_value}
                      </p>
                    )}
                    <p className="text-xs text-muted mt-1">
                      Source: {p.source_name}
                      {p.license ? ` · ${p.license}` : ""} · {p.external_id}
                      {p.reviewed_at ? ` · reviewed ${new Date(p.reviewed_at).toLocaleDateString("en-IN")}` : ""}
                    </p>
                    {p.conflicts.length > 0 && (
                      <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-2">
                        {p.conflicts.map((c) => (
                          <p key={c.detail} className="text-xs text-amber-800">{c.detail}</p>
                        ))}
                      </div>
                    )}
                    {p.reviewer_note && (
                      <p className="text-xs text-muted mt-1 italic">Review note: {p.reviewer_note}</p>
                    )}
                  </div>
                  <div className="flex flex-col gap-2 shrink-0">
                    {p.status !== "VERIFIED" && p.status !== "REJECTED" && (
                      <button
                        type="button"
                        onClick={() => handleReview(p.id, "verify")}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-green-600 text-white text-xs font-medium hover:bg-green-700"
                      >
                        <CheckCircle className="h-3.5 w-3.5" /> Verify
                      </button>
                    )}
                    {p.status !== "REJECTED" && p.status !== "VERIFIED" && (
                      <button
                        type="button"
                        onClick={() => handleReview(p.id, "reject")}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-red-200 text-red-600 text-xs font-medium hover:bg-red-50"
                      >
                        <X className="h-3.5 w-3.5" /> Reject
                      </button>
                    )}
                    {(p.status === "VERIFIED" || p.status === "REJECTED") && (
                      <button
                        type="button"
                        onClick={() => handleReview(p.id, "reopen")}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-border text-charcoal text-xs font-medium hover:bg-cream/40"
                      >
                        <RefreshCw className="h-3.5 w-3.5" /> Reopen
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => { setNoteFor(noteFor === p.id ? null : p.id); setNoteText(""); }}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-border text-xs text-muted hover:bg-cream/40"
                      aria-expanded={noteFor === p.id}
                    >
                      <Edit3 className="h-3.5 w-3.5" /> Note
                    </button>
                  </div>
                </div>
                {noteFor === p.id && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <label htmlFor={`note-${p.id}`} className="sr-only">Review note</label>
                    <input
                      id={`note-${p.id}`}
                      type="text"
                      value={noteText}
                      onChange={(e) => setNoteText(e.target.value)}
                      placeholder="Reviewer note (admin-only, never public)"
                      maxLength={1000}
                      className="flex-1 min-w-[200px] rounded-lg border border-border bg-white px-3 py-1.5 text-sm text-charcoal placeholder:text-warm-gray outline-none focus:border-terracotta focus:ring-1 focus:ring-terracotta/30"
                    />
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Read-only duplicate scan */}
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
          <div>
            <h2 className="font-semibold text-charcoal">Duplicate detection</h2>
            <p className="text-sm text-muted">
              Read-only scan — flags POSSIBLE DUPLICATE pairs for human review. Nothing is
              merged or deleted.
            </p>
          </div>
          <button
            type="button"
            onClick={handleScan}
            disabled={scanning}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border text-sm text-charcoal hover:bg-cream/40 disabled:opacity-50"
          >
            <Search className="h-4 w-4" /> {scanning ? "Scanning..." : "Run scan"}
          </button>
        </div>
        {duplicates && (
          <div className="mt-3">
            {duplicates.length === 0 ? (
              <p className="text-sm text-green-700" role="status">
                No possible duplicates found across {dupScanned} records.
              </p>
            ) : (
              <ul className="space-y-2">
                {duplicates.map((pair) => (
                  <li key={`${pair.a.id}-${pair.b.id}`} className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                    <p className="text-sm font-medium text-amber-800">
                      POSSIBLE DUPLICATE — {Math.round(pair.score * 100)}% match
                    </p>
                    <p className="text-sm text-amber-900">
                      {pair.a.name} ↔ {pair.b.name}
                    </p>
                    <p className="text-xs text-amber-700">{pair.reasons.join(" · ")}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function SourcesTab({ showToast }: { showToast: (msg: string, type: "success" | "error") => void }) {
  const [sources, setSources] = useState<SourceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<SourceItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SourceItem | null>(null);
  const [form, setForm] = useState({ title: "", author: "", url: "", source_type: "OTHER", verification_status: "UNVERIFIED", publisher: "", publication_date: "", notes: "" });

  const fetchSources = useCallback(async () => {
    try {
      const qs = search ? `?q=${encodeURIComponent(search)}` : "";
      const res = await api.requestWithHeaders<{ success: boolean; data: SourceItem[] }>(`/admin/sources${qs}`, "GET", );
      if (res.success) setSources(res.data || []);
    } catch { /* ignore */ } finally { setLoading(false); }
  }, [search]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch after await; see note above fetchMedia
  useEffect(() => { fetchSources(); }, [fetchSources]);

  const handleSave = async () => {
    try {
      if (creating) {
        const res = await api.requestWithHeaders<{ success: boolean; error?: { message: string } }>("/admin/sources", "POST", form);
        if (res.success) { showToast("Source created", "success"); setCreating(false); fetchSources(); } else { showToast(res.error?.message || "Failed", "error"); }
      } else if (editing) {
        const res = await api.requestWithHeaders<{ success: boolean; error?: { message: string } }>(`/admin/sources/${editing.id}`, "PUT", form);
        if (res.success) { showToast("Source updated", "success"); setEditing(null); fetchSources(); } else { showToast(res.error?.message || "Failed", "error"); }
      }
    } catch { showToast("Request failed", "error"); }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      const res = await api.requestWithHeaders<{ success: boolean; error?: { message: string } }>(`/admin/sources/${deleteTarget.id}`, "DELETE", );
      if (res.success) { showToast("Source deleted", "success"); setDeleteTarget(null); fetchSources(); }
      else { showToast(res.error?.message || "Cannot delete — source is in use", "error"); setDeleteTarget(null); }
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Delete failed", "error");
      setDeleteTarget(null);
    }
  };

  return (
    <div>
      <div className="flex flex-wrap gap-3 mb-4">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search sources..."
            className="w-full rounded-lg border border-border bg-white pl-9 pr-3 py-2 text-sm text-charcoal placeholder:text-warm-gray outline-none focus:border-terracotta focus:ring-1 focus:ring-terracotta/30" />
        </div>
        <button onClick={() => { setCreating(true); setEditing(null); setForm({ title: "", author: "", url: "", source_type: "OTHER", verification_status: "UNVERIFIED", publisher: "", publication_date: "", notes: "" }); }}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-terracotta text-white text-sm font-medium hover:bg-terracotta-dark">
          <Plus className="h-4 w-4" /> Add Source
        </button>
      </div>

      {(creating || editing) && (
        <div className="mb-6 rounded-xl border border-terracotta/20 bg-card p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-display text-lg text-charcoal">{creating ? "Add Source" : "Edit Source"}</h3>
            <button onClick={() => { setCreating(false); setEditing(null); }} className="text-muted hover:text-charcoal"><X className="h-5 w-5" /></button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-muted mb-1">Title *</label>
              <input type="text" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })}
                className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm outline-none focus:border-terracotta" />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted mb-1">Author</label>
              <input type="text" value={form.author} onChange={(e) => setForm({ ...form, author: e.target.value })}
                className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm outline-none focus:border-terracotta" />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted mb-1">Source Type</label>
              <select value={form.source_type} onChange={(e) => setForm({ ...form, source_type: e.target.value })}
                className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm outline-none focus:border-terracotta">
                <option value="ACADEMIC">Academic</option><option value="GOVERNMENT">Government</option>
                <option value="NEWS">News</option><option value="BOOK">Book</option>
                <option value="WEBSITE">Website</option><option value="ARCHIVE">Archive</option>
                <option value="OTHER">Other</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-muted mb-1">URL</label>
              <input type="url" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="https://..."
                className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm outline-none focus:border-terracotta" />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted mb-1">Verification</label>
              <select value={form.verification_status} onChange={(e) => setForm({ ...form, verification_status: e.target.value })}
                className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm outline-none focus:border-terracotta">
                <option value="UNVERIFIED">Unverified</option><option value="REVIEWED">Reviewed</option><option value="VERIFIED">Verified</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-muted mb-1">Publisher</label>
              <input type="text" value={form.publisher} onChange={(e) => setForm({ ...form, publisher: e.target.value })}
                className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm outline-none focus:border-terracotta" />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted mb-1">Publication Date</label>
              <input type="date" value={form.publication_date} onChange={(e) => setForm({ ...form, publication_date: e.target.value })}
                className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm outline-none focus:border-terracotta" />
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <button onClick={handleSave} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-terracotta text-white text-sm font-medium hover:bg-terracotta-dark">
              <Save className="h-4 w-4" /> {creating ? "Add" : "Save"}
            </button>
            <button onClick={() => { setCreating(false); setEditing(null); }} className="px-4 py-2 rounded-lg border border-border text-sm text-muted hover:text-charcoal">Cancel</button>
          </div>
        </div>
      )}

      {loading ? <LoadingState /> : sources.length === 0 ? (
        <div className="text-center py-12"><BookOpen className="h-10 w-10 text-muted mx-auto mb-3" /><p className="text-muted">No sources found.</p></div>
      ) : (
        <div className="rounded-xl border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-parchment border-b border-border">
                  <th className="text-left px-4 py-3 font-medium text-stone">Title</th>
                  <th className="text-left px-4 py-3 font-medium text-stone hidden sm:table-cell">Author</th>
                  <th className="text-left px-4 py-3 font-medium text-stone hidden md:table-cell">Type</th>
                  <th className="text-left px-4 py-3 font-medium text-stone hidden md:table-cell">Status</th>
                  <th className="text-left px-4 py-3 font-medium text-stone">Heritage</th>
                  <th className="text-right px-4 py-3 font-medium text-stone">Actions</th>
                </tr>
              </thead>
              <tbody>
                {sources.map((item) => (
                  <tr key={item.id} className="border-b border-border/50 hover:bg-cream/30 transition-colors">
                    <td className="px-4 py-3"><div className="font-medium text-charcoal truncate max-w-[250px]">{item.title}</div></td>
                    <td className="px-4 py-3 text-stone hidden sm:table-cell">{item.author || "—"}</td>
                    <td className="px-4 py-3 hidden md:table-cell"><Badge variant="outline" className="text-xs">{item.source_type}</Badge></td>
                    <td className="px-4 py-3 hidden md:table-cell"><Badge variant={item.verification_status === "VERIFIED" ? "default" : "secondary"} className="text-xs">{item.verification_status}</Badge></td>
                    <td className="px-4 py-3 text-stone">{item.heritage_count}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center gap-1 justify-end">
                        <button onClick={() => { setEditing(item); setCreating(false); setForm({ title: item.title, author: item.author || "", url: item.url || "", source_type: item.source_type, verification_status: item.verification_status, publisher: item.publisher || "", publication_date: item.publication_date || "", notes: "" }); }}
                          className="p-1.5 rounded text-muted hover:text-terracotta"><Edit3 className="h-3.5 w-3.5" /></button>
                        <button onClick={() => setDeleteTarget(item)} className="p-1.5 rounded text-muted hover:text-red-600"><Trash2 className="h-3.5 w-3.5" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {deleteTarget && (
        <ConfirmDialog title="Delete Source" message={`Delete "${deleteTarget.title}"? It must not be used by any heritage entities.`}
          onConfirm={handleDelete} onCancel={() => setDeleteTarget(null)} />
      )}
    </div>
  );
}

/* ========================================
   Users Tab
   ======================================== */

function UsersTab({ showToast }: { showToast: (msg: string, type: "success" | "error") => void }) {
  const [users, setUsers] = useState<UserItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedUser, setSelectedUser] = useState<UserItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<UserItem | null>(null);

  const fetchUsers = useCallback(async () => {
    try {
      const qs = search ? `?q=${encodeURIComponent(search)}` : "";
      const res = await api.requestWithHeaders<{ success: boolean; data: UserItem[] }>(`/admin/users${qs}`, "GET", );
      if (res.success) setUsers(res.data || []);
    } catch { /* ignore */ } finally { setLoading(false); }
  }, [search]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch after await; see note above fetchMedia
  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  const viewUser = async (user: UserItem) => {
    const res = await api.requestWithHeaders<{ success: boolean; data: UserItem }>(`/admin/users/${user.id}`, "GET", );
    if (res.success) setSelectedUser(res.data);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      // Backend requires an explicit identity-tied confirmation payload.
      const res = await api.requestWithHeaders<{ success: boolean; error?: { message: string } }>(
        `/admin/users/${deleteTarget.id}`, "DELETE", {},
        { confirm: `DELETE:${deleteTarget.email}` }
      );
      if (res.success) { showToast("User deleted", "success"); setDeleteTarget(null); setSelectedUser(null); fetchUsers(); }
      else { showToast(res.error?.message || "Failed", "error"); setDeleteTarget(null); }
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Delete failed", "error");
      setDeleteTarget(null);
    }
  };

  return (
    <div>
      <div className="flex flex-wrap gap-3 mb-4">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search users by name or email..."
            className="w-full rounded-lg border border-border bg-white pl-9 pr-3 py-2 text-sm text-charcoal placeholder:text-warm-gray outline-none focus:border-terracotta focus:ring-1 focus:ring-terracotta/30" />
        </div>
      </div>

      {selectedUser && (
        <div className="mb-6 rounded-xl border border-terracotta/20 bg-card p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-display text-lg text-charcoal">User: {selectedUser.name}</h3>
            <button onClick={() => setSelectedUser(null)} className="text-muted hover:text-charcoal"><X className="h-5 w-5" /></button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
            <div><span className="text-xs text-muted uppercase">Email</span><p className="text-sm font-medium text-charcoal">{selectedUser.email}</p></div>
            <div><span className="text-xs text-muted uppercase">Joined</span><p className="text-sm font-medium text-charcoal">{new Date(selectedUser.created_at).toLocaleDateString()}</p></div>
            <div><span className="text-xs text-muted uppercase">Favorites</span><p className="text-sm font-medium text-charcoal">{selectedUser.favorites?.length || 0}</p></div>
          </div>
          {selectedUser.favorites && selectedUser.favorites.length > 0 && (
            <div>
              <span className="text-xs text-muted uppercase mb-2 block">Favorites</span>
              <div className="flex flex-wrap gap-2">
                {selectedUser.favorites.map((f) => (
                  <a key={f.heritage_id} href={`/heritage/${f.slug}`} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-cream/50 text-xs text-charcoal hover:text-terracotta">
                    {f.name} <ExternalLink className="h-2.5 w-2.5" />
                  </a>
                ))}
              </div>
            </div>
          )}
          <div className="mt-4 flex gap-2">
            <button onClick={() => setDeleteTarget(selectedUser)}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-red-200 text-xs text-red-600 hover:bg-red-50">
              <Trash2 className="h-3 w-3" /> Delete User
            </button>
          </div>
        </div>
      )}

      {loading ? <LoadingState /> : users.length === 0 ? (
        <div className="text-center py-12"><Users className="h-10 w-10 text-muted mx-auto mb-3" /><p className="text-muted">No users found.</p></div>
      ) : (
        <div className="rounded-xl border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-parchment border-b border-border">
                  <th className="text-left px-4 py-3 font-medium text-stone">Name</th>
                  <th className="text-left px-4 py-3 font-medium text-stone">Email</th>
                  <th className="text-left px-4 py-3 font-medium text-stone hidden sm:table-cell">Joined</th>
                  <th className="text-left px-4 py-3 font-medium text-stone">Favorites</th>
                  <th className="text-right px-4 py-3 font-medium text-stone">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id} className="border-b border-border/50 hover:bg-cream/30 transition-colors">
                    <td className="px-4 py-3 font-medium text-charcoal">{user.name}</td>
                    <td className="px-4 py-3 text-stone">{user.email}</td>
                    <td className="px-4 py-3 text-muted text-xs hidden sm:table-cell">{new Date(user.created_at).toLocaleDateString()}</td>
                    <td className="px-4 py-3 text-stone">{user.favorite_count}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center gap-1 justify-end">
                        <button onClick={() => viewUser(user)} className="p-1.5 rounded text-muted hover:text-terracotta" title="View"><Eye className="h-3.5 w-3.5" /></button>
                        <button onClick={() => setDeleteTarget(user)} className="p-1.5 rounded text-muted hover:text-red-600" title="Delete"><Trash2 className="h-3.5 w-3.5" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {deleteTarget && (
        <ConfirmDialog title="Delete User" message={`Delete "${deleteTarget.name}" (${deleteTarget.email})? This will also remove their ${deleteTarget.favorite_count} favorites.`}
          onConfirm={handleDelete} onCancel={() => setDeleteTarget(null)} />
      )}
    </div>
  );
}

/* ========================================
   Collections Tab
   ======================================== */

function CollectionsTab({ showToast }: { showToast: (msg: string, type: "success" | "error") => void }) {
  const [collections, setCollections] = useState<CollectionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<CollectionItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CollectionItem | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: "", slug: "", description: "", display_order: "0", is_active: true });

  const fetchCollections = useCallback(async () => {
    try {
      const res = await api.requestWithHeaders<{ success: boolean; data: CollectionItem[] }>("/admin/collections", "GET", );
      if (res.success) setCollections(res.data || []);
    } catch { /* ignore */ } finally { setLoading(false); }
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch after await; see note above fetchMedia
  useEffect(() => { fetchCollections(); }, [fetchCollections]);

  const slugify = (value: string) => value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

  const startCreate = () => {
    setCreating(true);
    setEditing(null);
    setForm({ name: "", slug: "", description: "", display_order: "0", is_active: true });
  };

  const startEdit = (col: CollectionItem) => {
    setEditing(col);
    setCreating(false);
    setForm({
      name: col.name,
      slug: col.slug,
      description: col.description || "",
      display_order: String(col.display_order ?? 0),
      is_active: col.is_active,
    });
  };

  const closeForm = () => { setCreating(false); setEditing(null); };

  const handleSave = async () => {
    const slug = form.slug.trim() || slugify(form.name);
    if (!form.name.trim() || !slug) {
      showToast("Name and slug are required", "error");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        slug,
        description: form.description.trim(),
        display_order: parseInt(form.display_order, 10) || 0,
        is_active: form.is_active,
      };
      if (creating) {
        const res = await api.requestWithHeaders<{ success: boolean; error?: { message: string } }>(
          "/admin/collections", "POST", {}, payload
        );
        if (res.success) { showToast("Collection created", "success"); closeForm(); fetchCollections(); }
        else { showToast(res.error?.message || "Create failed", "error"); }
      } else if (editing) {
        const res = await api.requestWithHeaders<{ success: boolean; error?: { message: string } }>(
          `/admin/collections/${editing.id}`, "PUT", {}, payload
        );
        if (res.success) { showToast("Collection updated", "success"); closeForm(); fetchCollections(); }
        else { showToast(res.error?.message || "Update failed", "error"); }
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Request failed", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      const res = await api.requestWithHeaders<{ success: boolean; error?: { message: string } }>(
        `/admin/collections/${deleteTarget.id}`, "DELETE", 
      );
      if (res.success) { showToast("Collection deleted", "success"); setDeleteTarget(null); fetchCollections(); }
      else { showToast(res.error?.message || "Delete failed", "error"); setDeleteTarget(null); }
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Delete failed", "error");
      setDeleteTarget(null);
    }
  };

  return (
    <div>
      {/* Toolbar */}
      <div className="flex flex-wrap gap-3 mb-4">
        <div className="flex-1 min-w-[200px] text-sm text-muted self-center">
          {collections.length} collection{collections.length === 1 ? "" : "s"} on the platform
        </div>
        <button onClick={startCreate}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-terracotta text-white text-sm font-medium hover:bg-terracotta-dark">
          <Plus className="h-4 w-4" /> Add Collection
        </button>
      </div>

      {/* Create / Edit form */}
      {(creating || editing) && (
        <div className="mb-6 rounded-xl border border-terracotta/20 bg-card p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-display text-lg text-charcoal">{creating ? "Create Collection" : `Edit: ${editing?.name}`}</h3>
            <button onClick={closeForm} className="text-muted hover:text-charcoal" aria-label="Close form"><X className="h-5 w-5" /></button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-muted mb-1">Name *</label>
              <input type="text" value={form.name}
                onChange={(e) => {
                  const name = e.target.value;
                  setForm((f) => ({ ...f, name, slug: creating || f.slug === slugify(f.name) ? slugify(name) || f.slug : f.slug }));
                }}
                className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm outline-none focus:border-terracotta" />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted mb-1">Slug *</label>
              <input type="text" value={form.slug} onChange={(e) => setForm({ ...form, slug: slugify(e.target.value) })}
                placeholder="e.g. sacred-architecture"
                className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm font-mono outline-none focus:border-terracotta" />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-muted mb-1">Description</label>
              <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2}
                className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm outline-none focus:border-terracotta resize-none" />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted mb-1">Display order</label>
              <input type="number" value={form.display_order} onChange={(e) => setForm({ ...form, display_order: e.target.value })}
                className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm outline-none focus:border-terracotta" />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted mb-1">Status</label>
              <select value={form.is_active ? "active" : "inactive"}
                onChange={(e) => setForm({ ...form, is_active: e.target.value === "active" })}
                className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm outline-none focus:border-terracotta">
                <option value="active">Active (visible)</option>
                <option value="inactive">Inactive (hidden)</option>
              </select>
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <button onClick={handleSave} disabled={saving}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-terracotta text-white text-sm font-medium hover:bg-terracotta-dark disabled:opacity-50">
              <Save className="h-4 w-4" /> {saving ? "Saving..." : creating ? "Create" : "Save Changes"}
            </button>
            <button onClick={closeForm} className="px-4 py-2 rounded-lg border border-border text-sm text-muted hover:text-charcoal">Cancel</button>
          </div>
        </div>
      )}

      {loading ? <LoadingState /> : collections.length === 0 ? (
        <div className="text-center py-12"><Layers className="h-10 w-10 text-muted mx-auto mb-3" /><p className="text-muted">No collections found.</p></div>
      ) : (
        <div className="grid gap-3">
          {collections.map((col) => (
            <div key={col.id} className="rounded-xl border border-border bg-card p-4 hover:border-terracotta/20 transition-colors">
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-display text-lg text-charcoal">{col.name}</h3>
                    <Badge variant={col.is_active ? "default" : "secondary"} className="text-xs">{col.is_active ? "Active" : "Inactive"}</Badge>
                  </div>
                  <p className="text-sm text-muted truncate">{col.slug}</p>
                  {col.description && <p className="text-sm text-stone mt-1 line-clamp-2">{col.description}</p>}
                  <div className="flex items-center gap-4 mt-2">
                    <span className="text-xs text-muted"><BookOpen className="h-3 w-3 inline mr-1" />{col.entity_count} entities</span>
                    <span className="text-xs text-muted">Order: {col.display_order}</span>
                  </div>
                </div>
                <div className="shrink-0 ml-4 flex items-center gap-2">
                  <a href={`/collections/${col.slug}`} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-terracotta hover:text-terracotta-dark">
                    View <ExternalLink className="h-3 w-3" />
                  </a>
                  <button onClick={() => startEdit(col)} title="Edit collection"
                    className="p-1.5 rounded text-muted hover:text-terracotta hover:bg-terracotta/5">
                    <Edit3 className="h-3.5 w-3.5" />
                  </button>
                  <button onClick={() => setDeleteTarget(col)} title="Delete collection"
                    className="p-1.5 rounded text-muted hover:text-red-600 hover:bg-red-50">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {deleteTarget && (
        <ConfirmDialog
          title="Delete Collection"
          message={`Delete "${deleteTarget.name}"? Its ${deleteTarget.entity_count} curated items will be unlinked. This cannot be undone.`}
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}

/* ========================================
   Periods Tab
   ======================================== */

function PeriodsTab({ showToast }: { showToast: (msg: string, type: "success" | "error") => void }) {
  const [periods, setPeriods] = useState<PeriodItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<PeriodItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PeriodItem | null>(null);
  const [form, setForm] = useState({ name: "", start_year: "", end_year: "", description: "" });

  const fetchPeriods = useCallback(async () => {
    try {
      const res = await api.requestWithHeaders<{ success: boolean; data: PeriodItem[] }>("/admin/periods", "GET", );
      if (res.success) setPeriods(res.data || []);
    } catch { /* ignore */ } finally { setLoading(false); }
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch after await; see note above fetchMedia
  useEffect(() => { fetchPeriods(); }, [fetchPeriods]);

  const formatYear = (y: number | string) => {
    const n = Number(y);
    return Number.isFinite(n) ? (n < 0 ? `${Math.abs(n)} BCE` : `${n} CE`) : String(y);
  };

  const handleSave = async () => {
    const payload = {
      name: form.name,
      start_year: form.start_year || "",
      end_year: form.end_year || "",
      description: form.description || "",
    };
    try {
      if (creating) {
        const res = await api.requestWithHeaders<{ success: boolean; error?: { message: string } }>("/admin/periods", "POST", {}, payload);
        if (res.success) { showToast("Period created", "success"); setCreating(false); fetchPeriods(); }
        else { showToast(res.error?.message || "Failed", "error"); }
      } else if (editing) {
        const res = await api.requestWithHeaders<{ success: boolean; error?: { message: string } }>(`/admin/periods/${editing.id}`, "PUT", {}, payload);
        if (res.success) { showToast("Period updated", "success"); setEditing(null); fetchPeriods(); }
        else { showToast(res.error?.message || "Failed", "error"); }
      }
    } catch { showToast("Request failed", "error"); }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      const res = await api.requestWithHeaders<{ success: boolean; error?: { message: string } }>(`/admin/periods/${deleteTarget.id}`, "DELETE", );
      if (res.success) { showToast("Period deleted", "success"); setDeleteTarget(null); fetchPeriods(); }
      else { showToast(res.error?.message || "Cannot delete: period is in use", "error"); setDeleteTarget(null); }
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Delete failed", "error");
      setDeleteTarget(null);
    }
  };

  return (
    <div>
      <div className="flex flex-wrap gap-3 mb-4">
        <button onClick={() => { setCreating(true); setEditing(null); setForm({ name: "", start_year: "", end_year: "", description: "" }); }}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-terracotta text-white text-sm font-medium hover:bg-terracotta-dark">
          <Plus className="h-4 w-4" /> Add Period
        </button>
      </div>

      {(creating || editing) && (
        <div className="mb-6 rounded-xl border border-terracotta/20 bg-card p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-display text-lg text-charcoal">{creating ? "Create Period" : `Edit: ${editing?.name}`}</h3>
            <button onClick={() => { setCreating(false); setEditing(null); }} className="text-muted hover:text-charcoal"><X className="h-5 w-5" /></button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-muted mb-1">Name *</label>
              <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Ancient Period"
                className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm outline-none focus:border-terracotta" />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted mb-1">Start Year * (negative = BCE, e.g. -3300)</label>
              <input type="number" value={form.start_year} onChange={(e) => setForm({ ...form, start_year: e.target.value })} placeholder="-3300"
                className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm outline-none focus:border-terracotta" />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted mb-1">End Year (null = ongoing)</label>
              <input type="number" value={form.end_year} onChange={(e) => setForm({ ...form, end_year: e.target.value })} placeholder="700"
                className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm outline-none focus:border-terracotta" />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-muted mb-1">Description</label>
              <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2}
                className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm outline-none focus:border-terracotta resize-none" />
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <button onClick={handleSave} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-terracotta text-white text-sm font-medium hover:bg-terracotta-dark">
              <Save className="h-4 w-4" /> {creating ? "Create" : "Save"}
            </button>
            <button onClick={() => { setCreating(false); setEditing(null); }} className="px-4 py-2 rounded-lg border border-border text-sm text-muted hover:text-charcoal">Cancel</button>
          </div>
        </div>
      )}

      {loading ? <LoadingState /> : periods.length === 0 ? (
        <div className="text-center py-12"><Clock className="h-10 w-10 text-muted mx-auto mb-3" /><p className="text-muted">No periods found.</p></div>
      ) : (
        <div className="rounded-xl border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-parchment border-b border-border">
                  <th className="text-left px-4 py-3 font-medium text-stone">Period</th>
                  <th className="text-left px-4 py-3 font-medium text-stone">Duration</th>
                  <th className="text-left px-4 py-3 font-medium text-stone hidden md:table-cell">Description</th>
                  <th className="text-left px-4 py-3 font-medium text-stone">Heritage</th>
                  <th className="text-right px-4 py-3 font-medium text-stone">Actions</th>
                </tr>
              </thead>
              <tbody>
                {periods.map((p) => (
                  <tr key={p.id} className="border-b border-border/50 hover:bg-cream/30 transition-colors">
                    <td className="px-4 py-3 font-medium text-charcoal">{p.name}</td>
                    <td className="px-4 py-3 text-stone text-xs">{formatYear(p.start_year)} — {p.end_year != null ? formatYear(p.end_year) : "present"}</td>
                    <td className="px-4 py-3 text-muted text-xs hidden md:table-cell line-clamp-2 max-w-[300px]">{p.description || "—"}</td>
                    <td className="px-4 py-3 text-stone">{p.heritage_count}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center gap-1 justify-end">
                        <button onClick={() => { setEditing(p); setCreating(false); setForm({ name: p.name, start_year: String(p.start_year), end_year: p.end_year != null ? String(p.end_year) : "", description: p.description || "" }); }}
                          className="p-1.5 rounded text-muted hover:text-terracotta"><Edit3 className="h-3.5 w-3.5" /></button>
                        <button onClick={() => setDeleteTarget(p)} className="p-1.5 rounded text-muted hover:text-red-600"><Trash2 className="h-3.5 w-3.5" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {deleteTarget && (
        <ConfirmDialog title="Delete Period" message={`Delete \"${deleteTarget.name}\"? It must not be used by any heritage entities. (${deleteTarget.heritage_count} entities currently use it.)`}
          onConfirm={handleDelete} onCancel={() => setDeleteTarget(null)} />
      )}
    </div>
  );
}

/* ========================================
   Phase 37 Part U — Data Ops (hours, demo places, RAG)
   ======================================== */

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const SCHEDULE_STATUS_STYLES: Record<string, string> = {
  VERIFIED: "bg-emerald-50 text-emerald-700",
  DEMO: "bg-sky-50 text-sky-700",
  CONFLICT: "bg-amber-50 text-amber-700",
  ASTROVA_ESTIMATE: "bg-stone-100 text-stone-600",
};

function DataOpsTab({ showToast }: { showToast: (msg: string, type: "success" | "error") => void }) {
  const [rag, setRag] = useState<RagStatusData | null>(null);
  const [ingesting, setIngesting] = useState(false);
  const [hours, setHours] = useState<OperatingHoursRow[]>([]);
  const [places, setPlaces] = useState<DemoPlaceRow[]>([]);
  const [entities, setEntities] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [placeStats, setPlaceStats] = useState<{ total: number; categories: number; entities: number; verified: number } | null>(null);

  // Hours form
  const [hEntity, setHEntity] = useState("");
  const [hDay, setHDay] = useState("1");
  const [hOpen, setHOpen] = useState("09:00");
  const [hClose, setHClose] = useState("17:00");
  const [hClosed, setHClosed] = useState(false);
  const [h24, setH24] = useState(false);
  const [hNote, setHNote] = useState("");
  const [hUrl, setHUrl] = useState("");
  const [savingHours, setSavingHours] = useState(false);

  // Demo place form
  const [pEntity, setPEntity] = useState("");
  const [pName, setPName] = useState("");
  const [pCategory, setPCategory] = useState("HOTEL");
  const [pLat, setPLat] = useState("");
  const [pLon, setPLon] = useState("");
  const [savingPlace, setSavingPlace] = useState(false);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [ragRes, hoursRes, placesRes, heritageRes] = await Promise.all([
        api.requestWithHeaders<{ success: boolean; data: RagStatusData }>("/admin/rag/status", "GET", {}),
        api.requestWithHeaders<{ success: boolean; data?: { rows: OperatingHoursRow[] } }>("/admin/operating-hours", "GET", {}),
        api.requestWithHeaders<{ success: boolean; data?: { rows: DemoPlaceRow[]; stats: { total: number; categories: number; entities: number; verified: number } } }>("/admin/demo-places", "GET", {}),
        api.requestWithHeaders<{ success: boolean; data?: { id: string; name: string }[] }>("/admin/heritage", "GET", {}),
      ]);
      if (ragRes.success) setRag(ragRes.data);
      if (hoursRes.success && hoursRes.data) setHours(hoursRes.data.rows);
      if (placesRes.success && placesRes.data) {
        setPlaces(placesRes.data.rows);
        setPlaceStats(placesRes.data.stats);
      }
      if (heritageRes.success && heritageRes.data) setEntities(heritageRes.data);
    } catch {
      showToast("Could not load data-ops records", "error");
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch after await
  useEffect(() => { fetchAll(); }, [fetchAll]);

  const handleIngest = async () => {
    setIngesting(true);
    try {
      const res = await api.requestWithHeaders<{
        success: boolean;
        data?: { status: string; chunks_seen: number; chunks_inserted: number };
        error?: { message?: string };
      }>("/admin/rag/ingest", "POST", {});
      if (res.success && res.data) {
        showToast(`Ingestion ${res.data.status.toLowerCase()} — ${res.data.chunks_inserted} new of ${res.data.chunks_seen} seen`, "success");
        fetchAll();
      } else {
        showToast(res.error?.message || "Ingestion failed", "error");
      }
    } catch { showToast("Ingestion request failed", "error"); } finally { setIngesting(false); }
  };

  const handleAddHours = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!hEntity) { showToast("Pick a heritage entity", "error"); return; }
    setSavingHours(true);
    try {
      const res = await api.requestWithHeaders<{ success: boolean; error?: { message?: string } }>(
        "/admin/operating-hours", "POST", {},
        {
          heritageId: hEntity, dayOfWeek: Number(hDay),
          openTime: hClosed || h24 ? null : hOpen,
          closeTime: hClosed || h24 ? null : hClose,
          isClosed: hClosed, is24Hours: h24,
          specialNote: hNote || null, sourceUrl: hUrl || null,
          // Honesty: anything an admin types here is DEMO until reviewed.
          sourceType: "DEMO", scheduleStatus: "DEMO", verificationStatus: "UNVERIFIED",
        }
      );
      if (res.success) {
        showToast("Schedule row added as DEMO — not verified", "success");
        setHNote(""); setHUrl("");
        fetchAll();
      } else showToast(res.error?.message || "Could not add schedule", "error");
    } catch { showToast("Request failed", "error"); } finally { setSavingHours(false); }
  };

  const handleDeleteHours = async (id: string) => {
    try {
      const res = await api.requestWithHeaders<{ success: boolean; error?: { message?: string } }>(
        `/admin/operating-hours/${id}`, "DELETE", {}
      );
      if (res.success) { showToast("Schedule row deleted", "success"); fetchAll(); }
      else showToast(res.error?.message || "Delete failed", "error");
    } catch { showToast("Request failed", "error"); }
  };

  const handleAddPlace = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pEntity || !pName.trim()) { showToast("Entity and name are required", "error"); return; }
    setSavingPlace(true);
    try {
      const res = await api.requestWithHeaders<{ success: boolean; error?: { message?: string } }>(
        "/admin/demo-places", "POST", {},
        { heritageId: pEntity, name: pName.trim(), category: pCategory, latitude: Number(pLat), longitude: Number(pLon) }
      );
      if (res.success) {
        showToast("Demo place added (DEMO / UNVERIFIED)", "success");
        setPName(""); setPLat(""); setPLon("");
        fetchAll();
      } else showToast(res.error?.message || "Could not add place", "error");
    } catch { showToast("Request failed", "error"); } finally { setSavingPlace(false); }
  };

  const handleDeletePlace = async (id: string) => {
    try {
      const res = await api.requestWithHeaders<{ success: boolean; error?: { message?: string } }>(
        `/admin/demo-places/${id}`, "DELETE", {}
      );
      if (res.success) { showToast("Demo place deleted", "success"); fetchAll(); }
      else showToast(res.error?.message || "Delete failed", "error");
    } catch { showToast("Request failed", "error"); }
  };

  if (loading) return <LoadingState />;

  return (
    <div className="space-y-6">
      {/* ---- RAG status ---- */}
      <section className="rounded-xl border border-border bg-white overflow-hidden">
        <header className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-b border-border bg-parchment">
          <div>
            <h3 className="font-display text-lg text-charcoal flex items-center gap-2">
              <Database className="h-4 w-4 text-terracotta" /> RAG knowledge base
            </h3>
            <p className="text-xs text-muted mt-0.5">Vector retrieval status and idempotent re-ingestion.</p>
          </div>
          <button
            onClick={handleIngest}
            disabled={ingesting}
            className="inline-flex items-center gap-2 rounded-lg bg-terracotta px-3 py-2 text-sm font-medium text-white hover:bg-terracotta-light disabled:opacity-60"
          >
            {ingesting ? <RefreshCw className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            {ingesting ? "Rebuilding…" : "Rebuild knowledge"}
          </button>
        </header>
        {rag ? (
          <div className="p-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-lg border border-border p-3">
              <p className="text-[10px] uppercase tracking-wider text-muted">pgvector</p>
              <p className={`mt-1 text-sm font-semibold ${rag.pgvector ? "text-emerald-600" : "text-red-600"}`}>
                {rag.pgvector ? "Available" : "Missing"}
              </p>
            </div>
            <div className="rounded-lg border border-border p-3">
              <p className="text-[10px] uppercase tracking-wider text-muted">Embedding model</p>
              <p className="mt-1 text-sm font-medium text-charcoal break-all">{rag.embedding.model}</p>
              <p className="text-xs text-muted">{rag.embedding.dimensions}-dim · {rag.embedding.dtype}</p>
            </div>
            <div className="rounded-lg border border-border p-3">
              <p className="text-[10px] uppercase tracking-wider text-muted">Chunks</p>
              <p className="mt-1 text-sm font-medium text-charcoal">
                {rag.chunks.embedded} / {rag.chunks.total} embedded
              </p>
              <p className="text-xs text-muted">{rag.chunks.verified} verified · {Object.keys(rag.chunks.languages).length} languages</p>
            </div>
            <div className="rounded-lg border border-border p-3">
              <p className="text-[10px] uppercase tracking-wider text-muted">Generation backend</p>
              <p className="mt-1 text-sm font-medium text-charcoal capitalize">{rag.generation.backend}</p>
              <p className="text-xs text-muted line-clamp-2">{rag.generation.reason}</p>
            </div>
            <div className="sm:col-span-2 lg:col-span-4 flex flex-wrap gap-2">
              {Object.entries(rag.chunks.languages).map(([lang, n]) => (
                <span key={lang} className="rounded-full border border-border px-2.5 py-1 text-xs text-charcoal">
                  {lang.toUpperCase()} · {n}
                </span>
              ))}
            </div>
            {rag.lastRun && (
              <p className="sm:col-span-2 lg:col-span-4 text-xs text-muted">
                Last run: {rag.lastRun.status} · {rag.lastRun.chunks_inserted} inserted of {rag.lastRun.chunks_seen} seen
                {rag.lastRun.error ? ` · error: ${rag.lastRun.error}` : ""}
              </p>
            )}
          </div>
        ) : (
          <div className="p-5 text-sm text-muted">RAG status unavailable.</div>
        )}
      </section>

      {/* ---- Operating hours ---- */}
      <section className="rounded-xl border border-border bg-white overflow-hidden">
        <header className="px-5 py-4 border-b border-border bg-parchment">
          <h3 className="font-display text-lg text-charcoal flex items-center gap-2">
            <Clock className="h-4 w-4 text-terracotta" /> Operating hours
            <Badge variant="secondary" className="bg-white text-stone border-cream">{hours.length} rows</Badge>
          </h3>
          <p className="text-xs text-muted mt-0.5">
            New rows are stored as DEMO / UNVERIFIED. CONFLICT rows refuse to make an open/closed claim.
          </p>
        </header>

        <form onSubmit={handleAddHours} className="grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-6 items-end border-b border-border bg-ivory">
          <label className="block lg:col-span-2">
            <span className="block text-xs font-medium text-muted mb-1">Heritage entity</span>
            <select
              value={hEntity}
              onChange={(e) => setHEntity(e.target.value)}
              className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-charcoal"
              required
            >
              <option value="">Select…</option>
              {entities.map((ent) => <option key={ent.id} value={ent.id}>{ent.name}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="block text-xs font-medium text-muted mb-1">Day</span>
            <select value={hDay} onChange={(e) => setHDay(e.target.value)} className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-charcoal">
              {DAY_LABELS.map((d, i) => <option key={d} value={i}>{d}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="block text-xs font-medium text-muted mb-1">Opens</span>
            <input type="time" value={hOpen} onChange={(e) => setHOpen(e.target.value)} disabled={hClosed || h24} className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-charcoal disabled:opacity-50" />
          </label>
          <label className="block">
            <span className="block text-xs font-medium text-muted mb-1">Closes</span>
            <input type="time" value={hClose} onChange={(e) => setHClose(e.target.value)} disabled={hClosed || h24} className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-charcoal disabled:opacity-50" />
          </label>
          <div className="flex items-center gap-3 pb-1">
            <label className="flex items-center gap-1.5 text-xs text-charcoal">
              <input type="checkbox" checked={hClosed} onChange={(e) => { setHClosed(e.target.checked); if (e.target.checked) setH24(false); }} /> Closed
            </label>
            <label className="flex items-center gap-1.5 text-xs text-charcoal">
              <input type="checkbox" checked={h24} onChange={(e) => { setH24(e.target.checked); if (e.target.checked) setHClosed(false); }} /> 24 h
            </label>
          </div>
          <label className="block lg:col-span-3">
            <span className="block text-xs font-medium text-muted mb-1">Special note</span>
            <input type="text" value={hNote} onChange={(e) => setHNote(e.target.value)} placeholder="e.g. Demo hours — not verified" className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-charcoal" />
          </label>
          <label className="block lg:col-span-2">
            <span className="block text-xs font-medium text-muted mb-1">Source URL (http/https)</span>
            <input type="url" value={hUrl} onChange={(e) => setHUrl(e.target.value)} placeholder="https://…" className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-charcoal" />
          </label>
          <button type="submit" disabled={savingHours} className="rounded-lg bg-charcoal px-3 py-2 text-sm font-medium text-white hover:bg-charcoal/90 disabled:opacity-60">
            {savingHours ? "Saving…" : "Add row"}
          </button>
        </form>

        <div className="max-h-80 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="bg-parchment text-[11px] uppercase tracking-wider text-muted">
              <tr>
                <th className="text-left px-5 py-2">Heritage</th>
                <th className="text-left px-3 py-2">Day</th>
                <th className="text-left px-3 py-2">Hours</th>
                <th className="text-left px-3 py-2">Status</th>
                <th className="text-left px-3 py-2">Source</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {hours.map((h) => (
                <tr key={h.id} className="hover:bg-ivory">
                  <td className="px-5 py-2 text-charcoal">{h.heritage_name}</td>
                  <td className="px-3 py-2 text-muted">{DAY_LABELS[h.day_of_week]}</td>
                  <td className="px-3 py-2 text-charcoal">
                    {h.is_closed ? "Closed" : h.is_24_hours ? "24 hours" : `${(h.open_time || "").slice(0, 5)} – ${(h.close_time || "").slice(0, 5)}`}
                  </td>
                  <td className="px-3 py-2">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${SCHEDULE_STATUS_STYLES[h.schedule_status] || "bg-stone-100 text-stone-600"}`}>
                      {h.schedule_status}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-xs text-muted max-w-[180px] truncate">
                    {h.source_url ? (
                      <a href={h.source_url} target="_blank" rel="noopener noreferrer" className="text-terracotta hover:underline inline-flex items-center gap-1">
                        {h.source_type} <ExternalLink className="h-3 w-3" />
                      </a>
                    ) : h.source_type}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      onClick={() => handleDeleteHours(h.id)}
                      aria-label={`Delete ${h.heritage_name} ${DAY_LABELS[h.day_of_week]} schedule`}
                      className="text-muted hover:text-red-600"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
              {hours.length === 0 && (
                <tr><td colSpan={6} className="px-5 py-6 text-sm text-muted">No operating-hours rows yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* ---- Demo places ---- */}
      <section className="rounded-xl border border-border bg-white overflow-hidden">
        <header className="px-5 py-4 border-b border-border bg-parchment">
          <h3 className="font-display text-lg text-charcoal flex items-center gap-2">
            <MapPin className="h-4 w-4 text-terracotta" /> Demo nearby places
            <Badge variant="secondary" className="bg-white text-stone border-cream">
              {placeStats ? `${placeStats.total} rows · ${placeStats.categories} categories` : `${places.length} rows`}
            </Badge>
          </h3>
          <p className="text-xs text-muted mt-0.5">
            Fallback dataset used only when OpenStreetMap returns nothing. No prices, ratings or availability are stored.
            {placeStats && placeStats.verified > 0 && (
              <span className="text-red-600"> Unexpected verified rows: {placeStats.verified}</span>
            )}
          </p>
        </header>

        <form onSubmit={handleAddPlace} className="grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-6 items-end border-b border-border bg-ivory">
          <label className="block lg:col-span-2">
            <span className="block text-xs font-medium text-muted mb-1">Heritage entity</span>
            <select value={pEntity} onChange={(e) => setPEntity(e.target.value)} className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-charcoal" required>
              <option value="">Select…</option>
              {entities.map((ent) => <option key={ent.id} value={ent.id}>{ent.name}</option>)}
            </select>
          </label>
          <label className="block lg:col-span-2">
            <span className="block text-xs font-medium text-muted mb-1">Name</span>
            <input type="text" value={pName} onChange={(e) => setPName(e.target.value)} className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-charcoal" required />
          </label>
          <label className="block">
            <span className="block text-xs font-medium text-muted mb-1">Category</span>
            <select value={pCategory} onChange={(e) => setPCategory(e.target.value)} className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-charcoal">
              {["HOTEL","RESTAURANT","CAFE","PARKING","MUSEUM","ATTRACTION","TRANSPORT","ATM","PHARMACY","HOSPITAL","SHOPPING"].map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </label>
          <button type="submit" disabled={savingPlace} className="rounded-lg bg-charcoal px-3 py-2 text-sm font-medium text-white hover:bg-charcoal/90 disabled:opacity-60">
            {savingPlace ? "Saving…" : "Add place"}
          </button>
          <div className="flex gap-2 lg:col-span-6">
            <input type="number" step="any" value={pLat} onChange={(e) => setPLat(e.target.value)} placeholder="latitude" aria-label="Latitude" className="flex-1 rounded-lg border border-border bg-white px-3 py-2 text-sm text-charcoal" />
            <input type="number" step="any" value={pLon} onChange={(e) => setPLon(e.target.value)} placeholder="longitude" aria-label="Longitude" className="flex-1 rounded-lg border border-border bg-white px-3 py-2 text-sm text-charcoal" />
          </div>
        </form>

        <div className="max-h-80 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="bg-parchment text-[11px] uppercase tracking-wider text-muted">
              <tr>
                <th className="text-left px-5 py-2">Name</th>
                <th className="text-left px-3 py-2">Heritage</th>
                <th className="text-left px-3 py-2">Category</th>
                <th className="text-left px-3 py-2">Coordinates</th>
                <th className="text-left px-3 py-2">Label</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {places.map((p) => (
                <tr key={p.id} className="hover:bg-ivory">
                  <td className="px-5 py-2 text-charcoal">{p.name}</td>
                  <td className="px-3 py-2 text-muted">{p.heritage_name}</td>
                  <td className="px-3 py-2 text-xs text-charcoal">{p.category}</td>
                  <td className="px-3 py-2 text-xs text-muted">{Number(p.latitude).toFixed(4)}, {Number(p.longitude).toFixed(4)}</td>
                  <td className="px-3 py-2">
                    <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[10px] font-semibold text-sky-700">{p.source_type} · {p.verification_status}</span>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button onClick={() => handleDeletePlace(p.id)} aria-label={`Delete ${p.name}`} className="text-muted hover:text-red-600">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
              {places.length === 0 && (
                <tr><td colSpan={6} className="px-5 py-6 text-sm text-muted">No demo places yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

/* ========================================
   Main Admin Page
   ======================================== */

export default function AdminPage() {
  const [authenticated, setAuthenticated] = useState(false);
  const [checking, setChecking] = useState(true);
  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [overviewError, setOverviewError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<AdminTab>("overview");
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [admin, setAdmin] = useState<AdminIdentity | null>(null);
  const [sessionNote, setSessionNote] = useState<string | undefined>(undefined);

  const showToast = (message: string, type: "success" | "error") => setToast({ message, type });

  const fetchOverview = useCallback(async () => {
    setLoading(true);
    setOverviewError(null);
    try {
      const res = await api.requestWithHeaders<{ success: boolean; data: OverviewData }>("/admin/overview", "GET", {});
      if (res.success) setOverview(res.data);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load dashboard data.";
      setOverviewError(message);
      // Session expired or revoked — return to the login screen with context.
      if (/authentication|session|expired|revoked|invalid/i.test(message)) {
        setAuthenticated(false);
        setAdmin(null);
        setSessionNote("Your admin session has ended. Please sign in again.");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  // Check existing session on mount
  useEffect(() => {
    api
      .requestWithHeaders<{ success: boolean; data?: AdminIdentity }>("/admin/auth/me", "GET", {})
      .then((res) => {
        if (res.success && res.data?.role === "admin") {
          setAdmin(res.data);
          setAuthenticated(true);
          fetchOverview();
        }
      })
      .catch((err: Error) => {
        // 403 = signed in as a regular user — explain upfront instead of
        // letting the admin login form fail confusingly after submit.
        if (/admin access/i.test(err.message)) {
          setSessionNote("You are signed in with a regular user account. Sign in with an administrator account to open the portal.");
        }
      })
      .finally(() => setChecking(false));
  }, [fetchOverview]);

  const handleAuth = (identity: AdminIdentity) => {
    setAdmin(identity);
    setSessionNote(undefined);
    setAuthenticated(true);
    fetchOverview();
  };

  const handleLogout = async () => {
    try {
      await api.requestWithHeaders<{ success: boolean }>("/admin/auth/logout", "POST", {});
    } catch { /* ignore */ }
    setAuthenticated(false);
    setAdmin(null);
    setOverview(null);
    setOverviewError(null);
    setActiveTab("overview");
    setSessionNote("You have been signed out.");
  };

  if (checking) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <div className="flex items-center gap-3 text-muted">
          <div className="h-5 w-5 border-2 border-terracotta border-t-transparent rounded-full animate-spin" />
          <span className="text-sm">Checking session...</span>
        </div>
      </main>
    );
  }

  if (!authenticated) return <AdminLogin onAuth={handleAuth} note={sessionNote} />;

  const tabs: { key: AdminTab; label: string; icon: React.ElementType }[] = [
    { key: "overview", label: "Overview", icon: BarChart3 },
    { key: "heritage", label: "Heritage", icon: Landmark },
    { key: "media", label: "Media", icon: Image },
    { key: "locations", label: "Locations", icon: MapPin },
    { key: "sources", label: "Sources", icon: BookOpen },
    { key: "review", label: "Data Review", icon: ShieldCheck },
    { key: "dataops", label: "Data Ops", icon: Database },
    { key: "users", label: "Users", icon: Users },
    { key: "collections", label: "Collections", icon: Layers },
    { key: "periods", label: "Periods", icon: Clock },
  ];

  const activeTabMeta = tabs.find((t) => t.key === activeTab) ?? tabs[0];

  return (
    <div className="flex min-h-screen">
      {/* Sidebar — dedicated admin chrome (lg+); public-site nav never appears here */}
      <aside className="hidden lg:flex w-60 shrink-0 flex-col sticky top-0 h-screen bg-charcoal text-white">
        <div className="flex items-center gap-2.5 px-5 h-16 border-b border-white/10">
          <Shield className="h-5 w-5 text-terracotta shrink-0" />
          <div className="min-w-0">
            <div className="font-display text-base leading-tight">Astrova Admin</div>
            <div className="text-[9px] uppercase tracking-[0.18em] text-white/40">Management Portal</div>
          </div>
        </div>
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto" aria-label="Admin sections">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                aria-current={isActive ? "page" : undefined}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive ? "bg-terracotta text-white shadow-sm" : "text-white/70 hover:text-white hover:bg-white/10"
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" /> {tab.label}
              </button>
            );
          })}
        </nav>
        <div className="p-3 border-t border-white/10">
          <Link
            href="/"
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-white/70 hover:text-white hover:bg-white/10 transition-colors"
          >
            <ExternalLink className="h-4 w-4" /> View public site
          </Link>
        </div>
      </aside>

      {/* Main column */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Topbar */}
        <header className="sticky top-0 z-30 h-16 shrink-0 flex items-center justify-between gap-3 border-b border-black/10 bg-[#f7f4ef]/95 backdrop-blur px-4 sm:px-6">
          <div className="flex items-center gap-3 min-w-0">
            <span className="lg:hidden flex items-center gap-2 font-display text-base text-charcoal">
              <Shield className="h-5 w-5 text-terracotta" /> Astrova Admin
            </span>
            <h1 className="hidden lg:block font-display text-lg text-charcoal truncate">
              {activeTabMeta.label}
            </h1>
          </div>
          <div className="flex items-center gap-2">
            {admin && (
              <span
                className="hidden sm:inline-flex items-center gap-1.5 rounded-full bg-white border border-border px-3 py-1.5 text-xs text-stone max-w-[240px]"
                title={`Signed in as ${admin.name} (${admin.email})`}
              >
                <Shield className="h-3 w-3 text-terracotta shrink-0" />
                <span className="truncate">{admin.email}</span>
              </span>
            )}
            <button
              onClick={() => fetchOverview()}
              title="Refresh dashboard data"
              aria-label="Refresh dashboard data"
              className="p-2 rounded-lg border border-border bg-white text-muted hover:text-charcoal transition-colors"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            </button>
            <button
              onClick={handleLogout}
              className="px-3 py-2 rounded-lg border border-border bg-white text-sm text-muted hover:text-red-600 hover:border-red-300 transition-colors"
            >
              Sign out
            </button>
          </div>
        </header>

        {/* Mobile section nav (<lg) — scrollable pills */}
        <nav className="lg:hidden border-b border-black/10 bg-white/70 overflow-x-auto" aria-label="Admin sections">
          <div className="flex gap-1.5 px-3 py-2 min-w-max">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.key;
              return (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  aria-current={isActive ? "page" : undefined}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                    isActive ? "bg-terracotta text-white" : "bg-parchment text-muted hover:text-charcoal"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" /> {tab.label}
                </button>
              );
            })}
          </div>
        </nav>

        {/* Content */}
        <main className="flex-1 px-4 sm:px-6 lg:px-8 py-6">
          {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

          {activeTab === "overview" && overviewError && !loading && (
            <div
              role="alert"
              className="mb-6 flex items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3"
            >
              <div className="flex items-center gap-2 text-sm text-red-700">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{overviewError}</span>
              </div>
              <button
                onClick={() => fetchOverview()}
                className="text-sm font-medium text-red-700 hover:text-red-900 underline shrink-0"
              >
                Retry
              </button>
            </div>
          )}

          {loading && activeTab === "overview" ? <LoadingState /> : (
            <>
              {activeTab === "overview" && overview && (
                <div className="space-y-8">
                  <div>
                    <h2 className="font-display text-xl text-charcoal mb-1">Dashboard overview</h2>
                    <p className="text-sm text-muted">Live counts from the Astrova database.</p>
                  </div>

                  <OverviewTab overview={overview} />

                  <div>
                    <h3 className="text-xs font-medium uppercase tracking-wider text-muted mb-3">Quick actions</h3>
                    <div className="flex flex-wrap gap-2">
                      {([
                        { tab: "heritage" as AdminTab, label: "Manage heritage", icon: Landmark },
                        { tab: "media" as AdminTab, label: "Upload media", icon: Image },
                        { tab: "users" as AdminTab, label: "Review users", icon: Users },
                        { tab: "collections" as AdminTab, label: "Curate collections", icon: Layers },
                      ]).map((action) => {
                        const Icon = action.icon;
                        return (
                          <button
                            key={action.tab}
                            onClick={() => setActiveTab(action.tab)}
                            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border bg-white text-sm text-stone hover:border-terracotta/40 hover:text-terracotta transition-colors"
                          >
                            <Icon className="h-3.5 w-3.5" /> {action.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
              {activeTab === "heritage" && <HeritageTab showToast={showToast} />}
              {activeTab === "media" && <MediaTab showToast={showToast} />}
              {activeTab === "locations" && <LocationsTab showToast={showToast} />}
              {activeTab === "sources" && <SourcesTab showToast={showToast} />}
              {activeTab === "review" && <ReviewTab showToast={showToast} />}
              {activeTab === "dataops" && <DataOpsTab showToast={showToast} />}
              {activeTab === "users" && <UsersTab showToast={showToast} />}
              {activeTab === "collections" && <CollectionsTab showToast={showToast} />}
              {activeTab === "periods" && <PeriodsTab showToast={showToast} />}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
