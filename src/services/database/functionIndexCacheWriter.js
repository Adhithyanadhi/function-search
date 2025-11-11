const logger = require('../../utils/logger');
const { CacheWriterStrategy } = require('./cacheWriterStrategy');

/**
 * Function Index Cache Writer - Strategy Pattern Implementation
 */
class FunctionIndexCacheWriter extends CacheWriterStrategy {
    constructor(repository) {
        super();
        this.repository = repository;
    }

    async write(newData) {
        // Prepare statements outside transaction for better performance
        const upsertFunctions = this.repository.getPreparedStatement(
            'INSERT INTO file_functions (fileName, functions) VALUES (?, ?) ON CONFLICT(fileName) DO UPDATE SET functions = excluded.functions'
        );
        const upsertName = this.repository.getPreparedStatement(
            'INSERT OR IGNORE INTO function_names (functionName) VALUES (?)'
        );
        const insertOccurrence = this.repository.getPreparedStatement(
            'INSERT OR IGNORE INTO function_occurrences (functionName, fileName) VALUES (?, ?)'
        );

        // Collect all unique function names for batch processing
        const allFunctionNames = new Set();
        const fileFunctionPairs = [];

        for (const [filePath, functions] of newData) {
            const functionNames = this.extractUniqueFunctionNames(functions);
            for (const functionName of functionNames) {
                allFunctionNames.add(functionName);
                fileFunctionPairs.push([functionName, filePath]);
            }
        }

        const tx = this.repository.transaction((functionsMapInner) => {
            // Batch insert all function names
            for (const functionName of allFunctionNames) {
                upsertName.run(functionName);
            }

            // Process each file's functions
            for (const [filePath, functions] of functionsMapInner) {
                const json = JSON.stringify(functions || []);
                upsertFunctions.run(filePath, json);
            }

            // Batch insert all function-file occurrences
            for (const [functionName, fileName] of fileFunctionPairs) {
                insertOccurrence.run(functionName, fileName);
            }
        });

        try {
            tx(newData);
            logger.debug(`[FunctionIndexCacheWriter] Wrote ${newData.length} files, ${allFunctionNames.size} unique functions`);
        } catch (e) {
            logger.error('[FunctionIndexCacheWriter] Failed to write:', e);
            throw e;
        }
    }

    /**
     * Extract unique function names from functions array
     * @private
     */
    extractUniqueFunctionNames(functions) {
        const set = new Set();
        if (Array.isArray(functions)) {
            for (const f of functions) {
                if (f && f.name && f.name.length > 0) {
                    set.add(f.name);
                }
            }
        }
        return set;
    }
}

module.exports = { FunctionIndexCacheWriter };
