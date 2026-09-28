/* ============================================================
   Astrova — Embedding provider (Phase 37 Parts K and J)

   Provider abstraction: the rest of the RAG pipeline only sees the
   EmbeddingProvider interface, so the model can be swapped without
   touching retrieval. The concrete implementation is a LOCAL ONNX model
   (no API key, no proprietary service) executed by transformers.js.

   Verified in this environment:
     model   Xenova/multilingual-e5-small  (quantized q8)
     dims    384  (must match `rag_chunks.embedding vector(384)`)
     load    ~16 s first call (download), embed ~15 ms per text

   multilingual-e5 requires query/passage prefixes — they are applied
   here so ingestion and retrieval stay symmetric.
   ============================================================ */

import * as path from "path";

export const DEFAULT_MODEL = "Xenova/multilingual-e5-small";
export const DEFAULT_DIMENSIONS = 384;
export const DEFAULT_DTYPE = "q8";

export interface EmbeddingProvider {
  readonly model: string;
  readonly dimensions: number;
  readonly dtype: string;
  embed(texts: string[], kind: "query" | "passage"): Promise<number[][]>;
}

export class EmbeddingUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EmbeddingUnavailableError";
  }
}

interface Pipeline {
  (text: string, options: { pooling: string; normalize: boolean }): Promise<{
    data: Float32Array;
    dims: number[];
  }>;
}

let pipelinePromise: Promise<Pipeline> | null = null;
let cachedProvider: EmbeddingProvider | null = null;

export function embeddingModelName(): string {
  return process.env.RAG_EMBEDDING_MODEL || DEFAULT_MODEL;
}

export function embeddingDimensions(): number {
  const raw = Number(process.env.RAG_EMBEDDING_DIMS || DEFAULT_DIMENSIONS);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_DIMENSIONS;
}

/** Keep model downloads inside the workspace (git-ignored). */
function modelCacheDir(): string {
  return path.resolve(__dirname, "../../..", ".model-cache");
}

async function loadPipeline(): Promise<Pipeline> {
  const transformers = await import("@huggingface/transformers");
  const { env, pipeline } = transformers;
  env.allowLocalModels = false;
  env.cacheDir = modelCacheDir();

  return (await pipeline("feature-extraction", embeddingModelName(), {
    dtype: (process.env.RAG_EMBEDDING_DTYPE || DEFAULT_DTYPE) as "q8",
  })) as unknown as Pipeline;
}

class LocalOnnxEmbeddingProvider implements EmbeddingProvider {
  readonly model = embeddingModelName();
  readonly dimensions = embeddingDimensions();
  readonly dtype = process.env.RAG_EMBEDDING_DTYPE || DEFAULT_DTYPE;

  private async extractor(): Promise<Pipeline> {
    if (!pipelinePromise) {
      pipelinePromise = loadPipeline().catch((err) => {
        pipelinePromise = null; // allow a later retry
        throw new EmbeddingUnavailableError(
          `Embedding model could not be loaded: ${(err as Error).message}`
        );
      });
    }
    return pipelinePromise;
  }

  async embed(texts: string[], kind: "query" | "passage"): Promise<number[][]> {
    if (texts.length === 0) return [];
    const extractor = await this.extractor();
    const prefix = kind === "query" ? "query: " : "passage: ";
    const out: number[][] = [];

    for (const text of texts) {
      const vector = await extractor(`${prefix}${text.trim().slice(0, 2000)}`, {
        pooling: "mean",
        normalize: true,
      });
      const dims = vector.dims ?? [1, this.dimensions];
      const size = dims[dims.length - 1];
      if (size !== this.dimensions) {
        throw new EmbeddingUnavailableError(
          `Embedding dimension mismatch: model produced ${size}, database expects ${this.dimensions}. ` +
            `Re-run ingestion after aligning RAG_EMBEDDING_DIMS with rag_chunks.`
        );
      }
      out.push(Array.from(vector.data));
    }
    return out;
  }
}

export function getEmbeddingProvider(): EmbeddingProvider {
  if (!cachedProvider) cachedProvider = new LocalOnnxEmbeddingProvider();
  return cachedProvider;
}

/** Test hook — drops the cached pipeline/provider. */
export function resetEmbeddingProvider(): void {
  pipelinePromise = null;
  cachedProvider = null;
}

/** Serialize a vector for the pgvector text input format. */
export function toVectorLiteral(vector: number[]): string {
  return `[${vector.map((v) => (Number.isFinite(v) ? v : 0)).join(",")}]`;
}

/** Cosine similarity between two normalised vectors. */
export function cosineSimilarity(a: number[], b: number[]): number {
  const len = Math.min(a.length, b.length);
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < len; i += 1) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}
