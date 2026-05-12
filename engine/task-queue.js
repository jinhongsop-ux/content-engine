/**
 * task-queue.js
 *
 * Runs article generation for a filtered set of keyword rows from KeywordStore.
 * Status is written back to the store (which persists to queue-state.json).
 *
 * Usage:
 *   const queue = new TaskQueue(ctx, store);
 *   await queue.run({ slugs, concurrency, apiConfig });
 */

import fs   from 'fs';
import { join } from 'path';
import { buildPrompt } from './prompt-builder.js';
import { generate }    from './generator.js';
import { clean }       from './cleaner.js';
import { validate }    from './qa.js';
import { writeMeta }   from './meta-writer.js';

export class TaskQueue {
  constructor(ctx, store) {
    this.ctx       = ctx;
    this.store     = store;
    this._listeners = [];
  }

  // ── Run ───────────────────────────────────────────────────────────────────────

  async run(options = {}) {
    const {
      concurrency   = 2,
      onlyFailed    = false,
      slugs         = null,
      apiConfig     = {},
    } = options;

    fs.mkdirSync(this.ctx.outputDir, { recursive: true });

    const rows = this.store.getTaskRows({ slugs, onlyFailed });

    this.emit('queue-start', { total: rows.length });

    const sem = new Semaphore(concurrency);

    await Promise.all(rows.map(async row => {
      await sem.acquire();
      try {
        await this._runOne(row, apiConfig);
      } finally {
        sem.release();
      }
    }));

    this.emit('queue-done', { total: rows.length });
  }

  // ── Single task ───────────────────────────────────────────────────────────────

  async _runOne(row, apiConfig) {
    const slug = row.urlslug;

    this.store.setStatus(slug, 'running');
    this.emit('task-start', { slug, keyword: row.keyword });

    try {
      // 1. Build prompt
      const { systemPrompt, userPrompt } = buildPrompt(this.ctx, row);

      // 2. Generate
      const genResult = await generate(systemPrompt, userPrompt, {
        ...apiConfig,
        apiKey: apiConfig.apiKey || this.ctx.site.apiKey || process.env.ANTHROPIC_API_KEY,
      });

      if (!genResult.complete) {
        throw new Error(genResult.error || 'Generation incomplete — output may be truncated');
      }

      // 3. Clean
      const cleanHtml = clean(genResult.html);

      // 4. QA
      const qaResult = validate(cleanHtml, genResult.meta, this.ctx, row);

      // 5. Write HTML
      fs.writeFileSync(
        join(this.ctx.outputDir, `${slug}.html`),
        cleanHtml,
        'utf-8',
      );

      // 6. Write metadata
      await writeMeta(this.ctx, row, qaResult, genResult.meta);

      // 7. Update status
      const status = qaResult.pass ? 'done' : 'failed';
      const error  = qaResult.pass ? null : qaResult.hardFails.map(f => f.message).join('; ');

      this.store.setStatus(slug, status, {
        qaScore:   qaResult.score,
        wordCount: qaResult.wordCount,
        error,
      });

      this.emit('task-done', {
        slug,
        keyword:   row.keyword,
        status,
        qaScore:   qaResult.score,
        wordCount: qaResult.wordCount,
        error,
      });

    } catch (err) {
      this.store.setStatus(slug, 'failed', { error: err.message });
      this.emit('task-done', { slug, keyword: row.keyword, status: 'failed', error: err.message });
      console.error(`[task-queue] ${slug}: ${err.message}`);
    }
  }

  // ── Event emitter ─────────────────────────────────────────────────────────────

  on(event, fn) {
    this._listeners.push({ event, fn });
    return this;
  }

  emit(event, data) {
    for (const l of this._listeners) {
      if (l.event === event || l.event === '*') l.fn(data);
    }
  }
}

// ─── Semaphore ────────────────────────────────────────────────────────────────

class Semaphore {
  constructor(max) { this.max = max; this.cur = 0; this.q = []; }
  acquire() {
    return new Promise(res => {
      if (this.cur < this.max) { this.cur++; res(); }
      else this.q.push(res);
    });
  }
  release() {
    this.cur--;
    if (this.q.length) { this.cur++; this.q.shift()(); }
  }
}
