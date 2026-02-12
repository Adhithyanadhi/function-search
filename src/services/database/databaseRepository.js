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
    this.baseDir = null;
    this.dbPath = null;
    this.prepared = new Map(); // sql -> wrapped stmt
    this.readOnly = false;
  }

  async initialize() {
    await super.initialize();
    logger.debug('[DatabaseRepository] Initialized');
  }

  create(readOnly){
    try{
      return new Database(this.dbPath, {readOnly});
    } catch (e){
      logger.warn("Db initialization failed", e);
      throw e;
    }
  }
    /**
   * Ensure database connection is open (creates file if absent)
   * SYNC: returns the Database instance directly.
   *
   * @param {string} baseDir directory for db.sqlite
   * @returns {import('node-sqlite3-wasm').Database}
   */
  ensureOpen(baseDir, readOnly) {
    this.baseDir = baseDir;
    logger.debug('[DatabaseRepository] is readOnly', readOnly, baseDir);
    if (this.db) return this.db;

    fs.mkdirSync(baseDir, { recursive: true });
    this.dbPath = path.join(baseDir, 'db.sqlite');
    // If db file does NOT exist, create it
    if (!fs.existsSync(this.dbPath)) {
      // Create an empty file so opening in readOnly won't fail
      fs.closeSync(fs.openSync(this.dbPath, 'w'));
    }

    this.db = this.create(readOnly);
    this.readOnly = readOnly;
    if (!this.db) {
      throw new Error('Database open failed');
    }

    // Open file-backed DB (WASM + Node-FS VFS)

    // PRAGMAs tuned for local metadata/indexing workloads
    if (readOnly) {
      try { this.db.exec("PRAGMA query_only = ON;"); } catch {}
      try { this.db.exec("PRAGMA busy_timeout=3000;"); } catch {}
      logger.debug(`[DatabaseRepository] Database opened: ${this.dbPath}`);
      return this.db;
    }

    try {
      this.db.exec("PRAGMA busy_timeout=3000;");
      this.db.exec('PRAGMA foreign_keys=ON;');
      this.db.exec('PRAGMA journal_mode=WAL;');
      this.db.exec('PRAGMA synchronous=NORMAL;'); // use OFF only for one-time bulk loads
      this.db.exec('PRAGMA temp_store=MEMORY;');

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
    if (this.readOnly) { return; }

    const sql = `
      CREATE TABLE IF NOT EXISTS file_cache (
        file_name TEXT PRIMARY KEY,
        inode_modified_at INTEGER,
        last_accessed_at INTEGER,
        functions TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_file_cache_last_accessed ON file_cache(last_accessed_at);

      CREATE TABLE IF NOT EXISTS user_config (
        config_key TEXT PRIMARY KEY,
        config_value TEXT
      );
    `;

    try {
      this.db.exec(sql);
      logger.debug('[DatabaseRepository] createSchema success:');
    } catch (e) {
      logger.error('[DatabaseRepository] createSchema failed:', e);
    }
  }

  getPreparedStatement(sql) {
    if (!this.db) throw new Error('Database not open');

    if (this.prepared.has(sql)) {
      return this.prepared.get(sql);
    }

    const stmt = this.db.prepare(sql);

    const wrapped = {
      run: (...args) => {
        try {
          const info = stmt.run(args);
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
      }
    };

    this.prepared.set(sql, wrapped);
    return wrapped;
  }

  clearPrepared() {
    for (const [sql, stmt] of this.prepared.entries()) {
      try { stmt.finalize(); } catch {}
      this.prepared.delete(sql);
    }
  }

  getTransactionChunkSize(override) {
    let size = Number(override ?? configLoader.get('SQLITE_TXN_CHUNK_SIZE', 200));
    size = Math.trunc(size);
    if (!Number.isFinite(size) || size <= 0) {
      size = 200;
    }
    return size;
  }

  async executeInTransaction(fn) {
    if (!this.db) {throw new Error('Database not open');}
    try {
      this.db.exec('BEGIN;');
      await fn();
      this.db.exec('COMMIT;');
    } catch (e) {
      try { this.db.exec('ROLLBACK;'); } catch {}
      throw e;
    }
  }

  transaction(fn) {
    const chunkSize = this.getTransactionChunkSize();

    return async (...args) => {
      if (!this.db) {throw new Error('Database not open');}

      const chunkTarget = args[0];
      if (!Array.isArray(chunkTarget) || chunkTarget.length <= chunkSize) {
        await this.executeInTransaction(() => fn(...args));
        return;
      }

      for (let i = 0; i < chunkTarget.length; i += chunkSize) {
        const chunkArgs = [...args];
        chunkArgs[0] = chunkTarget.slice(i, i + chunkSize);
        await this.executeInTransaction(() => fn(...chunkArgs));
      }
    };
  }

  run(sql){
    this.db.exec(sql);
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

  deleteDBFile(){ 
    try { 
      fs.unlinkSync(this.dbPath); 
    } catch(e) {
      logger.info("error while deleteDBFILE ", e)
    }
  }

  deleteAllCache(){
    logger.info("deleteAllCache is called with ", this.readOnly)
    try{
      this.deleteDBFile();
      this.db = null;
      this.ensureOpen(this.baseDir, this.readOnly);
      logger.info('[DatabaseRepository] deleteAllCache success:');
    } catch(e){
        logger.error('[DatabaseRepository] deleteAllCache failed:', e);
        return false;
    }
    return true;
  }


  async loadStartupCache(baseDir, windowStartMs) {
      const inodeModifiedAt = new Map();
      const functionIndex = new Map();
      try {
          if (!this.db) this.ensureOpen(baseDir, true);

          const inodeRows = await this.getInodeModifiedAtBatch();
          for (const r of inodeRows) {
              inodeModifiedAt.set(r.file_name, r.inode_modified_at);
          }

          const rows = await this.getRecentFileCache(windowStartMs);
          for (const r of rows) {
              if (r.functions) {
                  try {
                      functionIndex.set(r.file_name, JSON.parse(r.functions));
                  } catch {
                      functionIndex.set(r.file_name, []);
                  }
              }
          }
      } catch (e) {
          logger.error('[Indexer] loadStartupCache failed:', e);
      }
      return { inodeModifiedAt, functionIndex };
  }


  async getRecentFileCache(windowStartMs) {
    const out = [];
    try {
      const rows = await this.db.prepare(
          'SELECT file_name, functions FROM file_cache WHERE last_accessed_at IS NOT NULL AND last_accessed_at >= ?'
      ).all(windowStartMs);
      out.push(...rows);
    } catch (e) {
      logger.error('[SearchFunctionCommand] getRecentFileCache failed:', e);
    }
    return out;
  }

  async getOlderFileCache(windowStartMs, limit, offset) {
    const out = [];
    try {
      const rows = await this.db.prepare(
          `SELECT file_name, functions FROM file_cache WHERE (last_accessed_at IS NULL OR last_accessed_at < ?) ORDER BY last_accessed_at ASC LIMIT ${limit} OFFSET ${offset}`
      ).all(windowStartMs);
      out.push(...rows);
    } catch (e) {
      logger.error('[SearchFunctionCommand] getOlderFileCache failed:', e);
    }
    return out;
  }

async getInodeModifiedAtBatch(limit = 1000) {
  const out = [];
  let stmt = null;
  try {
    limit = Math.trunc(Number(limit));
    if (!Number.isFinite(limit) || limit <= 0) limit = 1000;

    stmt = this.db.prepare(
      'SELECT file_name, inode_modified_at FROM file_cache ' +
      'WHERE inode_modified_at IS NOT NULL ' +
      'ORDER BY file_name ASC LIMIT ? OFFSET ?'
    );

    let offset = 0;
    while (true) {
      const rows = await stmt.all([limit, offset]); // <-- key change
      if (!rows || rows.length === 0) break;

      out.push(...rows);

      if (rows.length < limit) break;
      offset += limit;
    }
  } catch (e) {
    logger.error('[SearchFunctionCommand] getInodeModifiedAtBatch failed:', e);
  } finally {
    try {
      if (stmt) {
        stmt.finalize();
      }
    } catch (e) {
      logger.warn('[SearchFunctionCommand] finalize getInodeModifiedAtBatch stmt failed:', e);
    }
  }
  return out;
}

  async getUserConfig() {
    const out = {};
    try {
      const exists = await this.db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='user_config'")
        .get();
      if (!exists) {
        return out;
      }
      const rows = await this.db
        .prepare('SELECT config_key, config_value FROM user_config')
        .all();
      for (const r of rows) {
        if (!r || !r.config_key) { continue; }
        if (typeof r.config_value === 'string' && r.config_value.length > 0) {
          try {
            out[r.config_key] = JSON.parse(r.config_value);
          } catch {
            out[r.config_key] = r.config_value;
          }
        }
      }
    } catch (e) {
      logger.error('[SearchFunctionCommand] getUserConfig failed:', e);
    }
    return out;
  }


  async lastaccessCachewrite(data) {
    if(data == null || data.length == 0){
      return;
    }
    const upsert =  "INSERT INTO file_cache (file_name, last_accessed_at) VALUES (?, ?) " +
      "ON CONFLICT(file_name) DO UPDATE SET " +
      "  last_accessed_at = MAX(COALESCE(file_cache.last_accessed_at, 0), excluded.last_accessed_at) " 
    ;

    const tx = this.transaction(async (data) => {
      for (const row of data) {
        await this.db.run(upsert, row);
      }
    });

    try {
      await tx(data);
      logger.debug(`[lastAccess] Wrote ${data.length} entries`);
    } catch (e) {
      logger.error('[lastAccess] Failed to write:', e);
      throw e;
    }
  }


  async inodeModifiedAtCachewrite(data) {
    if(data == null || data.length == 0){
      return;
    }
    const upsert =  "INSERT INTO file_cache (file_name, inode_modified_at) VALUES (?, ?) " +
      "ON CONFLICT(file_name) DO UPDATE SET " +
      "  inode_modified_at = MAX(COALESCE(file_cache.inode_modified_at, 0), excluded.inode_modified_at) " 
    ;

    const tx = this.transaction(async (data) => {
      for (const row of data) {
        await this.db.run(upsert, row);
      }
    });

    try {
      await tx(data);
      logger.debug(`[inodeModifiedAt] Wrote ${data.length} entries`);
    } catch (e) {
      logger.error('[inodeModifiedAt] Failed to write:', e);
      throw e;
    }
  }

  async userConfigCachewrite(data) {
    if (!data) {
      return;
    }
    const entries = Array.isArray(data) ? data : Object.entries(data);
    if (entries.length === 0) {
      return;
    }
    const rows = [];
    for (const [key, value] of entries) {
      if (!key) { continue; }
      if (typeof value === 'undefined') { continue; }
      rows.push([key, JSON.stringify(value)]);
    }
    if (rows.length === 0) {
      return;
    }

    const upsert =  "INSERT INTO user_config (config_key, config_value) VALUES (?, ?) " +
      "ON CONFLICT(config_key) DO UPDATE SET " +
      "  config_value = excluded.config_value ";

    const tx = this.transaction(async (rows) => {
      for (const row of rows) {
        await this.db.run(upsert, row);
      }
    });

    try {
      await tx(rows);
      logger.debug(`[userConfig] Wrote ${rows.length} entries`);
    } catch (e) {
      logger.error('[userConfig] Failed to write:', e);
      throw e;
    }
  }



  async functionCachewrite(newData) {
    if(newData == null || newData.length == 0){
      return;
    }

    const upsertFileCache = this.getPreparedStatement(
      'INSERT INTO file_cache (file_name, functions) VALUES (?, ?) ' +
      'ON CONFLICT(file_name) DO UPDATE SET functions = excluded.functions'
    );

    const tx = this.transaction(async (rows) => {
      for (const [filePath, functionsArr] of rows) {
        const functionsObj = Object.create(null);
        for (const fn of functionsArr) functionsObj[fn.name] = fn; // last wins
        const functionsJson = JSON.stringify(functionsObj);

        await upsertFileCache.run(filePath, functionsJson);
      }
    });

    await tx(newData);
  }
}

module.exports = { DatabaseRepository };
