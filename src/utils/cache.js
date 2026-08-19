const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class SubtitleCache {
  constructor(cacheDir = path.join(__dirname, '../../cache'), maxMemoryItems = 500) {
    this.cacheDir = cacheDir;
    this.maxMemoryItems = maxMemoryItems;
    this.memoryCache = new Map();

    if (!fs.existsSync(this.cacheDir)) {
      try {
        fs.mkdirSync(this.cacheDir, { recursive: true });
      } catch (err) {
        console.error('Erro ao criar diretório de cache:', err.message);
      }
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

    // Verifica cache em memória primeiro
    if (this.memoryCache.has(hash)) {
      return this.memoryCache.get(hash);
    }

    // Verifica cache em disco
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

    // Salva em memória
    this.setMemory(hash, content);

    // Salva em disco
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
}

module.exports = new SubtitleCache();
