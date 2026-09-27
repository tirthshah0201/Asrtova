/* ========================================
   Astrova — Heritage Routes
   ======================================== */

import { Router } from "express";
import { requireDevelopmentApiKey } from "../middleware/apiKey";
import { validateUUID } from "../middleware/validate";
import { query } from "../database";
import { requireDatabase } from "../database/helpers";
import {
  isOneOf,
  VALID_HERITAGE_CATEGORIES,
} from "../utils/validation";
import { isValidSlug, isUUID } from "../utils/slug";
import { getVisitorIntelligence } from "../services/visitorIntelligence";
import {
  visitorIntelligenceRateLimit,
  nearbyRateLimit,
  visitCostRateLimit,
  enrichmentRateLimit,
} from "../middleware/rateLimit";
import { getNearbyForEntity, isValidEntityId } from "../services/nearby";
import { estimateVisitCost, normalizeCostInput } from "../services/visitCostEstimator";
import { getEnrichment } from "../services/enrichment";

const router = Router();

/**
 * GET /api/heritage
 *
 * List heritage entities, optionally filtered by category.
 * Query params: ?category=monument|craft|festival|etc.
 * Requires: X-API-Key header
 */
router.get("/", requireDevelopmentApiKey, async (req, res) => {
  if (!requireDatabase(res)) return;
  try {
    const category = req.query.category as string | undefined;
    const period = req.query.period as string | undefined;
    const state = req.query.state as string | undefined;
    const q = req.query.q as string | undefined;
    const sortBy = (req.query.sort as string) || "name";
    const sortOrder = (req.query.order as string) || "asc";

    // Pagination (BUG-001 fix): apply SQL-level LIMIT/OFFSET when provided.
    // When no limit is given, all matching rows are returned (backward compatible
    // with the heritage listing page, which filters/sorts the full set client-side).
    const MAX_LIMIT = 200;
    let limit: number | null = null;
    let offset = 0;
    if (req.query.limit !== undefined && String(req.query.limit) !== "") {
      const parsed = Number(req.query.limit);
      if (!Number.isInteger(parsed) || parsed < 1) {
        res.status(400).json({
          success: false,
          error: {
            code: "INVALID_QUERY_PARAMETER",
            message: "limit must be a positive integer.",
          },
        });
        return;
      }
      limit = Math.min(parsed, MAX_LIMIT);
    }
    if (req.query.offset !== undefined && String(req.query.offset) !== "") {
      const parsedOffset = Number(req.query.offset);
      if (!Number.isInteger(parsedOffset) || parsedOffset < 0) {
        res.status(400).json({
          success: false,
          error: {
            code: "INVALID_QUERY_PARAMETER",
            message: "offset must be a non-negative integer.",
          },
        });
        return;
      }
      offset = parsedOffset;
    }

    if (category && !isOneOf(category, VALID_HERITAGE_CATEGORIES)) {
      res.status(400).json({
        success: false,
        error: {
          code: "INVALID_QUERY_PARAMETER",
          message: `Invalid category parameter. Allowed values: ${VALID_HERITAGE_CATEGORIES.join(", ")}`,
        },
      });
      return;
    }

    let sql = `SELECT he.id, he.name, he.slug, he.category, he.description, he.location_id, he.period_id, he.image_url, he.created_at,
      json_build_object(
        'id', s.id, 'title', s.title, 'publisher', s.publisher, 'url', s.url,
        'source_type', s.source_type, 'verification_status', s.verification_status
      ) as source,
      CASE WHEN l.id IS NOT NULL THEN json_build_object(
        'id', l.id, 'name', l.name, 'state', l.state
      ) ELSE NULL END as location,
      CASE WHEN hp.id IS NOT NULL THEN json_build_object(
        'id', hp.id, 'name', hp.name, 'start_year', hp.start_year, 'end_year', hp.end_year
      ) ELSE NULL END as period
      FROM heritage_entities he
      LEFT JOIN sources s ON he.source_id = s.id
      LEFT JOIN locations l ON he.location_id = l.id
      LEFT JOIN historical_periods hp ON he.period_id = hp.id`;
    const conditions: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 0;

    if (category) {
      paramIndex++;
      conditions.push(`he.category = $${paramIndex}`);
      params.push(category);
    }

    if (period) {
      paramIndex++;
      conditions.push(`hp.id = $${paramIndex}`);
      params.push(period);
    }

    if (state) {
      paramIndex++;
      conditions.push(`l.state = $${paramIndex}`);
      params.push(state);
    }

    if (q && q.trim()) {
      paramIndex++;
      conditions.push(`(he.name ILIKE $${paramIndex} OR he.description ILIKE $${paramIndex} OR he.category ILIKE $${paramIndex})`);
      params.push(`%${q.trim()}%`);
    }

    if (conditions.length > 0) {
      sql += ` WHERE ${conditions.join(' AND ')}`;
    }

    // Sorting
    let orderClause = "he.name ASC";
    switch (sortBy) {
      case "name-desc":
        orderClause = "he.name DESC";
        break;
      case "state":
        orderClause = "COALESCE(l.state, 'zzz') ASC, he.name ASC";
        break;
      case "category":
        orderClause = "he.category ASC, he.name ASC";
        break;
      case "name":
      default:
        orderClause = sortOrder === "desc" ? "he.name DESC" : "he.name ASC";
        break;
    }
    sql += ` ORDER BY ${orderClause}`;

    // SQL-level pagination + total count (single round-trip window function)
    if (limit !== null) {
      sql += ` LIMIT ${limit} OFFSET ${offset}`;
    }

    const { rows } = await query(sql, params);

    // total reflects the full filtered set (ignoring limit/offset) when paginating
    let total = rows.length;
    if (limit !== null) {
      const countSql = `SELECT COUNT(*)::int AS count FROM heritage_entities he
        LEFT JOIN locations l ON he.location_id = l.id
        LEFT JOIN historical_periods hp ON he.period_id = hp.id
        ${conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : ""}`;
      const { rows: countRows } = await query(countSql, params);
      total = Number(countRows[0]?.count ?? 0);
    }

    res.json({
      success: true,
      data: rows,
      total,
      ...(limit !== null ? { limit, offset } : {}),
    });
  } catch (err) {
    console.error("[Heritage] Query error:", (err as Error).message);
    res.status(500).json({
      success: false,
      error: {
        code: "DATABASE_ERROR",
        message: "Failed to retrieve heritage entities",
      },
    });
  }
});

/**
 * GET /api/heritage/state-counts
 *
 * Returns heritage entity counts grouped by state.
 * Must be defined BEFORE /:id to avoid route conflict.
 */
router.get("/state-counts", requireDevelopmentApiKey, async (_req, res) => {
  if (!requireDatabase(res)) return;
  try {
    const { rows } = await query(`
      SELECT l.state, COUNT(DISTINCT he.id)::int AS heritage_count
      FROM heritage_entities he
      JOIN locations l ON he.location_id = l.id
      WHERE l.state IS NOT NULL
      GROUP BY l.state
      ORDER BY heritage_count DESC
    `);

    res.json({
      success: true,
      data: rows,
    });
  } catch (err) {
    console.error("[Heritage] State counts error:", (err as Error).message);
    res.status(500).json({
      success: false,
      error: {
        code: "DATABASE_ERROR",
        message: "Failed to retrieve state counts",
      },
    });
  }
});

/**
 * GET /api/heritage/:id/visitor-intelligence
 *
 * Returns short-lived, source-attributed weather and air-quality data for a
 * heritage entity with valid coordinates. External failures are isolated from
 * the heritage detail endpoint and may return stale cached provider data.
 */
router.get(
  "/:id/visitor-intelligence",
  requireDevelopmentApiKey,
  visitorIntelligenceRateLimit,
  async (req, res) => {
    if (!requireDatabase(res)) return;
    try {
      const identifier = String(req.params.id);
      const data = await getVisitorIntelligence(identifier);
      if (!data) {
        res.status(404).json({
          success: false,
          error: {
            code: "HERITAGE_NOT_FOUND",
            message: "Heritage entity not found.",
          },
        });
        return;
      }
      res.json({ success: true, data });
    } catch (err) {
      console.error("[Visitor Intelligence] Error:", (err as Error).message);
      res.status(502).json({
        success: false,
        error: {
          code: "VISITOR_INTELLIGENCE_UNAVAILABLE",
          message: "Live visitor conditions are temporarily unavailable.",
        },
      });
    }
  }
);

/**
 * GET /api/heritage/:id/nearby
 *
 * Nearby heritage (Astrova's own coordinates) plus nearby places and stays
 * from OpenStreetMap. Provider failures degrade to an explicit unavailable
 * state while Astrova's own nearby heritage stays available.
 */
router.get(
  "/:id/nearby",
  requireDevelopmentApiKey,
  nearbyRateLimit,
  async (req, res) => {
    if (!requireDatabase(res)) return;
    try {
      const identifier = String(req.params.id);
      const result = await getNearbyForEntity(identifier);
      if (!result.found) {
        res.status(404).json({
          success: false,
          error: { code: "HERITAGE_NOT_FOUND", message: "Heritage entity not found." },
        });
        return;
      }
      res.json({
        success: true,
        data: {
          entity: result.entity,
          availability: result.availability,
          nearby: result.data,
        },
      });
    } catch (err) {
      console.error("[Nearby] Error:", (err as Error).message);
      res.status(502).json({
        success: false,
        error: {
          code: "NEARBY_UNAVAILABLE",
          message: "Nearby information is temporarily unavailable.",
        },
      });
    }
  }
);

/**
 * GET /api/heritage/:id/visit-cost
 *
 * Transparent, model-based visit cost estimate. Never claims official fees.
 * Query params: visitors, durationHours, transport, food, stay, guide, parking, misc.
 */
router.get(
  "/:id/visit-cost",
  requireDevelopmentApiKey,
  visitCostRateLimit,
  async (req, res) => {
    if (!requireDatabase(res)) return;
    try {
      const identifier = String(req.params.id);
      if (!isValidEntityId(identifier)) {
        res.status(404).json({
          success: false,
          error: { code: "HERITAGE_NOT_FOUND", message: "Heritage entity not found." },
        });
        return;
      }
      const lookup = isValidSlug(identifier) && !isUUID(identifier) ? "slug" : "id";
      const { rows } = await query<{ id: string }>(
        `SELECT id FROM heritage_entities WHERE ${lookup} = $1`,
        [identifier]
      );
      if (rows.length === 0) {
        res.status(404).json({
          success: false,
          error: { code: "HERITAGE_NOT_FOUND", message: "Heritage entity not found." },
        });
        return;
      }
      const estimate = estimateVisitCost(normalizeCostInput(req.query as Record<string, unknown>));
      res.json({
        success: true,
        data: { heritageId: rows[0].id, estimate },
      });
    } catch (err) {
      console.error("[Visit Cost] Error:", (err as Error).message);
      res.status(500).json({
        success: false,
        error: {
          code: "VISIT_COST_UNAVAILABLE",
          message: "Cost estimation is temporarily unavailable.",
        },
      });
    }
  }
);

/**
 * GET /api/heritage/:id/enrichment
 *
 * Trusted-source enrichment (Feature H, PARTIAL): extracts candidate facts
 * from Wikidata, normalizes them, and runs duplicate/conflict detection.
 * Never writes to Astrova data — proposals stay pending human review.
 */
router.get(
  "/:id/enrichment",
  requireDevelopmentApiKey,
  enrichmentRateLimit,
  async (req, res) => {
    if (!requireDatabase(res)) return;
    try {
      const identifier = String(req.params.id);
      if (!isValidEntityId(identifier)) {
        res.status(404).json({
          success: false,
          error: { code: "HERITAGE_NOT_FOUND", message: "Heritage entity not found." },
        });
        return;
      }
      const lookup = isValidSlug(identifier) && !isUUID(identifier) ? "slug" : "id";
      const { rows } = await query<{
        id: string;
        name: string;
        slug: string;
        latitude: number | string | null;
        longitude: number | string | null;
      }>(
        // No wikidata_id column exists yet (schema unchanged this phase);
        // duplicate detection therefore relies on name/coordinate matching.
        `SELECT he.id, he.name, he.slug, l.latitude, l.longitude
         FROM heritage_entities he
         LEFT JOIN locations l ON he.location_id = l.id
         WHERE he.${lookup} = $1`,
        [identifier]
      );
      if (rows.length === 0) {
        res.status(404).json({
          success: false,
          error: { code: "HERITAGE_NOT_FOUND", message: "Heritage entity not found." },
        });
        return;
      }
      const row = rows[0];
      const result = await getEnrichment({
        name: row.name,
        slug: row.slug,
        wikidataId: null,
        latitude: row.latitude == null ? null : Number(row.latitude),
        longitude: row.longitude == null ? null : Number(row.longitude),
      });
      res.json({ success: true, data: result });
    } catch (err) {
      console.error("[Enrichment] Error:", (err as Error).message);
      res.status(502).json({
        success: false,
        error: {
          code: "ENRICHMENT_UNAVAILABLE",
          message: "External references are temporarily unavailable.",
        },
      });
    }
  }
);

/**
 * GET /api/heritage/:id
 *
 * Get a single heritage entity by UUID or slug.
 * Requires: X-API-Key header
 * Accepts: UUID or slug string
 */
router.get(
  "/:id",
  requireDevelopmentApiKey,
  async (req, res) => {
    if (!requireDatabase(res)) return;
    try {
      const identifier = String(req.params.id);
      let sql: string;
      let params: unknown[];

      const baseSelect = `he.id, he.name, he.slug, he.category, he.description, he.location_id, he.period_id, he.image_url, he.created_at,
          json_build_object(
            'id', s.id, 'title', s.title, 'publisher', s.publisher, 'author', s.author,
            'url', s.url, 'source_type', s.source_type, 'verification_status', s.verification_status,
            'publication_date', s.publication_date, 'retrieved_date', s.retrieved_date
          ) as source,
          CASE WHEN l.id IS NOT NULL THEN json_build_object(
            'id', l.id, 'name', l.name, 'slug', l.slug, 'type', l.type,
            'latitude', l.latitude, 'longitude', l.longitude, 'state', l.state
          ) ELSE NULL END as location,
          CASE WHEN hp.id IS NOT NULL THEN json_build_object(
            'id', hp.id, 'name', hp.name, 'start_year', hp.start_year, 'end_year', hp.end_year, 'description', hp.description
          ) ELSE NULL END as period`;

      if (isUUID(identifier)) {
        // UUID lookup
        sql = `SELECT ${baseSelect}
          FROM heritage_entities he
          LEFT JOIN sources s ON he.source_id = s.id
          LEFT JOIN locations l ON he.location_id = l.id
          LEFT JOIN historical_periods hp ON he.period_id = hp.id
          WHERE he.id = $1`;
        params = [identifier];
      } else if (isValidSlug(identifier)) {
        // Slug lookup
        sql = `SELECT ${baseSelect}
          FROM heritage_entities he
          LEFT JOIN sources s ON he.source_id = s.id
          LEFT JOIN locations l ON he.location_id = l.id
          LEFT JOIN historical_periods hp ON he.period_id = hp.id
          WHERE he.slug = $1`;
        params = [identifier];
      } else {
        res.status(400).json({
          success: false,
          error: {
            code: "INVALID_IDENTIFIER",
            message: "Invalid heritage identifier. Provide a valid UUID or slug.",
          },
        });
        return;
      }

      const { rows } = await query(sql, params);

      if (rows.length === 0) {
        res.status(404).json({
          success: false,
          error: {
            code: "NOT_FOUND",
            message: "Heritage entity not found",
          },
        });
        return;
      }

      const heritage = rows[0];

      // Fetch media for this entity
      const mediaSql = `
        SELECT m.id, m.entity_id, m.type, m.url, m.caption, m.alt_text,
               m.credit, m.display_order, m.is_primary, m.verification_status
        FROM media m
        WHERE m.entity_id = $1
        ORDER BY m.is_primary DESC, m.display_order ASC, m.created_at DESC
      `;
      const { rows: mediaRows } = await query(mediaSql, [heritage.id]);

      // Fetch related heritage from relationships table
      const relatedSql = `
        SELECT DISTINCT ON (he.id) he.id, he.name, he.slug, he.category,
          r.type as relationship_type, r.description as relationship_description
        FROM relationships r
        JOIN heritage_entities he ON (
          (r.source_id = $1 AND he.id = r.target_id) OR
          (r.target_id = $1 AND he.id = r.source_id)
        )
        WHERE r.source_id = $1 OR r.target_id = $1
        ORDER BY he.id, r.type
        LIMIT 6
      `;
      const { rows: relatedRows } = await query(relatedSql, [heritage.id]);

      res.json({
        success: true,
        data: {
          ...heritage,
          media: mediaRows,
          related: relatedRows,
        },
      });
    } catch (err) {
      console.error("[Heritage] Query error:", (err as Error).message);
      res.status(500).json({
        success: false,
        error: {
          code: "DATABASE_ERROR",
          message: "Failed to retrieve heritage entity",
        },
      });
    }});

export { router as heritageRouter };
