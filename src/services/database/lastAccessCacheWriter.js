const logger = require('../../utils/logger');
const { CacheWriterStrategy } = require('./cacheWriterStrategy');

/**
 * Last Access Cache Writer - Strategy Pattern Implementation
 */
class LastAccessCacheWriter extends CacheWriterStrategy {
    constructor(repository) {
        super();
        this.repository = repository;
    }

    async write(entries) {
        const tx = this.repository.transaction((pairs) => {
            const stmt = this.repository.getPreparedStatement(
                'INSERT INTO file_cache (fileName, lastAccessedAt) VALUES (?, ?) ON CONFLICT(fileName) DO UPDATE SET lastAccessedAt = MAX(file_cache.lastAccessedAt, excluded.lastAccessedAt)'
            );
            for (const [k, ts] of pairs) {
                stmt.run(k, ts);
            }
        });

        try {
            tx(entries);
            logger.debug(`[LastAccessCacheWriter] Wrote ${entries.length} entries`);
        } catch (e) {
            logger.error('[LastAccessCacheWriter] Failed to write:', e);
            throw e;
        }
    }
}

module.exports = { LastAccessCacheWriter };
