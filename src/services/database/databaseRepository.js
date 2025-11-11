const logger = require('../../utils/logger');
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const { BaseService } = require('../core/baseService');
const { configLoader } = require('../../config/configLoader');

/**
 * Database Repository - Repository Pattern Implementation
 * 
 * Encapsulates database operations and provides a clean interface
 * Manages connection lifecycle and prepared statements
 */
class DatabaseRepository extends BaseService {
    constructor(container) {
        super(container);
        this.db = null;
        this.dbPath = '';
        this.preparedStatements = new Map();
    }

    /**
     * Initialize the database repository
     */
    async initialize() {
        await super.initialize();
        logger.debug('[DatabaseRepository] Initialized');
    }

    /**
     * Ensure database connection is open
     * @param {string} baseDir - Base directory for database
     * @returns {Database} Database instance
     */
    ensureOpen(baseDir) {
        if (this.db) {
            return this.db;
        }

        fs.mkdirSync(baseDir, { recursive: true });
        this.dbPath = path.join(baseDir, 'db.sqlite');
        this.db = new Database(this.dbPath, { fileMustExist: false });

        this.setupPragmas();
        this.createTables();
        
        logger.debug(`[DatabaseRepository] Database opened: ${this.dbPath}`);
        return this.db;
    }

    /**
     * Setup database pragmas for optimal performance
     * @private
     */
    setupPragmas() {
        try {
            this.db.pragma(`journal_mode = ${configLoader.get('DATABASE_JOURNAL_MODE', 'WAL')}`);
            this.db.pragma(`synchronous = ${configLoader.get('DATABASE_SYNCHRONOUS', 'NORMAL')}`);
            this.db.pragma('temp_store = MEMORY');
            this.db.pragma(`page_size = ${configLoader.get('DATABASE_PAGE_SIZE', 8192)}`);
            try { 
                this.db.pragma(`mmap_size = ${configLoader.get('DATABASE_MMAP_SIZE', 268435456)}`); 
            } catch {}
        } catch (e) {
            logger.warn('[DatabaseRepository] PRAGMA setup failed:', e);
        }
    }

    /**
     * Create database tables
     * @private
     */
    createTables() {
        this.db.exec(`
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
        `);
    }

    /**
     * Get a prepared statement (with caching)
     * @param {string} sql - SQL query
     * @returns {Statement} Prepared statement
     */
    getPreparedStatement(sql) {
        if (!this.preparedStatements.has(sql)) {
            this.preparedStatements.set(sql, this.db.prepare(sql));
        }
        return this.preparedStatements.get(sql);
    }

    /**
     * Execute a transaction
     * @param {Function} callback - Transaction callback
     * @returns {any} Transaction result
     */
    transaction(callback) {
        const tx = this.db.transaction(callback);
        return tx;
    }

    /**
     * Close the database connection
     */
    async close() {
        if (this.db) {
            try {
                this.db.close();
                this.db = null;
                this.preparedStatements.clear();
                logger.debug('[DatabaseRepository] Database closed');
            } catch (e) {
                logger.error('[DatabaseRepository] Error closing database:', e);
            }
        }
    }

    /**
     * Dispose the service
     */
    async dispose() {
        await this.close();
        await super.dispose();
    }
}

module.exports = { DatabaseRepository };
