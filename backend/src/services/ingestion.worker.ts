/**
 * services/ingestion.worker.ts — BullMQ worker for URA data ingestion
 *
 * Handles scheduled and on-demand URA API data refresh.
 * Tracks ingestion batches in PostgreSQL for audit trail.
 * Invalidates caches after successful ingestion.
 *
 * Queue: 'ura-ingestion'
 * Jobs:
 *   - refresh-all: Full refresh of sales + rental data
 *   - refresh-sales: Sales data only
 *   - refresh-rental: Rental data only
 */
import { Queue, Worker, type Job } from 'bullmq';
import { env } from '../config/env.ts';
import { getRedis } from '../config/redis.ts';
import { getDb } from '../config/database.ts';
import { getPool } from '../config/database.ts';
import { getCache } from './cache-service.ts';
import { ingestionBatches, salesTransactions, rentalTransactions } from '../db/schema.ts';
import type { NewSalesTransaction, NewRentalTransaction } from '../db/schema.ts';
import { eq } from 'drizzle-orm';

const QUEUE_NAME = 'ura-ingestion';

// ── Queue ──

let _queue: Queue | null = null;

export function getIngestionQueue(): Queue {
  if (_queue) return _queue;
  _queue = new Queue(QUEUE_NAME, {
    connection: { url: env.REDIS_URL },
    defaultJobOptions: {
      removeOnComplete: { count: 50 },
      removeOnFail: { count: 20 },
      attempts: 3,
      backoff: { type: 'exponential', delay: 30_000 },
    },
  });
  return _queue;
}

/**
 * Schedule recurring ingestion via cron.
 */
export async function scheduleIngestion(): Promise<void> {
  const queue = getIngestionQueue();
  // Remove existing repeat jobs
  const repeatable = await queue.getRepeatableJobs();
  for (const job of repeatable) {
    await queue.removeRepeatableByKey(job.key);
  }
  // Add cron job
  await queue.add('refresh-all', {}, {
    repeat: { pattern: env.INGESTION_CRON },
  });
  console.log(`[Ingestion] Scheduled: ${env.INGESTION_CRON}`);
}

/**
 * Trigger an immediate ingestion.
 */
export async function triggerIngestion(type: 'refresh-all' | 'refresh-sales' | 'refresh-rental' = 'refresh-all'): Promise<string> {
  const queue = getIngestionQueue();
  const job = await queue.add(type, { triggeredBy: 'manual', timestamp: new Date().toISOString() });
  return job.id || 'unknown';
}

// ── Worker ──

export interface IngestionResult {
  batchId: string;
  salesCount: number;
  rentalCount: number;
  durationMs: number;
}

/**
 * Start the BullMQ worker. Call once at server startup.
 */
export function startIngestionWorker(): Worker {
  const worker = new Worker(QUEUE_NAME, async (job: Job) => {
    console.log(`[Ingestion] Starting job: ${job.name} (id: ${job.id})`);
    const start = Date.now();
    const db = getDb();
    const cache = getCache();

    // Create batch record
    const result = await db.insert(ingestionBatches)
      .values({ startedAt: new Date() })
      .returning({ id: ingestionBatches.id });

    const batch = result[0];
    if (!batch) throw new Error('Failed to create ingestion batch');
    const batchId = batch.id;

    try {
      let salesCount = 0;
      let rentalCount = 0;

      if (job.name === 'refresh-all' || job.name === 'refresh-sales') {
        salesCount = await ingestSales(batchId);
        await job.updateProgress(50);
      }

      if (job.name === 'refresh-all' || job.name === 'refresh-rental') {
        rentalCount = await ingestRental(batchId);
        await job.updateProgress(90);
      }

      const durationMs = Date.now() - start;

      // Update batch record
      await db.update(ingestionBatches)
        .set({
          completedAt: new Date(),
          status: 'completed',
          salesCount,
          rentalCount,
          durationMs,
        })
        .where(eq(ingestionBatches.id, batchId));

      // Invalidate all caches
      await cache.invalidateAll();

      // Refresh materialized views
      try {
        const pool = getPool();
        await pool.query('REFRESH MATERIALIZED VIEW CONCURRENTLY mv_dashboard_by_year');
        await pool.query('REFRESH MATERIALIZED VIEW CONCURRENTLY mv_dashboard_by_district');
        await pool.query('REFRESH MATERIALIZED VIEW CONCURRENTLY mv_project_summary');
      } catch (mvErr) {
        console.warn('[Ingestion] Materialized view refresh failed (may not exist yet):', (mvErr as Error).message);
      }

      console.log(`[Ingestion] Complete: ${salesCount} sales, ${rentalCount} rentals in ${durationMs}ms`);

      return { batchId: batchId, salesCount, rentalCount, durationMs } satisfies IngestionResult;

    } catch (err) {
      const durationMs = Date.now() - start;
      await db.update(ingestionBatches)
        .set({
          completedAt: new Date(),
          status: 'failed',
          error: (err as Error).message,
          durationMs,
        })
        .where(eq(ingestionBatches.id, batchId));

      throw err;
    }
  }, {
    connection: { url: env.REDIS_URL },
    concurrency: env.INGESTION_CONCURRENCY,
  });

  worker.on('completed', (job) => {
    console.log(`[Ingestion] Job ${job.id} completed`);
  });

  worker.on('failed', (job, err) => {
    console.error(`[Ingestion] Job ${job?.id} failed:`, err.message);
  });

  return worker;
}

// ── Ingest functions ──
// These are stubs that demonstrate the DB write pattern.
// In production, they call the URA API (ura-client.ts) and transform data.

async function ingestSales(batchId: string): Promise<number> {
  // TODO: Replace with actual URA API calls from ura-client.ts
  // For now, this shows the Drizzle insert pattern:
  //
  // const projects = await uraGet('/salesMonth'); // from ura-client.ts
  // const records: NewSalesTransaction[] = projects.flatMap(proj =>
  //   proj.transaction.map(tx => ({
  //     project: proj.project,
  //     street: proj.street,
  //     district: `D${tx.district}`,
  //     marketSegment: proj.marketSegment as 'CCR' | 'RCR' | 'OCR',
  //     propertyType: tx.propertyType,
  //     tenure: tx.tenure.includes('Freehold') ? 'Freehold' : 'Leasehold',
  //     areaSqft: String(parseFloat(tx.area) * 10.764),
  //     price: parseInt(tx.price),
  //     psf: String(parseInt(tx.price) / (parseFloat(tx.area) * 10.764)),
  //     floorRange: tx.floorRange.replace(' to ', '-'),
  //     floorMid: Math.round((lo + hi) / 2),
  //     saleType: saleTypeMap[tx.typeOfSale],
  //     contractDate: parsedDate,
  //     year: parsedYear,
  //     quarter: parsedQuarter,
  //     bedrooms: inferredBedrooms,
  //     batchId,
  //   }))
  // );
  //
  // // Upsert in batches of 500 (ON CONFLICT DO NOTHING for dedup)
  // const db = getDb();
  // for (let i = 0; i < records.length; i += 500) {
  //   await db.insert(salesTransactions)
  //     .values(records.slice(i, i + 500))
  //     .onConflictDoNothing({ target: [salesTransactions.project, salesTransactions.contractDate, salesTransactions.price, salesTransactions.areaSqft, salesTransactions.floorRange] });
  // }
  // return records.length;

  console.log(`[Ingestion] Sales ingest stub (batchId: ${batchId})`);
  return 0;
}

async function ingestRental(batchId: string): Promise<number> {
  // TODO: Same pattern as ingestSales but for rental data
  console.log(`[Ingestion] Rental ingest stub (batchId: ${batchId})`);
  return 0;
}
