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
    // Normalize input to Map
    const map = newData instanceof Map ? newData : new Map(newData || []);

    const upsertFunctions = this.repository.getPreparedStatement(
      'INSERT INTO file_functions (fileName, functions) VALUES (?, ?) ' +
      'ON CONFLICT(fileName) DO UPDATE SET functions = excluded.functions'
    );
    const upsertName = this.repository.getPreparedStatement(
      'INSERT OR IGNORE INTO function_names (functionName) VALUES (?)'
    );
    const upsertFileCache = this.repository.getPreparedStatement(
      'INSERT OR IGNORE INTO file_cache (fileName) VALUES (?)'
    );
    const insertOccurrence = this.repository.getPreparedStatement(
      'INSERT OR IGNORE INTO function_occurrences (functionName, fileName) VALUES (?, ?)'
    );

    // Precompute
    const allFunctionNames = new Set();
    const allFileNames = new Set();
    const fileFunctionPairs = [];

    for (const [filePath, functions] of map) {
      const names = this.extractUniqueFunctionNames(functions);
      allFileNames.add(filePath);
      for (const fn of names) {
        allFunctionNames.add(fn);
        fileFunctionPairs.push([fn, filePath]);
      }
    }

    const tx = this.repository.transaction(async () => {
      console.log("transaction functionindexcache");
      for (const fn of allFileNames) {
        await upsertFileCache.run(fn);
      }
      for (const fn of allFunctionNames) {
        await upsertName.run(fn);
      }
      for (const [filePath, functions] of map) {
        const json = JSON.stringify(functions || []);
        await upsertFunctions.run(filePath, json);
      }
      for (const [fn, filePath] of fileFunctionPairs) {
        await insertOccurrence.run(fn, filePath);
      }
    });

    try {
      logger.debug(`[FunctionIndexCacheWriter] Writing ${map.size} files, ${allFunctionNames.size} unique functions`);
      await tx();
      logger.debug(`[FunctionIndexCacheWriter] Wrote ${map.size} files, ${allFunctionNames.size} unique functions`);
    } catch (e) {
      logger.error('[FunctionIndexCacheWriter] Failed to write:', e);
      throw e;
    }
  }

  extractUniqueFunctionNames(functions) {
    const set = new Set();
    if (Array.isArray(functions)) {
      for (const f of functions) {
        if (f && typeof f.name === 'string' && f.name.length > 0) {
          set.add(f.name);
        }
      }
    }
    return set;
  }
}

module.exports = { FunctionIndexCacheWriter };
