/* ========================================
   Astrova — Admin API Routes
   ========================================
   Admin-only endpoints for heritage management,
   collection editorial, media, locations, users,
   sources, and analytics.
   ======================================== */

import { Router } from "express";
import bcrypt from "bcrypt";
import { requireAdmin } from "../middleware/admin";
import { query } from "../database";
import { requireDatabase } from "../database/helpers";
import { isValidUUID } from "../utils/validation";
import { isValidSlug } from "../utils/slug";
import { generateToken, setAuthCookie, optionalAuth } from "../middleware/auth";
import { adminLoginRateLimit } from "../middleware/rateLimit";
import { uploadMedia, getMediaUrl, deleteMediaFile, extractFilenameFromUrl, getMediaType } from "../utils/upload";

const router = Router();

// ============================================================
// ADMIN LOGIN (before requireAdmin middleware)
// ============================================================

/**
 * POST /api/admin/auth/login
 * Admin username + password authentication.
 */
router.post("/auth/login", adminLoginRateLimit, async (req, res) => {
  try {
    const { username, password } = req.body;

    // Validate input
    if (!username || !password) {
      res.status(400).json({
        success: false,
        error: { code: "VALIDATION_ERROR", message: "Username and password are required." },
      });
      return;
    }

    // Find user by email (username = email for admin); trim + case-insensitive
    const { rows } = await query<{
      id: string;
      name: string;
      email: string;
      role: string;
      password_hash: string;
      token_version: number | string | null;
    }>(
      "SELECT id, name, email, role, password_hash, token_version FROM users WHERE LOWER(email) = LOWER($1)",
      [String(username).trim()]
    );

    if (rows.length === 0) {
      // Generic error — don't reveal whether username exists
      res.status(401).json({
        success: false,
        error: { code: "INVALID_CREDENTIALS", message: "Invalid username or password." },
      });
      return;
    }

    const user = rows[0];

    // Check admin role
    if (user.role !== "admin") {
      res.status(403).json({
        success: false,
        error: { code: "FORBIDDEN", message: "Admin access required." },
      });
      return;
    }

    // Verify password
    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      res.status(401).json({
        success: false,
        error: { code: "INVALID_CREDENTIALS", message: "Invalid username or password." },
      });
      return;
    }

    // Generate JWT with role
    const tokenVersion = Number(user.token_version ?? 0);
    const token = generateToken({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      tokenVersion,
    });

    // Set secure HttpOnly cookie
    setAuthCookie(res, token);

    // Return safe user info
    res.json({
      success: true,
      data: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (err) {
    console.error("[Admin Auth] Login error:", err);
    res.status(500).json({
      success: false,
      error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred." },
    });
  }
});

/**
 * POST /api/admin/auth/logout
 * Admin logout — revokes current session.
 */
router.post("/auth/logout", optionalAuth, async (req, res) => {
  try {
    const user = req.user as { id: string } | undefined;
    if (user?.id) {
      // Increment token version to revoke all tokens for this user
      await query(
        "UPDATE users SET token_version = COALESCE(token_version, 0) + 1 WHERE id = $1",
        [user.id]
      );
    }
    // Clear cookie
    res.cookie("astrova_session", "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 0,
      path: "/",
    });
    res.json({ success: true });
  } catch (err) {
    console.error("[Admin Auth] Logout error:", err);
    res.json({ success: true }); // Still succeed for UX
  }
});

/**
 * GET /api/admin/auth/me
 * Check current admin session.
 */
router.get("/auth/me", optionalAuth, async (req, res) => {
  const user = req.user as { id: string; name: string; email: string; role?: string } | undefined;
  if (!user) {
    res.status(401).json({ success: false, error: { code: "UNAUTHORIZED", message: "Not authenticated." } });
    return;
  }
  if (user.role !== "admin") {
    res.status(403).json({ success: false, error: { code: "FORBIDDEN", message: "Admin access required." } });
    return;
  }
  res.json({ success: true, data: { id: user.id, name: user.name, email: user.email, role: user.role } });
});

// All admin routes below require admin authorization
router.use(requireAdmin);

// ============================================================
// ADMIN OVERVIEW / DASHBOARD
// ============================================================

/**
 * GET /api/admin/overview
 * Dashboard overview with real database counts
 */
router.get("/overview", async (_req, res) => {
  if (!requireDatabase(res)) return;
  try {
    const counts = await Promise.all([
      query("SELECT count(*) FROM heritage_entities"),
      query("SELECT count(*) FROM media"),
      query("SELECT count(*) FROM media WHERE type = 'image'"),
      query("SELECT count(*) FROM media WHERE type = 'video'"),
      query("SELECT count(*) FROM relationships"),
      query("SELECT count(*) FROM collections"),
      query("SELECT count(*) FROM collection_items"),
      query("SELECT count(*) FROM chatbot_knowledge"),
      query("SELECT count(*) FROM supported_states"),
      query("SELECT count(*) FROM historical_periods"),
      query("SELECT count(*) FROM analytics_events"),
      query("SELECT count(*) FROM locations"),
      query("SELECT count(*) FROM sources"),
      query("SELECT count(*) FROM users"),
      query("SELECT count(*) FROM user_favorites"),
    ]);

    res.json({
      success: true,
      data: {
        heritage_entities: parseInt(String(counts[0].rows[0].count)),
        media: parseInt(String(counts[1].rows[0].count)),
        images: parseInt(String(counts[2].rows[0].count)),
        videos: parseInt(String(counts[3].rows[0].count)),
        relationships: parseInt(String(counts[4].rows[0].count)),
        collections: parseInt(String(counts[5].rows[0].count)),
        collection_items: parseInt(String(counts[6].rows[0].count)),
        chatbot_knowledge: parseInt(String(counts[7].rows[0].count)),
        supported_states: parseInt(String(counts[8].rows[0].count)),
        historical_periods: parseInt(String(counts[9].rows[0].count)),
        analytics_events: parseInt(String(counts[10].rows[0].count)),
        locations: parseInt(String(counts[11].rows[0].count)),
        sources: parseInt(String(counts[12].rows[0].count)),
        users: parseInt(String(counts[13].rows[0].count)),
        user_favorites: parseInt(String(counts[14].rows[0].count)),
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: { code: "DATABASE_ERROR", message: "Failed to load overview" } });
  }
});

// ============================================================
// HERITAGE MANAGEMENT
// ============================================================

/**
 * GET /api/admin/heritage
 * List heritage entities with filtering
 */
router.get("/heritage", async (req, res) => {
  if (!requireDatabase(res)) return;
  try {
    const q = (req.query.q as string) || "";
    const category = req.query.category as string | undefined;
    const state = req.query.state as string | undefined;
    const period = req.query.period as string | undefined;

    let sql = `SELECT he.id, he.name, he.slug, he.category, he.description, he.period_id, he.location_id, he.source_id,
      l.state, l.name as location_name,
      hp.name as period_name,
      s.title as source_title
    FROM heritage_entities he
    LEFT JOIN locations l ON he.location_id = l.id
    LEFT JOIN historical_periods hp ON he.period_id = hp.id
    LEFT JOIN sources s ON he.source_id = s.id`;
    const conditions: string[] = [];
    const params: unknown[] = [];
    let idx = 0;

    if (q) { idx++; conditions.push(`(he.name ILIKE $${idx} OR he.description ILIKE $${idx})`); params.push(`%${q}%`); }
    if (category) { idx++; conditions.push(`he.category = $${idx}`); params.push(category); }
    if (state) { idx++; conditions.push(`l.state = $${idx}`); params.push(state); }
    if (period) { idx++; conditions.push(`he.period_id = $${idx}`); params.push(period); }

    if (conditions.length) sql += ` WHERE ${conditions.join(" AND ")}`;
    sql += ` ORDER BY he.name ASC LIMIT 200`;

    const { rows } = await query(sql, params);
    res.json({ success: true, data: rows, total: rows.length });
  } catch (err) {
    res.status(500).json({ success: false, error: { code: "DATABASE_ERROR", message: "Failed to list heritage" } });
  }
});

/**
 * GET /api/admin/heritage/:id
 * Get a single heritage entity with full details
 */
router.get("/heritage/:id", async (req, res) => {
  if (!requireDatabase(res)) return;
  try {
    const id = req.params.id;
    if (!isValidUUID(id)) {
      res.status(400).json({ success: false, error: { code: "INVALID_UUID", message: "Invalid heritage ID" } });
      return;
    }

    const { rows } = await query(
      `SELECT he.*,
        l.name as location_name, l.state, l.latitude, l.longitude,
        hp.name as period_name,
        s.title as source_title, s.source_type, s.verification_status as source_verification
      FROM heritage_entities he
      LEFT JOIN locations l ON he.location_id = l.id
      LEFT JOIN historical_periods hp ON he.period_id = hp.id
      LEFT JOIN sources s ON he.source_id = s.id
      WHERE he.id = $1`,
      [id]
    );

    if (rows.length === 0) {
      res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Heritage entity not found" } });
      return;
    }

    // Also get media
    const { rows: media } = await query(
      "SELECT id, type, url, caption, alt_text, is_primary, display_order FROM media WHERE entity_id = $1 ORDER BY is_primary DESC, display_order ASC",
      [id]
    );

    res.json({ success: true, data: { ...rows[0], media } });
  } catch (err) {
    res.status(500).json({ success: false, error: { code: "DATABASE_ERROR", message: "Failed to get heritage" } });
  }
});

/**
 * POST /api/admin/heritage
 * Create a new heritage entity
 */
router.post("/heritage", async (req, res) => {
  if (!requireDatabase(res)) return;
  try {
    const { name, category, description, period_id, location_id, source_id, slug: explicitSlug } = req.body;

    if (!name || !category) {
      res.status(400).json({ success: false, error: { code: "INVALID_PAYLOAD", message: "name and category are required" } });
      return;
    }

    // BUG-004 fix: honor an explicit slug when provided (consistent with PUT).
    // Normalize it; fall back to name-derived slug when omitted/empty.
    let slug: string;
    if (explicitSlug !== undefined && explicitSlug !== null && String(explicitSlug).trim() !== "") {
      const normalized = String(explicitSlug).toLowerCase().trim().replace(/\s+/g, "-");
      if (!isValidSlug(normalized)) {
        const suggestion = normalized.replace(/[^a-z0-9-]+/g, "-").replace(/-+/g, "-").replace(/^-+|-+$/g, "");
        res.status(400).json({
          success: false,
          error: {
            code: "INVALID_SLUG",
            message: `Slug must be lowercase alphanumeric with hyphens.${suggestion ? ` Suggested: "${suggestion}".` : ""}`,
          },
        });
        return;
      }
      slug = normalized;
    } else {
      slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    }

    // Check duplicate slug
    const { rows: existing } = await query("SELECT id FROM heritage_entities WHERE slug = $1", [slug]);
    if (existing.length > 0) {
      res.status(409).json({ success: false, error: { code: "DUPLICATE_SLUG", message: "A heritage entity with a similar name already exists" } });
      return;
    }

    const { rows } = await query(
      `INSERT INTO heritage_entities (name, slug, category, description, period_id, location_id, source_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id, name, slug`,
      [name, slug, category, description || "", period_id || null, location_id || null, source_id || null]
    );

    res.status(201).json({ success: true, data: rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, error: { code: "DATABASE_ERROR", message: "Failed to create heritage" } });
  }
});

/**
 * PUT /api/admin/heritage/:id
 * Update a heritage entity
 */
router.put("/heritage/:id", async (req, res) => {
  if (!requireDatabase(res)) return;
  try {
    const id = req.params.id;
    if (!isValidUUID(id)) {
      res.status(400).json({ success: false, error: { code: "INVALID_UUID", message: "Invalid heritage ID" } });
      return;
    }
    const { name, category, description, period_id, location_id, source_id } = req.body;

    if (!name || !category) {
      res.status(400).json({ success: false, error: { code: "INVALID_PAYLOAD", message: "name and category are required" } });
      return;
    }

    // Check existence
    const { rows: existing } = await query("SELECT id FROM heritage_entities WHERE id = $1", [id]);
    if (existing.length === 0) {
      res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Heritage entity not found" } });
      return;
    }

    await query(
      `UPDATE heritage_entities SET name=$1, category=$2, description=$3, period_id=$4, location_id=$5, source_id=$6, updated_at=NOW() WHERE id=$7`,
      [name, category, description || "", period_id || null, location_id || null, source_id || null, id]
    );

    res.json({ success: true, message: "Heritage entity updated" });
  } catch (err) {
    res.status(500).json({ success: false, error: { code: "DATABASE_ERROR", message: "Failed to update heritage" } });
  }
});

/**
 * DELETE /api/admin/heritage/:id
 * Delete a heritage entity (cascades to media, relationships, collection_items)
 */
router.delete("/heritage/:id", async (req, res) => {
  if (!requireDatabase(res)) return;
  try {
    const id = req.params.id;
    if (!isValidUUID(id)) {
      res.status(400).json({ success: false, error: { code: "INVALID_UUID", message: "Invalid heritage ID" } });
      return;
    }

    const { rows: existing } = await query("SELECT id, name FROM heritage_entities WHERE id = $1", [id]);
    if (existing.length === 0) {
      res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Heritage entity not found" } });
      return;
    }

    // Delete related records first (manual cascade for safety)
    await query("DELETE FROM collection_items WHERE heritage_entity_id = $1", [id]);
    await query("DELETE FROM user_favorites WHERE heritage_entity_id = $1", [id]);
    await query("DELETE FROM relationships WHERE source_id = $1 OR target_id = $1", [id]);
    await query("DELETE FROM media WHERE entity_id = $1", [id]);
    await query("DELETE FROM heritage_entities WHERE id = $1", [id]);

    res.json({ success: true, message: `Heritage entity "${existing[0].name}" deleted` });
  } catch (err) {
    res.status(500).json({ success: false, error: { code: "DATABASE_ERROR", message: "Failed to delete heritage" } });
  }
});

// ============================================================
// MEDIA MANAGEMENT
// ============================================================

/**
 * GET /api/admin/media
 * List media records with optional entity filter
 */
router.get("/media", async (req, res) => {
  if (!requireDatabase(res)) return;
  try {
    const entityId = req.query.entity_id as string | undefined;
    const type = req.query.type as string | undefined;

    let sql = `SELECT m.*, he.name as entity_name, he.slug as entity_slug
      FROM media m
      LEFT JOIN heritage_entities he ON m.entity_id = he.id`;
    const conditions: string[] = [];
    const params: unknown[] = [];
    let idx = 0;

    if (entityId) { idx++; conditions.push(`m.entity_id = $${idx}`); params.push(entityId); }
    if (type) { idx++; conditions.push(`m.type = $${idx}`); params.push(type); }

    if (conditions.length) sql += ` WHERE ${conditions.join(" AND ")}`;
    sql += ` ORDER BY m.is_primary DESC, m.display_order ASC, m.created_at DESC LIMIT 200`;

    const { rows } = await query(sql, params);
    res.json({ success: true, data: rows, total: rows.length });
  } catch (err) {
    res.status(500).json({ success: false, error: { code: "DATABASE_ERROR", message: "Failed to list media" } });
  }
});

/**
 * POST /api/admin/media
 * Add a new media record to a heritage entity
 */
router.post("/media", async (req, res) => {
  if (!requireDatabase(res)) return;
  try {
    const { entity_id, type, url, caption, alt_text, credit, is_primary, display_order } = req.body;

    if (!entity_id || !type || !url) {
      res.status(400).json({ success: false, error: { code: "INVALID_PAYLOAD", message: "entity_id, type, and url are required" } });
      return;
    }

    if (!isValidUUID(entity_id)) {
      res.status(400).json({ success: false, error: { code: "INVALID_UUID", message: "Invalid entity ID" } });
      return;
    }

    if (!["image", "video", "document", "audio"].includes(type)) {
      res.status(400).json({ success: false, error: { code: "INVALID_TYPE", message: "type must be image, video, document, or audio" } });
      return;
    }

    // Check entity exists
    const { rows: entity } = await query("SELECT id FROM heritage_entities WHERE id = $1", [entity_id]);
    if (entity.length === 0) {
      res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Heritage entity not found" } });
      return;
    }

    // If marking as primary, unset other primary for this entity
    if (is_primary) {
      await query("UPDATE media SET is_primary = false WHERE entity_id = $1", [entity_id]);
    }

    const { rows } = await query(
      `INSERT INTO media (entity_id, type, url, caption, alt_text, credit, is_primary, display_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
      [entity_id, type, url, caption || "", alt_text || "", credit || "", is_primary || false, display_order || 0]
    );

    res.status(201).json({ success: true, data: { id: rows[0].id } });
  } catch (err) {
    res.status(500).json({ success: false, error: { code: "DATABASE_ERROR", message: "Failed to add media" } });
  }
});

/**
 * POST /api/admin/media/upload
 * Upload a local media file and create a media record.
 * Admin-only endpoint with file validation.
 */
router.post("/media/upload", uploadMedia.single("file"), async (req, res) => {
  if (!requireDatabase(res)) return;
  
  // Handle multer errors
  if (!req.file) {
    res.status(400).json({
      success: false,
      error: { code: "NO_FILE", message: "No file uploaded. Please select a file." },
    });
    return;
  }

  try {
    const { entity_id, caption, alt_text, credit, is_primary, display_order } = req.body;
    const file = req.file;

    // Validate entity_id
    if (!entity_id) {
      // Delete uploaded file if no entity_id
      deleteMediaFile(file.filename);
      res.status(400).json({
        success: false,
        error: { code: "INVALID_PAYLOAD", message: "entity_id is required." },
      });
      return;
    }

    if (!isValidUUID(entity_id)) {
      deleteMediaFile(file.filename);
      res.status(400).json({
        success: false,
        error: { code: "INVALID_UUID", message: "Invalid entity ID." },
      });
      return;
    }

    // Check entity exists
    const { rows: entity } = await query("SELECT id FROM heritage_entities WHERE id = $1", [entity_id]);
    if (entity.length === 0) {
      deleteMediaFile(file.filename);
      res.status(404).json({
        success: false,
        error: { code: "NOT_FOUND", message: "Heritage entity not found." },
      });
      return;
    }

    // Generate public URL
    const mediaUrl = getMediaUrl(file.filename);

    // Determine media type from MIME
    const mediaType = getMediaType(file.mimetype);

    // If marking as primary, unset other primary for this entity
    if (is_primary === "true" || is_primary === true) {
      await query("UPDATE media SET is_primary = false WHERE entity_id = $1", [entity_id]);
    }

    // Create media record
    const { rows } = await query(
      `INSERT INTO media (entity_id, type, url, caption, alt_text, credit, is_primary, display_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id, url, type, caption, alt_text, credit, is_primary, display_order`,
      [
        entity_id,
        mediaType,
        mediaUrl,
        caption || "",
        alt_text || file.originalname,
        credit || "",
        is_primary === "true" || is_primary === true,
        parseInt(String(display_order)) || 0,
      ]
    );

    res.status(201).json({
      success: true,
      data: {
        id: rows[0].id,
        url: rows[0].url,
        type: rows[0].type,
        caption: rows[0].caption,
        alt_text: rows[0].alt_text,
        credit: rows[0].credit,
        is_primary: rows[0].is_primary,
        display_order: rows[0].display_order,
        filename: file.filename,
        originalname: file.originalname,
        size: file.size,
        mimetype: file.mimetype,
      },
    });
  } catch (err) {
    // Delete uploaded file on error
    if (req.file) {
      deleteMediaFile(req.file.filename);
    }
    console.error("[Admin Media Upload] Error:", err);
    res.status(500).json({
      success: false,
      error: { code: "UPLOAD_ERROR", message: "Failed to upload media. Please try again." },
    });
  }
});

/**
 * PUT /api/admin/media/:id
 * Update a media record (change type, URL, caption, etc.)
 */
router.put("/media/:id", async (req, res) => {
  if (!requireDatabase(res)) return;
  try {
    const id = req.params.id;
    if (!isValidUUID(id)) {
      res.status(400).json({ success: false, error: { code: "INVALID_UUID", message: "Invalid media ID" } });
      return;
    }

    const { rows: existing } = await query("SELECT id, entity_id FROM media WHERE id = $1", [id]);
    if (existing.length === 0) {
      res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Media record not found" } });
      return;
    }

    const { type, url, caption, alt_text, credit, is_primary, display_order } = req.body;

    if (type && !["image", "video", "document", "audio"].includes(type)) {
      res.status(400).json({ success: false, error: { code: "INVALID_TYPE", message: "Invalid media type" } });
      return;
    }

    // If marking as primary, unset other primary for this entity
    if (is_primary) {
      await query("UPDATE media SET is_primary = false WHERE entity_id = $1 AND id != $2", [existing[0].entity_id, id]);
    }

    await query(
      `UPDATE media SET
        type = COALESCE($1, type),
        url = COALESCE($2, url),
        caption = COALESCE($3, caption),
        alt_text = COALESCE($4, alt_text),
        credit = COALESCE($5, credit),
        is_primary = COALESCE($6, is_primary),
        display_order = COALESCE($7, display_order)
      WHERE id = $8`,
      [type, url, caption, alt_text, credit, is_primary, display_order, id]
    );

    res.json({ success: true, message: "Media updated" });
  } catch (err) {
    res.status(500).json({ success: false, error: { code: "DATABASE_ERROR", message: "Failed to update media" } });
  }
});

/**
 * DELETE /api/admin/media/:id
 * Delete a media record
 */
router.delete("/media/:id", async (req, res) => {
  if (!requireDatabase(res)) return;
  try {
    const id = req.params.id;
    if (!isValidUUID(id)) {
      res.status(400).json({ success: false, error: { code: "INVALID_UUID", message: "Invalid media ID" } });
      return;
    }

    const { rows: existing } = await query<{ id: string; url: string }>("SELECT id, url FROM media WHERE id = $1", [id]);
    if (existing.length === 0) {
      res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Media record not found" } });
      return;
    }

    await query("DELETE FROM media WHERE id = $1", [id]);

    // Remove the physical file for platform-hosted uploads only.
    // extractFilenameFromUrl returns null for external / frontend-asset URLs.
    const uploadedFile = extractFilenameFromUrl(existing[0].url);
    if (uploadedFile) {
      deleteMediaFile(uploadedFile);
    }

    res.json({ success: true, message: "Media deleted" });
  } catch (err) {
    res.status(500).json({ success: false, error: { code: "DATABASE_ERROR", message: "Failed to delete media" } });
  }
});

// ============================================================
// LOCATION MANAGEMENT
// ============================================================

/**
 * GET /api/admin/locations
 * List all locations with optional type filter
 */
router.get("/locations", async (req, res) => {
  if (!requireDatabase(res)) return;
  try {
    const type = req.query.type as string | undefined;
    const q = (req.query.q as string) || "";

    let sql = `SELECT l.*,
      (SELECT count(*) FROM heritage_entities he WHERE he.location_id = l.id)::int as heritage_count
    FROM locations l`;
    const conditions: string[] = [];
    const params: unknown[] = [];
    let idx = 0;

    if (type) { idx++; conditions.push(`l.type = $${idx}`); params.push(type); }
    if (q) { idx++; conditions.push(`(l.name ILIKE $${idx} OR l.state ILIKE $${idx})`); params.push(`%${q}%`); }

    if (conditions.length) sql += ` WHERE ${conditions.join(" AND ")}`;
    sql += ` ORDER BY l.state ASC, l.name ASC LIMIT 200`;

    const { rows } = await query(sql, params);
    res.json({ success: true, data: rows, total: rows.length });
  } catch (err) {
    res.status(500).json({ success: false, error: { code: "DATABASE_ERROR", message: "Failed to list locations" } });
  }
});

/**
 * POST /api/admin/locations
 * Create a new location
 */
router.post("/locations", async (req, res) => {
  if (!requireDatabase(res)) return;
  try {
    const { name, type, description, latitude, longitude, state, parent_id } = req.body;

    if (!name || !type) {
      res.status(400).json({ success: false, error: { code: "INVALID_PAYLOAD", message: "name and type are required" } });
      return;
    }

    const validTypes = ["state", "district", "city", "village", "site"];
    if (!validTypes.includes(type)) {
      res.status(400).json({ success: false, error: { code: "INVALID_TYPE", message: `type must be one of: ${validTypes.join(", ")}` } });
      return;
    }

    // Validate coordinates
    if (latitude !== undefined && latitude !== null) {
      const lat = parseFloat(latitude);
      if (isNaN(lat) || lat < -90 || lat > 90) {
        res.status(400).json({ success: false, error: { code: "INVALID_COORDINATES", message: "Latitude must be between -90 and 90" } });
        return;
      }
    }
    if (longitude !== undefined && longitude !== null) {
      const lng = parseFloat(longitude);
      if (isNaN(lng) || lng < -180 || lng > 180) {
        res.status(400).json({ success: false, error: { code: "INVALID_COORDINATES", message: "Longitude must be between -180 and 180" } });
        return;
      }
    }

    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

    const { rows } = await query(
      `INSERT INTO locations (name, slug, type, description, latitude, longitude, state, parent_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id, name, slug`,
      [name, slug, type, description || "", latitude || null, longitude || null, state || null, parent_id || null]
    );

    res.status(201).json({ success: true, data: rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, error: { code: "DATABASE_ERROR", message: "Failed to create location" } });
  }
});

/**
 * PUT /api/admin/locations/:id
 * Update a location
 */
router.put("/locations/:id", async (req, res) => {
  if (!requireDatabase(res)) return;
  try {
    const id = req.params.id;
    if (!isValidUUID(id)) {
      res.status(400).json({ success: false, error: { code: "INVALID_UUID", message: "Invalid location ID" } });
      return;
    }

    const { rows: existing } = await query("SELECT id FROM locations WHERE id = $1", [id]);
    if (existing.length === 0) {
      res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Location not found" } });
      return;
    }

    const { name, type, description, latitude, longitude, state, parent_id } = req.body;

    // Validate coordinates
    if (latitude !== undefined && latitude !== null) {
      const lat = parseFloat(latitude);
      if (isNaN(lat) || lat < -90 || lat > 90) {
        res.status(400).json({ success: false, error: { code: "INVALID_COORDINATES", message: "Latitude must be between -90 and 90" } });
        return;
      }
    }
    if (longitude !== undefined && longitude !== null) {
      const lng = parseFloat(longitude);
      if (isNaN(lng) || lng < -180 || lng > 180) {
        res.status(400).json({ success: false, error: { code: "INVALID_COORDINATES", message: "Longitude must be between -180 and 180" } });
        return;
      }
    }

    await query(
      `UPDATE locations SET
        name = COALESCE($1, name),
        type = COALESCE($2, type),
        description = COALESCE($3, description),
        latitude = COALESCE($4, latitude),
        longitude = COALESCE($5, longitude),
        state = COALESCE($6, state),
        parent_id = COALESCE($7, parent_id),
        updated_at = NOW()
      WHERE id = $8`,
      [name, type, description, latitude, longitude, state, parent_id, id]
    );

    res.json({ success: true, message: "Location updated" });
  } catch (err) {
    res.status(500).json({ success: false, error: { code: "DATABASE_ERROR", message: "Failed to update location" } });
  }
});

/**
 * DELETE /api/admin/locations/:id
 * Delete a location (only if no heritage entities reference it)
 */
router.delete("/locations/:id", async (req, res) => {
  if (!requireDatabase(res)) return;
  try {
    const id = req.params.id;
    if (!isValidUUID(id)) {
      res.status(400).json({ success: false, error: { code: "INVALID_UUID", message: "Invalid location ID" } });
      return;
    }

    const { rows: existing } = await query("SELECT id, name FROM locations WHERE id = $1", [id]);
    if (existing.length === 0) {
      res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Location not found" } });
      return;
    }

    // Check for referencing heritage entities
    const { rows: refs } = await query("SELECT count(*) FROM heritage_entities WHERE location_id = $1", [id]);
    if (parseInt(String(refs[0].count)) > 0) {
      res.status(409).json({ success: false, error: { code: "IN_USE", message: "Cannot delete: location is used by heritage entities. Reassign them first." } });
      return;
    }

    await query("DELETE FROM locations WHERE id = $1", [id]);
    res.json({ success: true, message: `Location "${existing[0].name}" deleted` });
  } catch (err) {
    res.status(500).json({ success: false, error: { code: "DATABASE_ERROR", message: "Failed to delete location" } });
  }
});

// ============================================================
// SOURCES MANAGEMENT
// ============================================================

/**
 * GET /api/admin/sources
 * List all sources
 */
router.get("/sources", async (req, res) => {
  if (!requireDatabase(res)) return;
  try {
    const q = (req.query.q as string) || "";
    let sql = `SELECT s.*,
      (SELECT count(*) FROM heritage_entities he WHERE he.source_id = s.id)::int as heritage_count
    FROM sources s`;
    const params: unknown[] = [];

    if (q) {
      sql += ` WHERE s.title ILIKE $1 OR s.author ILIKE $1`;
      params.push(`%${q}%`);
    }
    sql += ` ORDER BY s.title ASC LIMIT 200`;

    const { rows } = await query(sql, params);
    res.json({ success: true, data: rows, total: rows.length });
  } catch (err) {
    res.status(500).json({ success: false, error: { code: "DATABASE_ERROR", message: "Failed to list sources" } });
  }
});

/**
 * POST /api/admin/sources
 * Create a new source
 */
router.post("/sources", async (req, res) => {
  if (!requireDatabase(res)) return;
  try {
    const { title, author, url, source_type, verification_status, publisher, publication_date, retrieved_date, notes } = req.body;

    if (!title) {
      res.status(400).json({ success: false, error: { code: "INVALID_PAYLOAD", message: "title is required" } });
      return;
    }

    const { rows } = await query(
      `INSERT INTO sources (title, author, url, source_type, verification_status, publisher, publication_date, retrieved_date, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
      [title, author || null, url || null, source_type || "OTHER", verification_status || "UNVERIFIED", publisher || null, publication_date || null, retrieved_date || null, notes || null]
    );

    res.status(201).json({ success: true, data: { id: rows[0].id } });
  } catch (err) {
    res.status(500).json({ success: false, error: { code: "DATABASE_ERROR", message: "Failed to create source" } });
  }
});

/**
 * PUT /api/admin/sources/:id
 * Update a source
 */
router.put("/sources/:id", async (req, res) => {
  if (!requireDatabase(res)) return;
  try {
    const id = req.params.id;
    if (!isValidUUID(id)) {
      res.status(400).json({ success: false, error: { code: "INVALID_UUID", message: "Invalid source ID" } });
      return;
    }

    const { rows: existing } = await query("SELECT id FROM sources WHERE id = $1", [id]);
    if (existing.length === 0) {
      res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Source not found" } });
      return;
    }

    const { title, author, url, source_type, verification_status, publisher, publication_date, retrieved_date, notes } = req.body;

    await query(
      `UPDATE sources SET
        title = COALESCE($1, title),
        author = COALESCE($2, author),
        url = COALESCE($3, url),
        source_type = COALESCE($4, source_type),
        verification_status = COALESCE($5, verification_status),
        publisher = COALESCE($6, publisher),
        publication_date = COALESCE($7, publication_date),
        retrieved_date = COALESCE($8, retrieved_date),
        notes = COALESCE($9, notes),
        updated_at = NOW()
      WHERE id = $10`,
      [title, author, url, source_type, verification_status, publisher, publication_date, retrieved_date, notes, id]
    );

    res.json({ success: true, message: "Source updated" });
  } catch (err) {
    res.status(500).json({ success: false, error: { code: "DATABASE_ERROR", message: "Failed to update source" } });
  }
});

/**
 * DELETE /api/admin/sources/:id
 * Delete a source (only if no heritage entities reference it)
 */
router.delete("/sources/:id", async (req, res) => {
  if (!requireDatabase(res)) return;
  try {
    const id = req.params.id;
    if (!isValidUUID(id)) {
      res.status(400).json({ success: false, error: { code: "INVALID_UUID", message: "Invalid source ID" } });
      return;
    }

    const { rows: existing } = await query("SELECT id, title FROM sources WHERE id = $1", [id]);
    if (existing.length === 0) {
      res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Source not found" } });
      return;
    }

    // Check for references
    const { rows: refs } = await query("SELECT count(*) FROM heritage_entities WHERE source_id = $1", [id]);
    if (parseInt(String(refs[0].count)) > 0) {
      res.status(409).json({ success: false, error: { code: "IN_USE", message: "Cannot delete: source is used by heritage entities. Unlink them first." } });
      return;
    }

    await query("DELETE FROM sources WHERE id = $1", [id]);
    res.json({ success: true, message: `Source "${existing[0].title}" deleted` });
  } catch (err) {
    res.status(500).json({ success: false, error: { code: "DATABASE_ERROR", message: "Failed to delete source" } });
  }
});

// ============================================================
// USER / ACCOUNT MANAGEMENT
// ============================================================

/**
 * GET /api/admin/users
 * List all users (never expose password_hash)
 */
router.get("/users", async (req, res) => {
  if (!requireDatabase(res)) return;
  try {
    // BUG-007 fix: strict query-parameter allowlist. Unknown params (e.g. the
    // incident-prone "search") are rejected instead of silently ignored, so a
    // mistyped filter can never widen the result set to ALL users.
    const allowedParams = ["q", "limit"];
    const unknown = Object.keys(req.query).filter((k) => !allowedParams.includes(k));
    if (unknown.length > 0) {
      res.status(400).json({
        success: false,
        error: {
          code: "INVALID_QUERY_PARAMETER",
          message: `Unknown query parameter(s): ${unknown.join(", ")}. Allowed: ${allowedParams.join(", ")}.`,
        },
      });
      return;
    }

    const q = (req.query.q as string) || "";
    // Cap listing size; never allow unbounded user listing.
    const maxList = Math.min(Math.max(parseInt(String(req.query.limit ?? "200"), 10) || 200, 1), 500);

    let sql = `SELECT u.id, u.name, u.email, u.created_at, u.updated_at,
      (SELECT count(*) FROM user_favorites uf WHERE uf.user_id = u.id)::int as favorite_count
    FROM users u`;

    const params: unknown[] = [];
    if (q) {
      sql += ` WHERE u.name ILIKE $1 OR u.email ILIKE $1`;
      params.push(`%${q}%`);
    }
    sql += ` ORDER BY u.created_at DESC LIMIT ${maxList}`;

    const { rows } = await query(sql, params);
    res.json({ success: true, data: rows, total: rows.length });
  } catch (err) {
    res.status(500).json({ success: false, error: { code: "DATABASE_ERROR", message: "Failed to list users" } });
  }
});

/**
 * GET /api/admin/users/:id
 * Get a single user with favorites (never expose password_hash)
 */
router.get("/users/:id", async (req, res) => {
  if (!requireDatabase(res)) return;
  try {
    const id = req.params.id;
    if (!isValidUUID(id)) {
      res.status(400).json({ success: false, error: { code: "INVALID_UUID", message: "Invalid user ID" } });
      return;
    }

    const { rows } = await query(
      "SELECT id, name, email, created_at, updated_at FROM users WHERE id = $1",
      [id]
    );

    if (rows.length === 0) {
      res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "User not found" } });
      return;
    }

    // Get user's favorites
    const { rows: favorites } = await query(
      `SELECT uf.id as favorite_id, uf.created_at as favorited_at,
        he.id as heritage_id, he.name, he.slug, he.category
      FROM user_favorites uf
      JOIN heritage_entities he ON uf.heritage_entity_id = he.id
      WHERE uf.user_id = $1`,
      [id]
    );

    res.json({ success: true, data: { ...rows[0], favorites } });
  } catch (err) {
    res.status(500).json({ success: false, error: { code: "DATABASE_ERROR", message: "Failed to get user" } });
  }
});

/**
 * DELETE /api/admin/users/:id
 * Delete a user and their favorites (safe cascade)
 */
router.delete("/users/:id", async (req, res) => {
  if (!requireDatabase(res)) return;
  try {
    const id = req.params.id;
    if (!isValidUUID(id)) {
      res.status(400).json({ success: false, error: { code: "INVALID_UUID", message: "Invalid user ID" } });
      return;
    }

    const { rows: existing } = await query("SELECT id, name, email, role FROM users WHERE id = $1", [id]);
    if (existing.length === 0) {
      res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "User not found" } });
      return;
    }

    // Guard: admins cannot delete their own account (prevents accidental lockout)
    const requester = req.user as { id: string; email: string } | undefined;
    if (requester && requester.id === id) {
      res.status(400).json({
        success: false,
        error: { code: "SELF_DELETE", message: "You cannot delete your own admin account." },
      });
      return;
    }

    // Guard: never remove the last admin (keeps the admin portal reachable)
    if (existing[0].role === "admin") {
      const { rows: adminCount } = await query<{ n: string }>(
        "SELECT COUNT(*)::text AS n FROM users WHERE role = 'admin'"
      );
      if (Number(adminCount[0]?.n ?? 0) <= 1) {
        res.status(400).json({
          success: false,
          error: { code: "LAST_ADMIN", message: "Cannot delete the last remaining admin account." },
        });
        return;
      }
    }

    // BUG-007 fix: require explicit destructive confirmation tied to the exact
    // user identity. Prevents scripted/accidental bulk deletion workflows.
    const confirm = String(req.body?.confirm ?? "");
    const expected = `DELETE:${existing[0].email}`;
    if (confirm !== expected) {
      res.status(400).json({
        success: false,
        error: {
          code: "CONFIRMATION_REQUIRED",
          message: `Destructive action requires explicit confirmation. Send { "confirm": "${expected}" } to delete this user.`,
        },
      });
      return;
    }

    // Delete user's favorites first
    const favResult = await query("DELETE FROM user_favorites WHERE user_id = $1", [id]);
    await query("DELETE FROM users WHERE id = $1", [id]);

    res.json({
      success: true,
      message: `User "${existing[0].name}" (${existing[0].email}) deleted`,
      data: { deleted_user_id: id, favorites_removed: favResult.rowCount ?? 0 },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: { code: "DATABASE_ERROR", message: "Failed to delete user" } });
  }
});

// ============================================================
// COLLECTION MANAGEMENT
// ============================================================

/**
 * GET /api/admin/collections
 * List collections with full details
 */
router.get("/collections", async (_req, res) => {
  if (!requireDatabase(res)) return;
  try {
    const { rows } = await query(`
      SELECT c.*, COUNT(ci.id)::int AS entity_count,
        COALESCE(
          (SELECT m.url FROM media m WHERE m.id = c.hero_media_id LIMIT 1),
          (SELECT m.url FROM collection_items ci2 JOIN media m ON ci2.heritage_entity_id = m.entity_id AND m.is_primary = true WHERE ci2.collection_id = c.id LIMIT 1)
        ) AS hero_image
      FROM collections c
      LEFT JOIN collection_items ci ON c.id = ci.collection_id
      GROUP BY c.id
      ORDER BY c.display_order ASC
    `);
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, error: { code: "DATABASE_ERROR", message: "Failed to list collections" } });
  }
});

/**
 * POST /api/admin/collections
 * Create a new collection
 */
router.post("/collections", async (req, res) => {
  if (!requireDatabase(res)) return;
  try {
    const { name, slug, description, display_order, hero_media_id } = req.body;
    if (!name || !slug) {
      res.status(400).json({ success: false, error: { code: "INVALID_PAYLOAD", message: "name and slug are required" } });
      return;
    }

    // Check duplicate slug
    const { rows: existing } = await query("SELECT id FROM collections WHERE slug = $1", [slug]);
    if (existing.length > 0) {
      res.status(409).json({ success: false, error: { code: "DUPLICATE_SLUG", message: "Collection slug already exists" } });
      return;
    }

    const { rows } = await query(
      `INSERT INTO collections (name, slug, description, display_order, hero_media_id)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [name, slug, description || "", display_order || 0, hero_media_id || null]
    );

    res.status(201).json({ success: true, data: { id: rows[0].id } });
  } catch (err) {
    res.status(500).json({ success: false, error: { code: "DATABASE_ERROR", message: "Failed to create collection" } });
  }
});

/**
 * PUT /api/admin/collections/:id
 * Update a collection
 */
router.put("/collections/:id", async (req, res) => {
  if (!requireDatabase(res)) return;
  try {
    const id = req.params.id;
    if (!isValidUUID(id)) {
      res.status(400).json({ success: false, error: { code: "INVALID_UUID", message: "Invalid collection ID" } });
      return;
    }
    const { name, slug, description, display_order, is_active, hero_media_id } = req.body;

    const { rows: existing } = await query("SELECT id FROM collections WHERE id = $1", [id]);
    if (existing.length === 0) {
      res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Collection not found" } });
      return;
    }

    await query(
      `UPDATE collections SET name=COALESCE($1,name), slug=COALESCE($2,slug),
       description=COALESCE($3,description), display_order=COALESCE($4,display_order),
       is_active=COALESCE($5,is_active), hero_media_id=$6 WHERE id=$7`,
      [name, slug, description, display_order, is_active, hero_media_id || null, id]
    );

    res.json({ success: true, message: "Collection updated" });
  } catch (err) {
    res.status(500).json({ success: false, error: { code: "DATABASE_ERROR", message: "Failed to update collection" } });
  }
});

/**
 * DELETE /api/admin/collections/:id
 * Delete a collection and its items
 */
router.delete("/collections/:id", async (req, res) => {
  if (!requireDatabase(res)) return;
  try {
    const id = req.params.id;
    if (!isValidUUID(id)) {
      res.status(400).json({ success: false, error: { code: "INVALID_UUID", message: "Invalid collection ID" } });
      return;
    }

    const { rows: existing } = await query("SELECT id, name FROM collections WHERE id = $1", [id]);
    if (existing.length === 0) {
      res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Collection not found" } });
      return;
    }

    await query("DELETE FROM collection_items WHERE collection_id = $1", [id]);
    await query("DELETE FROM collections WHERE id = $1", [id]);

    res.json({ success: true, message: `Collection "${existing[0].name}" deleted` });
  } catch (err) {
    res.status(500).json({ success: false, error: { code: "DATABASE_ERROR", message: "Failed to delete collection" } });
  }
});

/**
 * POST /api/admin/collections/:id/items
 * Add heritage entity to collection
 */
router.post("/collections/:id/items", async (req, res) => {
  if (!requireDatabase(res)) return;
  try {
    const collectionId = req.params.id;
    const { heritage_entity_id, display_order } = req.body;

    if (!heritage_entity_id) {
      res.status(400).json({ success: false, error: { code: "INVALID_PAYLOAD", message: "heritage_entity_id is required" } });
      return;
    }

    // Check duplicate
    const { rows: existing } = await query(
      "SELECT id FROM collection_items WHERE collection_id = $1 AND heritage_entity_id = $2",
      [collectionId, heritage_entity_id]
    );
    if (existing.length > 0) {
      res.status(409).json({ success: false, error: { code: "DUPLICATE", message: "Entity already in collection" } });
      return;
    }

    await query(
      `INSERT INTO collection_items (collection_id, heritage_entity_id, display_order)
       VALUES ($1, $2, $3)`,
      [collectionId, heritage_entity_id, display_order || 0]
    );

    res.status(201).json({ success: true, message: "Entity added to collection" });
  } catch (err) {
    res.status(500).json({ success: false, error: { code: "DATABASE_ERROR", message: "Failed to add item" } });
  }
});

/**
 * DELETE /api/admin/collections/:id/items/:itemId
 * Remove entity from collection
 */
router.delete("/collections/:id/items/:itemId", async (req, res) => {
  if (!requireDatabase(res)) return;
  try {
    const { id, itemId } = req.params;
    await query("DELETE FROM collection_items WHERE id = $1 AND collection_id = $2", [itemId, id]);
    res.json({ success: true, message: "Item removed" });
  } catch (err) {
    res.status(500).json({ success: false, error: { code: "DATABASE_ERROR", message: "Failed to remove item" } });
  }
});

// ============================================================
// HISTORICAL PERIODS
// ============================================================

/**
 * GET /api/admin/periods
 * List all historical periods
 */
router.get("/periods", async (_req, res) => {
  if (!requireDatabase(res)) return;
  try {
    const { rows } = await query(
      `SELECT hp.*,
        (SELECT count(*) FROM heritage_entities he WHERE he.period_id = hp.id)::int as heritage_count
      FROM historical_periods hp ORDER BY hp.start_year ASC`
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, error: { code: "DATABASE_ERROR", message: "Failed to list periods" } });
  }
});

/**
 * POST /api/admin/periods
 * Create a new historical period
 */
router.post("/periods", async (req, res) => {
  if (!requireDatabase(res)) return;
  try {
    const { name, start_year, end_year, description } = req.body;
    if (!name || start_year === undefined || start_year === null) {
      res.status(400).json({ success: false, error: { code: "INVALID_PAYLOAD", message: "name and start_year are required" } });
      return;
    }
    const { rows } = await query(
      `INSERT INTO historical_periods (name, start_year, end_year, description)
       VALUES ($1, $2, $3, $4) RETURNING id, name`,
      [name, parseInt(String(start_year)), end_year != null ? parseInt(String(end_year)) : null, description || null]
    );
    res.status(201).json({ success: true, data: rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, error: { code: "DATABASE_ERROR", message: "Failed to create period" } });
  }
});

/**
 * PUT /api/admin/periods/:id
 * Update a historical period
 */
router.put("/periods/:id", async (req, res) => {
  if (!requireDatabase(res)) return;
  try {
    const id = req.params.id;
    if (!isValidUUID(id)) {
      res.status(400).json({ success: false, error: { code: "INVALID_UUID", message: "Invalid period ID" } });
      return;
    }
    const { rows: existing } = await query("SELECT id FROM historical_periods WHERE id = $1", [id]);
    if (existing.length === 0) {
      res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Period not found" } });
      return;
    }
    const { name, start_year, end_year, description } = req.body;
    await query(
      `UPDATE historical_periods SET
        name = COALESCE($1, name),
        start_year = COALESCE($2, start_year),
        end_year = $3,
        description = COALESCE($4, description)
      WHERE id = $5`,
      [name, start_year != null ? parseInt(String(start_year)) : null, end_year != null ? parseInt(String(end_year)) : null, description, id]
    );
    res.json({ success: true, message: "Period updated" });
  } catch (err) {
    res.status(500).json({ success: false, error: { code: "DATABASE_ERROR", message: "Failed to update period" } });
  }
});

/**
 * DELETE /api/admin/periods/:id
 * Delete a period (only if no heritage entities reference it)
 */
router.delete("/periods/:id", async (req, res) => {
  if (!requireDatabase(res)) return;
  try {
    const id = req.params.id;
    if (!isValidUUID(id)) {
      res.status(400).json({ success: false, error: { code: "INVALID_UUID", message: "Invalid period ID" } });
      return;
    }
    const { rows: existing } = await query("SELECT id, name FROM historical_periods WHERE id = $1", [id]);
    if (existing.length === 0) {
      res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Period not found" } });
      return;
    }
    const { rows: refs } = await query("SELECT count(*) FROM heritage_entities WHERE period_id = $1", [id]);
    if (parseInt(String(refs[0].count)) > 0) {
      res.status(409).json({ success: false, error: { code: "IN_USE", message: "Cannot delete: this period is used by heritage entities. Reassign them first." } });
      return;
    }
    await query("DELETE FROM historical_periods WHERE id = $1", [id]);
    res.json({ success: true, message: `Period "${existing[0].name}" deleted` });
  } catch (err) {
    res.status(500).json({ success: false, error: { code: "DATABASE_ERROR", message: "Failed to delete period" } });
  }
});

// ============================================================
// ANALYTICS
// ============================================================

/**
 * GET /api/admin/analytics/overview
 * Analytics overview with aggregation
 */
router.get("/analytics/overview", async (req, res) => {
  if (!requireDatabase(res)) return;
  try {
    const days = parseInt(String(req.query.days || "30")) || 30;
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    const [total, byType, topHeritage, topSearches, topCollections] = await Promise.all([
      query("SELECT count(*) FROM analytics_events WHERE created_at >= $1", [since]),
      query(`SELECT event_type, count(*)::int AS count FROM analytics_events WHERE created_at >= $1 GROUP BY event_type ORDER BY count DESC`, [since]),
      query(`SELECT he.name, he.slug, count(*)::int AS views FROM analytics_events ae JOIN heritage_entities he ON ae.heritage_entity_id = he.id WHERE ae.event_type = 'heritage_view' AND ae.created_at >= $1 GROUP BY he.id, he.name, he.slug ORDER BY views DESC LIMIT 10`, [since]),
      query(`SELECT search_query, count(*)::int AS count FROM analytics_events WHERE event_type = 'search' AND search_query IS NOT NULL AND created_at >= $1 GROUP BY search_query ORDER BY count DESC LIMIT 10`, [since]),
      query(`SELECT c.name, c.slug, count(*)::int AS views FROM analytics_events ae JOIN collections c ON ae.collection_id = c.id WHERE ae.event_type = 'collection_view' AND ae.created_at >= $1 GROUP BY c.id, c.name, c.slug ORDER BY views DESC LIMIT 10`, [since]),
    ]);

    res.json({
      success: true,
      data: {
        total_events: parseInt(String(total.rows[0].count)),
        by_type: byType.rows,
        top_heritage: topHeritage.rows,
        top_searches: topSearches.rows,
        top_collections: topCollections.rows,
        period_days: days,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: { code: "DATABASE_ERROR", message: "Failed to load analytics" } });
  }
});

/**
 * POST /api/admin/analytics/track
 * Record an analytics event (called by frontend)
 */
router.post("/analytics/track", async (req, res) => {
  if (!requireDatabase(res)) return;
  try {
    const { event_type, heritage_entity_id, collection_id, search_query, language, metadata } = req.body;

    if (!event_type) {
      res.status(400).json({ success: false, error: { code: "INVALID_PAYLOAD", message: "event_type is required" } });
      return;
    }

    await query(
      `INSERT INTO analytics_events (event_type, heritage_entity_id, collection_id, search_query, language, metadata)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [event_type, heritage_entity_id || null, collection_id || null, search_query || null, language || null, metadata ? JSON.stringify(metadata) : null]
    );

    res.json({ success: true });
  } catch (err) {
    // Analytics should not fail the request
    res.json({ success: true });
  }
});

export { router as adminRouter };
