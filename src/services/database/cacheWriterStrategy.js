/**
 * Cache Writer Strategy Interface
 */
class CacheWriterStrategy {
    async write(_data) {
        throw new Error('write() must be implemented by subclass');
    }
}

module.exports = { CacheWriterStrategy };
