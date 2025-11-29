const logger = require('../../utils/logger');
const { CacheWriterStrategy } = require('./cacheWriterStrategy');

/**
 * Function Index Cache Writer - stores per-file function arrays and a reverse index
 * newData: Map<string filePath, Array<{name:string,line:number,relativeFilePath?:string,...}>>
 */
class FunctionIndexCacheWriter extends CacheWriterStrategy {
  constructor(repository) {
    super();
    this.repository = repository;
  }

  async write(newData) {
    this.repository.functionCachewrite(newData);
  }

}

module.exports = { FunctionIndexCacheWriter };
