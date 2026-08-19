const axios = require('axios');
const zlib = require('zlib');
const { bufferToUtf8, srtToVtt } = require('../utils/converter');

const OPENSUBTITLES_PLUS_BASE = 'https://opensubtitles.stremio.homes/pt-br|pt-pt|en/ai-translated=true|from=all|auto-adjustment=false';
const OPENSUBTITLES_FALLBACK_BASE = 'https://opensubtitles-v3.strem.io';
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

/**
 * Busca legendas no catálogo completo OpenSubtitles v3+ (com nomes reais de release)
 */
async function searchOpenSubtitlesV3Plus({ type, id, extra = {} }) {
  const queryParts = [];
  if (extra.videoHash) queryParts.push(`videoHash=${encodeURIComponent(extra.videoHash)}`);
  if (extra.videoSize) queryParts.push(`videoSize=${encodeURIComponent(extra.videoSize)}`);
  if (extra.filename) queryParts.push(`filename=${encodeURIComponent(extra.filename)}`);

  const extraQuery = queryParts.length > 0 ? `/${queryParts.join('&')}` : '';

  const urlsToTry = [
    // 1. Busca com filename/hash no OpenSubtitles v3+
    extraQuery ? `${OPENSUBTITLES_PLUS_BASE}/subtitles/${type}/${id}${extraQuery}.json` : null,
    // 2. Busca padrão no OpenSubtitles v3+
    `${OPENSUBTITLES_PLUS_BASE}/subtitles/${type}/${id}.json`,
    // 3. Fallback de emergência no endpoint oficial do Stremio
    extraQuery ? `${OPENSUBTITLES_FALLBACK_BASE}/subtitles/${type}/${id}${extraQuery}.json` : null,
    `${OPENSUBTITLES_FALLBACK_BASE}/subtitles/${type}/${id}.json`
  ].filter(Boolean);

  for (const url of urlsToTry) {
    try {
      const response = await axios.get(url, {
        timeout: 7000,
        headers: { 'User-Agent': USER_AGENT }
      });

      if (response.data && Array.isArray(response.data.subtitles) && response.data.subtitles.length > 0) {
        return response.data.subtitles.map(sub => {
          const langCode = (sub.lang_code || sub.lang || '').toLowerCase();
          let normalizedLang = 'por';
          if (langCode === 'pt-br' || langCode === 'pob' || langCode === 'pb') {
            normalizedLang = 'pob';
          } else if (langCode === 'en' || langCode === 'eng') {
            normalizedLang = 'eng';
          }

          const releaseTitle = sub.title || extra.filename || `OpenSubtitles-${sub.id || sub.sub_id}`;
          const isForced = (releaseTitle.toLowerCase().includes('forced')) || (releaseTitle.toLowerCase().includes('forçada'));

          return {
            sourceKey: 'opensubtitlesv3plus',
            providerId: sub.id || sub.sub_id,
            subId: sub.sub_id || sub.id,
            downloadUrl: sub.url,
            releaseName: releaseTitle,
            language: normalizedLang,
            isPtBr: normalizedLang === 'pob',
            isEnglish: normalizedLang === 'eng',
            isForced: isForced,
            fromHashMatch: !!sub.moviehash || (sub.m === 'h'),
            aiTranslated: !!sub.ai_translated
          };
        });
      }
    } catch (err) {
      // Tenta a próxima URL da lista
    }
  }

  return [];
}

/**
 * Baixa e normaliza a legenda em WebVTT limpo
 */
async function downloadSubtitle(candidate, cleanAds = true) {
  if (!candidate.downloadUrl) {
    throw new Error('Nenhum link de download disponível para esta legenda');
  }

  try {
    const fileRes = await axios.get(candidate.downloadUrl, {
      responseType: 'arraybuffer',
      timeout: 10000,
      headers: { 'User-Agent': USER_AGENT }
    });

    let buffer = Buffer.from(fileRes.data);

    // Se for arquivo gzip comprimido
    if (buffer.length > 2 && buffer[0] === 0x1f && buffer[1] === 0x8b) {
      buffer = zlib.gunzipSync(buffer);
    }

    const utf8Content = bufferToUtf8(buffer);
    return srtToVtt(utf8Content, cleanAds);
  } catch (err) {
    console.error(`[SubFlow] Falha ao baixar legenda ${candidate.releaseName || candidate.providerId}:`, err.message);
    throw err;
  }
}

module.exports = {
  searchOpenSubtitlesV3Plus,
  downloadSubtitle
};
