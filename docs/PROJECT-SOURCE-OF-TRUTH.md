# Astrova — Project Source of Truth

> **Last Updated**: September 27, 2026
> **Git Commit**: `dfc48eb` (base checkpoint; the 2026-09-27 second-session changes are committed on top — exact hash in `git log` and in the final push report)
> **Branch**: `main`
> **Remote**: `https://github.com/tirthshah0201/Asrtova.git`
> *Documentation correction: an earlier version of this header listed `ced4709` and the old `Dharohar-AI.git` remote (stale, copied from a previous project name). Corrected here rather than hidden; verified via `git remote -v`.*

---

## A. Project Overview

| Field | Value |
|-------|-------|
| **Name** | Astrova |
| **Former Names** | Dharohar AI, Heritage Atlas |
| **Purpose** | AI-powered multilingual Indian cultural heritage exploration platform |
| **Problem** | Indian cultural heritage knowledge is fragmented across sources, inaccessible to global audiences, and poorly digitized |
| **Solution** | Unified platform for discovering, exploring, and preserving Indian heritage through interactive maps, curated collections, multilingual search, and AI-powered chatbot |
| **Target Users** | Heritage enthusiasts, students, researchers, tourists, cultural organizations |
| **Repository** | `https://github.com/tirthshah0201/Asrtova.git` |

---

## B. Technology Stack

### Frontend
| Technology | Version | Purpose |
|-----------|---------|---------|
| Next.js | 16.3.2 | React framework with App Router |
| React | 19.2.8 | UI library |
| TypeScript | Latest | Type safety |
| Tailwind CSS | v4 | Styling |
| Motion (Framer Motion) | ^13.1.1 | Animations |
| Leaflet | ^1.9.4 | Interactive maps |
| Lucide React | ^1.34.0 | Icons |

### Backend
| Technology | Version | Purpose |
|-----------|---------|---------|
| Express | ^4.21.2 | HTTP server |
| TypeScript | Latest | Type safety |
| pg (node-postgres) | ^8.23.0 | PostgreSQL client |
| jsonwebtoken | ^9.0.3 | JWT authentication |
| bcrypt | ^6.0.0 | Password hashing |
| cookie-parser | ^1.4.7 | Cookie handling |
| cors | ^2.8.5 | Cross-origin requests |
| dotenv | ^16.4.7 | Environment variables |

### Database
| Technology | Purpose |
|-----------|---------|
| Neon PostgreSQL | Serverless PostgreSQL database |
| pgcrypto | UUID generation |

### External Services
| Service | Purpose | Status |
|---------|---------|--------|
| OpenStreetMap | Map tiles | Active |
| Leaflet | Map rendering | Active |
| AI/Chatbot Service | Multilingual chatbot | Under Construction |

---

## C. Complete Architecture

```
User (Browser)
    ↓
Next.js Frontend (App Router)
    ↓
Next.js API Proxy (/api/proxy/*)
    ↓
Express Backend API (/api/*)
    ↓
Middleware (Auth, API Key, Rate Limit, Admin)
    ↓
Route Handlers
    ↓
Database Queries (pg)
    ↓
Neon PostgreSQL
```

### Layer Responsibilities

| Layer | Responsibility |
|-------|---------------|
| **Browser** | User interaction, rendering, state management |
| **Next.js Frontend** | React components, routing, client-side state, API proxy |
| **API Proxy** | Attaches API key server-side, forwards cookies, admin tokens |
| **Express Backend** | Business logic, validation, authentication, authorization |
| **Middleware** | API key validation, JWT verification, rate limiting, admin auth |
| **Route Handlers** | HTTP request/response handling, SQL queries |
| **Neon PostgreSQL** | Persistent data storage |

---

## D. Complete Module List

| Module | Purpose | Frontend | Backend | Database | Status |
|--------|---------|----------|---------|----------|--------|
| Homepage | Landing page with hero, state discovery, featured heritage | `app/page.tsx` | — | — | Complete |
| Heritage Listing | Browse all 74 heritage entities | `app/heritage/page.tsx` | `routes/heritage.ts` | `heritage_entities` | Complete |
| Heritage Detail | Detailed heritage view with story, media, sources | `app/heritage/[id]/page.tsx` | `routes/heritage.ts` | `heritage_entities` | Complete |
| Explore | Map-based heritage discovery | `app/explore/page.tsx` | `routes/heritage.ts` | `locations`, `heritage_entities` | Complete |
| Map | Interactive Leaflet map with markers | `components/map/` | `routes/locations.ts` | `locations` | Complete |
| Search | Full-text heritage search | `app/heritage/page.tsx`, `components/ui/SearchModal.tsx` | `routes/search.ts` | `heritage_entities` (FTS) | Complete |
| Timeline | Historical periods visualization | `app/timeline/page.tsx` | `routes/timeline.ts` | `historical_periods` | Complete |
| Collections | Curated heritage collections | `app/collections/page.tsx` | `routes/collections.ts` | `collections`, `collection_items` | Complete |
| Collection Detail | Individual collection view | `app/collections/[slug]/page.tsx` | `routes/collections.ts` | `collections`, `collection_items` | Complete |
| Authentication | JWT-based user auth | `app/auth/page.tsx` | `routes/auth.ts` | `users` | Complete |
| Favorites | Per-user persistent favorites | `app/favorites/page.tsx` | `routes/favorites.ts` | `user_favorites` | Complete |
| Admin Portal | Content management dashboard | `app/admin/page.tsx` | `routes/admin.ts` | All tables | Complete |
| About | Project information | `app/about/page.tsx` | — | — | Complete |
| AI/Chatbot | Multilingual chatbot | `app/ai/page.tsx` | `routes/ai.ts`, `services/chatbot.ts` | `chatbot_knowledge` | Under Construction |
| Navigation | Navbar + Footer | `components/layout/` | — | — | Complete |

---

## E. Complete API Inventory

### Public APIs (Require X-API-Key)

| Method | Endpoint | Purpose | Input | Output |
|--------|----------|---------|-------|--------|
| GET | `/api/health` | Health check | — | Service status |
| GET | `/api/heritage` | List heritage entities | `?category`, `?state`, `?period`, `?q`, `?sort` | Heritage list |
| GET | `/api/heritage/:id` | Get heritage by UUID or slug | UUID or slug string | Heritage detail with source, location, period, media |
| GET | `/api/heritage/state-counts` | Heritage counts by state | — | State counts |
| GET | `/api/search` | Full-text search | `?q=query` | Search results |
| GET | `/api/search/suggestions` | Search suggestions | `?q=query` | Suggestion list |
| GET | `/api/locations` | List locations | `?type` | Location list |
| GET | `/api/locations/:id` | Get location by UUID/slug | UUID or slug | Location detail |
| GET | `/api/media` | List media records | `?entity_id` | Media list |
| GET | `/api/media/:id` | Get media record | UUID | Media detail |
| GET | `/api/sources` | List sources | — | Source list |
| GET | `/api/sources/:id` | Get source | UUID | Source detail |
| GET | `/api/periods` | List historical periods | — | Period list |
| GET | `/api/timeline` | Timeline data with heritage | — | Periods with heritage |
| GET | `/api/collections` | List collections | — | Collection list |
| GET | `/api/collections/:slug` | Get collection with entities | Slug | Collection + entities |
| GET | `/api/collections/:slug/related` | Related collections | Slug | Related collections |
| GET | `/api/ai/welcome` | AI welcome message | — | Welcome text |

### Auth APIs

| Method | Endpoint | Purpose | Auth Required |
|--------|----------|---------|---------------|
| POST | `/api/auth/register` | Create account | No |
| POST | `/api/auth/login` | Login | No |
| POST | `/api/auth/logout` | Logout | No |
| GET | `/api/auth/me` | Current user | Yes |

### Favorites APIs (All require authentication)

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/favorites` | List user's favorites |
| GET | `/api/favorites/:heritageId/status` | Check favorite status |
| POST | `/api/favorites/:heritageId` | Add favorite |
| DELETE | `/api/favorites/:heritageId` | Remove favorite |
| POST | `/api/favorites/sync` | Sync localStorage to backend |

### Admin APIs (All require X-Admin-Token)

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/admin/overview` | Dashboard statistics |
| GET | `/api/admin/heritage` | List heritage (search/filter) |
| GET | `/api/admin/heritage/:id` | Get heritage detail |
| POST | `/api/admin/heritage` | Create heritage |
| PUT | `/api/admin/heritage/:id` | Update heritage |
| DELETE | `/api/admin/heritage/:id` | Delete heritage |
| GET | `/api/admin/media` | List media |
| POST | `/api/admin/media` | Add media |
| PUT | `/api/admin/media/:id` | Update media |
| DELETE | `/api/admin/media/:id` | Delete media |
| GET | `/api/admin/locations` | List locations |
| POST | `/api/admin/locations` | Create location |
| PUT | `/api/admin/locations/:id` | Update location |
| DELETE | `/api/admin/locations/:id` | Delete location |
| GET | `/api/admin/sources` | List sources |
| POST | `/api/admin/sources` | Create source |
| PUT | `/api/admin/sources/:id` | Update source |
| DELETE | `/api/admin/sources/:id` | Delete source |
| GET | `/api/admin/users` | List users |
| GET | `/api/admin/users/:id` | Get user detail |
| DELETE | `/api/admin/users/:id` | Delete user |
| GET | `/api/admin/collections` | List collections |
| POST | `/api/admin/collections` | Create collection |
| PUT | `/api/admin/collections/:id` | Update collection |
| DELETE | `/api/admin/collections/:id` | Delete collection |
| POST | `/api/admin/collections/:id/items` | Add item to collection |
| DELETE | `/api/admin/collections/:id/items/:itemId` | Remove item |
| GET | `/api/admin/periods` | List periods |
| POST | `/api/admin/periods` | Create period |
| PUT | `/api/admin/periods/:id` | Update period |
| DELETE | `/api/admin/periods/:id` | Delete period |
| GET | `/api/admin/analytics/overview` | Analytics overview |
| POST | `/api/admin/analytics/track` | Track event |

---

## F. Database Documentation

### Database Statistics (Verified via API)

| Table | Count |
|-------|-------|
| heritage_entities | 74 |
| media | 72 (all images, 0 videos) |
| relationships | 49 |
| locations | 54 |
| sources | 18 |
| historical_periods | 9 |
| collections | 7 |
| collection_items | 98 |
| supported_states | 12 |
| chatbot_knowledge | 107 |
| users | 25 |
| user_favorites | 4 |
| analytics_events | 0 |

### Tables

| Table | Purpose | Primary Key | Foreign Keys |
|-------|---------|-------------|-------------|
| `heritage_entities` | Cultural heritage records | `id` (UUID) | `location_id` → locations, `period_id` → historical_periods, `source_id` → sources |
| `locations` | Geographic locations | `id` (UUID) | `parent_id` → locations (self) |
| `historical_periods` | Time periods | `id` (UUID) | — |
| `media` | Images/videos/documents | `id` (UUID) | `entity_id` → heritage_entities, `source_id` → sources |
| `sources` | Reference sources | `id` (UUID) | — |
| `relationships` | Heritage relationships | `id` (UUID) | `source_id` → heritage_entities, `target_id` → heritage_entities |
| `collections` | Curated collections | `id` (UUID) | `hero_media_id` → media |
| `collection_items` | Collection-heritage junction | `id` (UUID) | `collection_id` → collections, `heritage_entity_id` → heritage_entities |
| `supported_states` | Indian states | `id` (UUID) | — |
| `chatbot_knowledge` | Chatbot training data | `id` (UUID) | — |
| `conversations` | Chat sessions | `id` (UUID) | — |
| `conversation_messages` | Chat messages | `id` (UUID) | `conversation_id` → conversations |
| `analytics_events` | Usage analytics | `id` (UUID) | `heritage_entity_id` → heritage_entities, `collection_id` → collections |
| `users` | User accounts | `id` (UUID) | — |
| `user_favorites` | User favorites | `id` (UUID) | `user_id` → users, `heritage_entity_id` → heritage_entities |

---

## G. Authentication & Authorization

### User Authentication Flow

```
Register
  ↓
Password Hashing (bcrypt, 10 rounds)
  ↓
Store in users table
  ↓
Generate JWT (7-day expiry)
  ↓
Set HttpOnly Cookie (astrova_session)
  ↓
Authenticated Request
  ↓
Cookie Parser → Extract Token
  ↓
JWT Verify → Decode User
  ↓
requireAuth Middleware → Attach req.user
  ↓
Route Handler → Use req.user.id
  ↓
User-specific Data Queries
```

### Admin Authentication

```
Admin Request
  ↓
X-Admin-Token Header
  ↓
requireAdmin Middleware
  ↓
Check ADMIN_TOKEN env var exists
  ↓
Timing-safe Comparison (crypto.timingSafeEqual)
  ↓
Authorized → Proceed
  ↓
Unauthorized → 403 Forbidden
```

### Security Features
- HttpOnly cookies (no XSS exposure)
- SameSite: lax
- Secure flag in production
- Timing-safe token comparison
- UUID validation on all ID parameters
- Rate limiting (login: 5/15min, register: 3/hour, favorites: 30/min, chat: 30/min)
- CORS configuration
- Sanitized production errors (no stack traces)
- API key on all public endpoints (server-side only via proxy)

---

## H. Favorites Data Isolation

### Architecture

Favorites are **exclusively per-user** and **require authentication**.

### Data Flow

```
User A (authenticated)
  ↓
POST /api/favorites/:heritageId
  ↓
requireAuth → req.user.id = User A's ID
  ↓
INSERT INTO user_favorites (user_id, heritage_entity_id)
  VALUES (User A's ID, heritage ID)
  ↓
Database enforces user_id ownership
```

### Isolation Guarantees

| Scenario | Behavior |
|----------|----------|
| User A creates favorite | Stored with `user_id = User A` |
| User B views favorites | Sees only `WHERE user_id = User B` |
| User B tries to delete User A's favorite | Returns 404 "Favorite not found" |
| Anonymous user clicks favorite | Login modal shown, no record created |
| User A logs out, User B logs in | User B sees only User B's favorites |
| Frontend sends arbitrary user_id | Backend ignores it, uses JWT-derived ID |

### Backend Enforcement

All favorites routes use `requireAuth` middleware. User ID is derived from JWT token, never from client request body.

---

## I. Admin Architecture

### Admin Sections (8)

| Section | CRUD | Backend Endpoints |
|---------|------|-------------------|
| Dashboard | Read (15 stats) | GET `/api/admin/overview` |
| Heritage | Full CRUD | GET/POST/PUT/DELETE `/api/admin/heritage` |
| Media | Full CRUD | GET/POST/PUT/DELETE `/api/admin/media` |
| Locations | Full CRUD | GET/POST/PUT/DELETE `/api/admin/locations` |
| Sources | Full CRUD | GET/POST/PUT/DELETE `/api/admin/sources` |
| Users | Read, Delete | GET/DELETE `/api/admin/users` |
| Collections | Full CRUD + items | GET/POST/PUT/DELETE `/api/admin/collections` |
| Periods | Full CRUD | GET/POST/PUT/DELETE `/api/admin/periods` |

### Admin Security

| State | Response |
|-------|----------|
| No token | 401 UNAUTHORIZED |
| Wrong token | 403 FORBIDDEN |
| Correct token | 200 OK |

---

## J. Chatbot

**Status: UNDER CONSTRUCTION**

The chatbot infrastructure is preserved:
- Frontend: `app/ai/page.tsx` (shows "Under Construction")
- Backend: `routes/ai.ts`, `services/chatbot.ts`
- Database: `chatbot_knowledge` (107 records), `conversations`, `conversation_messages`
- API: `/api/ai/chat`, `/api/ai/welcome`

The chatbot is intentionally deferred for future development.
