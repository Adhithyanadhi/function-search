// src/services/database/databaseRepository.js
const path = require('path');
const fs = require('fs');
const logger = require('../../utils/logger');
const { BaseService } = require('../core/baseService');
const { configLoader } = require('../../config/configLoader');
const { getSetFromListFunction } = require('../../../src/utils/common')

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

    // Open file-backed DB (WASM + Node-FS VFS)

    // PRAGMAs tuned for local metadata/indexing workloads
    try {
      this.db.exec('PRAGMA foreign_keys=ON;');
      this.db.exec('PRAGMA journal_mode=WAL;');
      this.db.exec('PRAGMA synchronous=NORMAL;'); // use OFF only for one-time bulk loads
      this.db.exec('PRAGMA temp_store=MEMORY;');
      if(readOnly){ this.db.exec("PRAGMA query_only = ON;");}

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
    let writeConn = null;
    if(this.readOnly){
      writeConn = this.create(false);
    } else {
      writeConn = this.db
    }

    const sql = `
      CREATE TABLE IF NOT EXISTS file_cache (
        file_name TEXT PRIMARY KEY,
        inode_modified_at INTEGER,
        last_accessed_at INTEGER,
        functions TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_file_cache_last_accessed ON file_cache(last_accessed_at);
    `;

    try {
      writeConn.exec(sql);
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

  transaction(fn) {
    return async (...args) => {
      if (!this.db) {throw new Error('Database not open');}
      try {
        this.db.exec('BEGIN;');
        await fn(...args);
        this.db.exec('COMMIT;');
      } catch (e) {
        try { this.db.exec('ROLLBACK;'); } catch {}
        throw e;
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
      this.openReadOnly = null;
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
          
          const rows = await this.getRecentFileCache(windowStartMs);
          for (const r of rows) {
              inodeModifiedAt.set(r.file_name, r.inode_modified_at);
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
          'SELECT file_name, inode_modified_at, last_accessed_at, functions FROM file_cache WHERE last_accessed_at IS NOT NULL AND last_accessed_at >= ?'
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
          `SELECT file_name, inode_modified_at, last_accessed_at, functions FROM file_cache WHERE (last_accessed_at IS NULL OR last_accessed_at < ?) ORDER BY last_accessed_at ASC LIMIT ${limit} OFFSET ${offset}`
      ).all(windowStartMs);
      out.push(...rows);
    } catch (e) {
      logger.error('[SearchFunctionCommand] getOlderFileCache failed:', e);
    }
    return out;
  }

  async lastaccessCachewrite(data) {
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



async  functionCachewrite(newData) {
  this.createSchema();

  const upsertFileCache = this.getPreparedStatement(
    'INSERT INTO file_cache (file_name, functions) VALUES (?, ?) ' +
    'ON CONFLICT(file_name) DO UPDATE SET functions = excluded.functions'
  );

  this.db.exec('BEGIN;');
  try {
    for (const [filePath, functionsArr] of newData) {
      const functionsObj = Object.create(null);
      for (const fn of functionsArr) functionsObj[fn.name] = fn; // last wins
      const functionsJson = JSON.stringify(functionsObj);

      await upsertFileCache.run(filePath, functionsJson);
    }
    this.db.exec('COMMIT;');
  } catch (e) {
    this.db.exec('ROLLBACK;');
    throw e;
  }
}



}

module.exports = { DatabaseRepository };
