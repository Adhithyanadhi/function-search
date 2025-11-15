const logger = require('../../utils/logger');
const { CacheWriterStrategy } = require('./cacheWriterStrategy');

/**
 * Last Access Cache Writer
 * entries: Array<[fileName, lastAccessedAt, inodeModifiedAt?]> | Map<fileName, {lastAccessedAt, inodeModifiedAt}>
 */
class LastAccessCacheWriter extends CacheWriterStrategy {
  constructor(repository) {
    super();
    this.repository = repository;
  }

  async write(entries) {
    const upsert = this.repository.getPreparedStatement(
      'INSERT INTO file_cache (fileName, lastAccessedAt, inodeModifiedAt) VALUES (?, ?, ?) ' +
      'ON CONFLICT(fileName) DO UPDATE SET ' +
      '  lastAccessedAt = MAX(file_cache.lastAccessedAt, excluded.lastAccessedAt), ' +
      '  inodeModifiedAt = excluded.inodeModifiedAt'
    );

    const tx = this.repository.transaction(async (normalized) => {
      for (const [fileName, lastAccessedAt, inodeModifiedAt] of normalized) {
        const last = typeof lastAccessedAt === 'number' ? lastAccessedAt : 0;
        const inode = typeof inodeModifiedAt === 'number' ? inodeModifiedAt : null;
        await upsert.run(fileName, last, inode);
      }
    });

    try {
      const normalized = normalizeEntries(entries);
      await tx(normalized);
      logger.debug(`[LastAccessCacheWriter] Wrote ${normalized.length} entries`);
    } catch (e) {
      logger.error('[LastAccessCacheWriter] Failed to write:', e);
      throw e;
    }
  }
}

function normalizeEntries(entries) {
  if (!entries) return [];
  if (entries instanceof Map) {
    const out = [];
    for (const [fileName, obj] of entries) {
      out.push([fileName, obj?.lastAccessedAt ?? 0, obj?.inodeModifiedAt ?? null]);
    }
    return out;
  }
  // assume array of tuples or objects
  return Array.from(entries, (e) => {
    if (Array.isArray(e)) {
      return [e[0], e[1] ?? 0, e[2] ?? null];
    }
    if (e && typeof e === 'object') {
      return [e.fileName, e.lastAccessedAt ?? 0, e.inodeModifiedAt ?? null];
    }
    return [String(e), 0, null];
  });
}

module.exports = { LastAccessCacheWriter };
