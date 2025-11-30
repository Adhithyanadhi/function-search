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
      CREATE INDEX IF NOT EXISTS idx_function_occurrences_functionName ON function_occurrences(functionName);
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

  /**
   * Get candidate file paths for fallback search
   */
  async getCandidateFilePathsForFallback(names, windowStartMs, limit) {
    const inPlaceholders = names.map(() => '?').join(',');
    const candidateFilePathsQuery = `
        SELECT DISTINCT fo.fileName AS filePath
        FROM function_occurrences fo0
        JOIN file_cache fc ON fc.fileName = fo.fileName
        WHERE fo.functionName IN (${inPlaceholders})
          AND (fc.lastAccessedAt IS NULL OR fc.lastAccessedAt < ?)
        LIMIT ?
    `;
    try {
        const rows = this.db.prepare(candidateFilePathsQuery).all(...names, windowStartMs, limit);
        return rows.map(r => r.filePath);
    } catch (e) {
        logger.error('[SearchFunctionCommand] getCandidateFilePathsForFallback failed:', e);
        return [];
    }
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

  async getSelectByFilePath(filePaths) {
    if (!filePaths || filePaths.length === 0) {
      return [];
    }
    const placeholders = filePaths.map(_ => '?').join(',');
    const sql = `
      SELECT fc.fileName, fc.inodeModifiedAt, fc.lastAccessedAt, ff.functions
      FROM file_cache fc
      LEFT JOIN file_functions ff ON ff.fileName = fc.fileName
      WHERE fc.fileName IN (${placeholders})
    `;
    return await this.db.all(sql, filePaths);
  }

  async getFileCache() {
    if (!this.db) throw new Error('Database not open');
    return this.db.all('SELECT fileName, inodeModifiedAt, lastAccessedAt FROM file_cache');
  }

  /**
   * Load startup cache from database
   */
  async loadStartupCache(baseDir, windowStartMs) {
      const inodeModifiedAt = new Map();
      const functionIndex = new Map();
      try {
          const base = baseDir || path.dirname(this.dbPath);
          if (!this.db) this.ensureOpen(base, true);

          const fileCacheRows = await this.getFileCache();
          for (const row of fileCacheRows) {
              inodeModifiedAt.set(row.fileName, row.inodeModifiedAt);
          }

          const filePaths = await this.getRecentFilePaths(base, windowStartMs);
          const rows = await this.getSelectByFilePath(filePaths);
          for (const r of rows) {
              if (r.functions) {
                  try {
                      functionIndex.set(r.fileName, JSON.parse(r.functions));
                  } catch {
                      functionIndex.set(r.fileName, []);
                  }
              }
          }
      } catch (e) {
          logger.error('[Indexer] loadStartupCache failed:', e);
      }
      return { inodeModifiedAt, functionIndex };
  }

  /**
   * Get recent file paths from database
   */
  async getRecentFilePaths(baseDir, windowStartMs) {
      try {
          const rows = this.db.prepare(
              'SELECT fileName FROM file_cache WHERE lastAccessedAt IS NOT NULL AND lastAccessedAt >= ?'
          ).all(windowStartMs);
          return rows.map(r => r.fileName);
      } catch (e) {
          logger.error('[Indexer] getRecentFilePaths failed:', e);
          return [];
      }
  }

  /**
   * Get functions for file from database
   */
  async getFunctionsForFile(fileName) {
      try {
          const row = this.db.prepare('SELECT functions FROM file_functions WHERE fileName = ?').get(fileName);
          if (!row || !row.functions) return [];
          const arr = JSON.parse(row.functions);
          return Array.isArray(arr) ? arr : [];
      } catch (e) {
          logger.error('[Indexer] getFunctionsForFile failed:', e);
          return [];
      }
  }
  /**
   * Get all function names from database
   */
  async getAllFunctionNames() {
    try {
        const rows = this.db.prepare('SELECT functionName FROM function_names').all();
        return rows.map(r => r.functionName);
    } catch (e) {
        logger.error('[Indexer] getAllFunctionNames failed:', e);
        return [];
    }
  }


  async lastaccessCachewrite(data) {
    const upsert =  "INSERT INTO file_cache (fileName, lastAccessedAt) VALUES (?, ?) " +
      "ON CONFLICT(fileName) DO UPDATE SET " +
      "  lastAccessedAt = MAX(COALESCE(file_cache.lastAccessedAt, 0), excluded.lastAccessedAt) " 
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
    const upsert =  "INSERT INTO file_cache (fileName, inodeModifiedAt) VALUES (?, ?) " +
      "ON CONFLICT(fileName) DO UPDATE SET " +
      "  inodeModifiedAt = MAX(COALESCE(file_cache.inodeModifiedAt, 0), excluded.inodeModifiedAt) " 
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


  async functionCachewrite(newData) {
    this.createSchema();
    // Normalize input to Map
    const map = newData instanceof Map ? newData : new Map(newData || []);

    const upsertFunctions = this.getPreparedStatement(
      'INSERT INTO file_functions (fileName, functions) VALUES (?, ?) ' +
      'ON CONFLICT(fileName) DO UPDATE SET functions = excluded.functions'
    );
    const upsertName = this.getPreparedStatement(
      'INSERT OR IGNORE INTO function_names (functionName) VALUES (?)'
    );
    const upsertFileCache = this.getPreparedStatement(
      'INSERT OR IGNORE INTO file_cache (fileName) VALUES (?)'
    );
    const insertOccurrence = this.getPreparedStatement(
      'INSERT OR IGNORE INTO function_occurrences (functionName, fileName) VALUES (?, ?)'
    );

    // Precompute
    const allFunctionNames = new Set();
    const allFileNames = new Set();
    const fileFunctionPairs = [];

    for (const [filePath, functions] of map) {
      const names = getSetFromListFunction(functions);
      allFileNames.add(filePath);
      for (const fn of names) {
        allFunctionNames.add(fn);
        fileFunctionPairs.push([fn, filePath]);
      }
    }


    try {
      logger.debug(`[functionIndex] Writing ${map.size} files, ${allFunctionNames.size} unique functions`);

        this.db.exec('BEGIN;');
        for (const fn of allFileNames) {
          await upsertFileCache.run(fn);
        }
        this.db.exec('COMMIT;');

        this.db.exec('BEGIN;');
        for (const fn of allFunctionNames) {
          await upsertName.run(fn);
        }
        this.db.exec('COMMIT;');

        this.db.exec('BEGIN;');
        for (const [filePath, functions] of map) {
          const json = JSON.stringify(functions || []);
          await upsertFunctions.run(filePath, json);
        }
        this.db.exec('COMMIT;');

        this.db.exec('BEGIN;');
        for (const [fn, filePath] of fileFunctionPairs) {
          await insertOccurrence.run(fn, filePath);
        }
        this.db.exec('COMMIT;');

      logger.debug(`[functionIndex] Wrote ${map.size} files, ${allFunctionNames.size} unique functions`);
    } catch (e) {
      logger.error('[functionIndex] Failed to write:', e);
      throw e;
    }
  } 
}

module.exports = { DatabaseRepository };
