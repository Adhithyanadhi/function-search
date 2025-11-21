// src/services/database/databaseRepository.js
const path = require('path');
const fs = require('fs');
const logger = require('../../utils/logger');
const { BaseService } = require('../core/baseService');
const { configLoader } = require('../../config/configLoader');

// WASM SQLite for Node/Electron with a Node-FS VFS (file-backed; no native .node)
// const { Database } = require('node-sqlite3-wasm');
const { Database } = require('node-sqlite3-wasm/dist/node-sqlite3-wasm.js');

/**
 * DatabaseRepository using node-sqlite3-wasm (sync core; promise-wrapped helpers)
 *
 * Public API:
 *  - ensureOpen(baseDir) -> Database (SYNC)
 *  - createSchema()      -> void (SYNC)
 *  - getPreparedStatement(sql) -> { run/get/all/finalize } (Promise-based)
 *  - transaction(fn)     -> (...args) => Promise<void>
 *  - exec(sql)           -> Promise<void> (wrapper; internally sync)
 *  - close()/dispose()
 */
class DatabaseRepository extends BaseService {
  constructor(container) {
    super(container);
    this.db = null;
    this.dbPath = null;
    this.prepared = new Map(); // sql -> wrapped stmt
  }

  async initialize() {
    await super.initialize();
    logger.debug('[DatabaseRepository] Initialized');
  }

  /**
   * Ensure database connection is open (creates file if absent)
   * SYNC: returns the Database instance directly.
   *
   * @param {string} baseDir directory for db.sqlite
   * @returns {import('node-sqlite3-wasm').Database}
   */
  ensureOpen(baseDir, readOnly) {
    logger.debug('[DatabaseRepository] is readOnly', readOnly);
    if (this.db) return this.db;

    fs.mkdirSync(baseDir, { recursive: true });
    this.dbPath = path.join(baseDir, 'db.sqlite');

    // Open file-backed DB (WASM + Node-FS VFS)
    this.db = new Database(this.dbPath, {readOnly});

    // PRAGMAs tuned for local metadata/indexing workloads
    try {
      this.db.exec('PRAGMA foreign_keys=ON;');
      this.db.exec('PRAGMA journal_mode=WAL;');
      this.db.exec('PRAGMA synchronous=NORMAL;'); // use OFF only for one-time bulk loads
      this.db.exec('PRAGMA temp_store=MEMORY;');
      if(readOnly){ db.exec("PRAGMA query_only = ON;");}

      const cacheKB = Number(configLoader.get('SQLITE_CACHE_SIZE_KB', 200 * 1024));
      if (Number.isFinite(cacheKB) && cacheKB > 0) {
        this.db.exec(`PRAGMA cache_size=-${Math.max(1024, cacheKB)};`);
      }

      const mmap = Number(configLoader.get('SQLITE_MMAP_SIZE', 256 * 1024 * 1024));
      if (Number.isFinite(mmap) && mmap > 0) {
        this.db.exec(`PRAGMA mmap_size=${mmap};`);
      }
    } catch (e) {
      logger.warn('[DatabaseRepository] PRAGMA setup failed:', e);
    }

    this.createSchema();
    logger.debug(`[DatabaseRepository] Database opened: ${this.dbPath}`);
    return this.db;
  }

  /**
   * Create schema if missing (SYNC)
   */
  createSchema() {
    if (!this.db) return;

    const sql = `
      CREATE TABLE IF NOT EXISTS file_cache (
        fileName TEXT PRIMARY KEY,
        inodeModifiedAt INTEGER,
        lastAccessedAt INTEGER
      );
      CREATE TABLE IF NOT EXISTS file_functions (
        fileName TEXT PRIMARY KEY REFERENCES file_cache(fileName) ON DELETE CASCADE,
        functions TEXT
      );
      CREATE TABLE IF NOT EXISTS function_names (
        functionName TEXT PRIMARY KEY
      );
      CREATE TABLE IF NOT EXISTS function_occurrences (
        functionName TEXT,
        fileName TEXT,
        PRIMARY KEY (functionName, fileName)
      ) WITHOUT ROWID;

      CREATE INDEX IF NOT EXISTS idx_file_cache_last_accessed ON file_cache(lastAccessedAt);
      CREATE INDEX IF NOT EXISTS idx_function_names_functionName ON function_names(functionName);
      CREATE INDEX IF NOT EXISTS idx_function_occurrences_fileName ON function_occurrences(fileName);
    `;

    try {
      this.db.exec(sql);
    } catch (e) {
      logger.error('[DatabaseRepository] createSchema failed:', e);
    }
  }

  /**
   * Prepare & cache a statement; returns promise-wrapped helpers for compatibility.
   */
  getPreparedStatement(sql) {
    if (this.prepared.has(sql)) return this.prepared.get(sql);

    const stmt = this.db.prepare(sql);
    const wrap = {
      run: (...args) => {
        try {
          const info = stmt.run(...args);
          return Promise.resolve(info);
        } catch (e) {
          return Promise.reject(e);
        }
      },
      get: (...args) => {
        try {
          const row = stmt.get(...args);
          return Promise.resolve(row);
        } catch (e) {
          return Promise.reject(e);
        }
      },
      all: (...args) => {
        try {
          const rows = stmt.all(...args);
          return Promise.resolve(rows);
        } catch (e) {
          return Promise.reject(e);
        }
      },
      finalize: () => {
        try {
          stmt.finalize();
          return Promise.resolve();
        } catch (e) {
          return Promise.reject(e);
        }
      },
      _raw: stmt
    };

    this.prepared.set(sql, wrap);
    return wrap;
  }

  clearPrepared() {
    for (const w of this.prepared.values()) {
      try { w._raw.finalize(); } catch {}
    }
    this.prepared.clear();
  }

  /**
   * Transaction helper (BEGIN/COMMIT/ROLLBACK) with async signature.
   * Usage:
   *   const tx = repo.transaction(async () => { await stmt.run(...); });
   *   await tx();
   */
  transaction(fn) {
    return async (...args) => {
      try {
        this.db.exec('BEGIN IMMEDIATE;');
        await fn(...args);
        this.db.exec('COMMIT;');
      } catch (e) {
        try { this.db.exec('ROLLBACK;'); } catch {}
        throw e;
      }
    };
  }

  async exec(sql) {
    try {
      this.db.exec(sql);
    } catch (e) {
      return Promise.reject(e);
    }
    return Promise.resolve();
  }

  async close() {
    try {
      this.clearPrepared();
      if (this.db) this.db.close();
      this.db = null;
      logger.debug('[DatabaseRepository] Database closed');
    } catch (e) {
      logger.warn('[DatabaseRepository] Error closing DB', e);
    }
  }

  async dispose() {
    await this.close();
    await super.dispose();
  }
}

module.exports = { DatabaseRepository };
