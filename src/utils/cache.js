const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class SubtitleCache {
  constructor(cacheDir = path.join(__dirname, '../../cache'), maxMemoryItems = 1000, maxDiskAgeDays = 30) {
    this.cacheDir = cacheDir;
    this.maxMemoryItems = maxMemoryItems;
    this.maxDiskAgeMs = maxDiskAgeDays * 24 * 60 * 60 * 1000;
    this.memoryCache = new Map();

    if (!fs.existsSync(this.cacheDir)) {
      try {
        fs.mkdirSync(this.cacheDir, { recursive: true });
      } catch (err) {
        console.error('Erro ao criar diretório de cache:', err.message);
      }
    }

    // Executa limpeza periódica do cache a cada 12 horas sem prender o event loop do Node
    this.runGarbageCollection();
    const gcInterval = setInterval(() => this.runGarbageCollection(), 12 * 60 * 60 * 1000);
    if (gcInterval && typeof gcInterval.unref === 'function') {
      gcInterval.unref();
    }
  }

  getHashKey(key) {
    return crypto.createHash('sha256').update(key).digest('hex');
  }

  getFilePath(hashKey) {
    return path.join(this.cacheDir, `${hashKey}.vtt`);
  }

  get(key) {
    const hash = this.getHashKey(key);

    // 1. Memória RAM (instantâneo ~1ms)
    if (this.memoryCache.has(hash)) {
      return this.memoryCache.get(hash);
    }

    // 2. Disco
    const filePath = this.getFilePath(hash);
    if (fs.existsSync(filePath)) {
      try {
        const content = fs.readFileSync(filePath, 'utf-8');
        this.setMemory(hash, content);
        return content;
      } catch (err) {
        console.error(`Erro lendo cache ${hash}:`, err.message);
      }
    }

    return null;
  }

  set(key, content) {
    if (!content) return;
    const hash = this.getHashKey(key);

    this.setMemory(hash, content);

    const filePath = this.getFilePath(hash);
    try {
      fs.writeFileSync(filePath, content, 'utf-8');
    } catch (err) {
      console.error(`Erro salvando cache no disco ${hash}:`, err.message);
    }
  }

  setMemory(hash, content) {
    if (this.memoryCache.size >= this.maxMemoryItems) {
      const firstKey = this.memoryCache.keys().next().value;
      this.memoryCache.delete(firstKey);
    }
    this.memoryCache.set(hash, content);
  }

  has(key) {
    const hash = this.getHashKey(key);
    if (this.memoryCache.has(hash)) return true;
    return fs.existsSync(this.getFilePath(hash));
  }

  /**
   * Limpa arquivos de cache que não foram acessados por mais de 30 dias
   */
  runGarbageCollection() {
    try {
      if (!fs.existsSync(this.cacheDir)) return;
      const files = fs.readdirSync(this.cacheDir);
      const now = Date.now();
      let cleaned = 0;

      for (const file of files) {
        if (!file.endsWith('.vtt')) continue;
        const filePath = path.join(this.cacheDir, file);
        const stats = fs.statSync(filePath);

        if (now - stats.mtimeMs > this.maxDiskAgeMs) {
          fs.unlinkSync(filePath);
          cleaned++;
        }
      }

      if (cleaned > 0) {
        console.log(`[Cache GC] Limpeza automática removeu ${cleaned} arquivos antigos.`);
      }
    } catch (err) {
      console.warn('[Cache GC] Erro na limpeza automática:', err.message);
    }
  }

  /**
   * Retorna estatísticas de uso do cache
   */
  getStats() {
    let diskFilesCount = 0;
    let totalSize = 0;

    try {
      if (fs.existsSync(this.cacheDir)) {
        const files = fs.readdirSync(this.cacheDir);
        diskFilesCount = files.length;
        for (const file of files) {
          const stats = fs.statSync(path.join(this.cacheDir, file));
          totalSize += stats.size;
        }
      }
    } catch (err) {}

    return {
      memoryEntries: this.memoryCache.size,
      diskFiles: diskFilesCount,
      diskSizeBytes: totalSize,
      diskSizeMB: (totalSize / (1024 * 1024)).toFixed(2)
    };
  }
}

module.exports = new SubtitleCache();
