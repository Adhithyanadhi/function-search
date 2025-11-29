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
    this.repository.lastaccessCachewrite(entries);
  }
}


module.exports = { LastAccessCacheWriter };
