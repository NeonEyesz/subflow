const axios = require('axios');
const zlib = require('zlib');
const { bufferToUtf8, srtToVtt } = require('../utils/converter');

const OPENSUBTITLES_V3_BASE = 'https://opensubtitles-v3.strem.io';
const OPENSUBTITLES_API_URL = process.env.OPENSUBTITLES_API_URL || 'https://api.opensubtitles.com/api/v1';
const OPENSUBTITLES_API_KEY = process.env.OPENSUBTITLES_API_KEY || '';
const USER_AGENT = process.env.OPENSUBTITLES_USER_AGENT || 'SubFlow v1.2.0';

/**
 * Executa busca na API OpenSubtitles v3 do Stremio com fallback em cascata
 */
async function searchOpenSubtitlesV3({ type, id, extra = {} }) {
  const attempts = [];

  // Tentativa 1: Com VideoHash e Filename completos
  if (extra.videoHash || extra.filename) {
    const params = [];
    if (extra.videoHash) params.push(`videoHash=${encodeURIComponent(extra.videoHash)}`);
    if (extra.videoSize) params.push(`videoSize=${encodeURIComponent(extra.videoSize)}`);
    if (extra.filename) params.push(`filename=${encodeURIComponent(extra.filename)}`);
    attempts.push(`${OPENSUBTITLES_V3_BASE}/subtitles/${type}/${id}/${params.join('&')}.json`);
  }

  // Tentativa 2: Com Filename apenas (caso o hash não esteja na base)
  if (extra.filename && extra.videoHash) {
    attempts.push(`${OPENSUBTITLES_V3_BASE}/subtitles/${type}/${id}/filename=${encodeURIComponent(extra.filename)}.json`);
  }

  // Tentativa 3: Busca padrão por IMDb ID (fallback garantido)
  attempts.push(`${OPENSUBTITLES_V3_BASE}/subtitles/${type}/${id}.json`);

  let rawSubtitles = [];

  for (const url of attempts) {
    try {
      const response = await axios.get(url, {
        timeout: 6000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
      });

      if (response.data && Array.isArray(response.data.subtitles) && response.data.subtitles.length > 0) {
        // Se encontrou legendas neste nível, salva e verifica se tem PT-BR
        rawSubtitles = response.data.subtitles;
        const hasPt = rawSubtitles.some(s => {
          const l = (s.lang || '').toLowerCase();
          return l === 'pob' || l === 'pt-br' || l === 'por';
        });

        // Se encontrou legendas em português ou inglês na tentativa mais específica, usa esta
        if (hasPt) {
          break;
        }
      }
    } catch (err) {
      // Continua para a próxima tentativa de fallback
    }
  }

  if (rawSubtitles.length === 0) {
    return [];
  }

  // Filtra legendas em Português e Inglês
  const targetSubs = rawSubtitles.filter(sub => {
    const l = (sub.lang || '').toLowerCase();
    return l === 'pob' || l === 'por' || l === 'pt-br' || l === 'pt' || l === 'eng' || l === 'en';
  });

  return targetSubs.map((sub, index) => {
    const l = (sub.lang || '').toLowerCase();
    let normalizedLang = 'por';
    if (l === 'pob' || l === 'pt-br') normalizedLang = 'pob';
    else if (l === 'eng' || l === 'en') normalizedLang = 'eng';

    // matchType: 'h' = hash exato, 't' = tag/nome exato, 'i' = imdb fallback
    const matchType = sub.m || 'i';
    const isFromHash = matchType === 'h';
    const isFromTag = matchType === 't';

    return {
      sourceKey: 'opensubtitlesv3plus',
      providerId: sub.id || `v3-${index}`,
      downloadUrl: sub.url,
      fileId: sub.id,
      releaseName: extra.filename || `OpenSubtitles-${sub.id}`,
      language: normalizedLang,
      isPtBr: normalizedLang === 'pob',
      isEnglish: normalizedLang === 'eng',
      isForced: (sub.g || '').toString() === 'forced',
      matchType: matchType,
      fromHashMatch: isFromHash,
      fromTagMatch: isFromTag,
      ratings: isFromHash ? 100 : (isFromTag ? 50 : 10),
      votes: 10,
      downloads: 100,
      subEncoding: sub.SubEncoding || 'UTF-8'
    };
  });
}

/**
 * Busca legendas no OpenSubtitles REST API oficial
 */
async function searchOpenSubtitlesRest({ imdbId, season, episode, moviehash, bytesize, filename }) {
  if (!OPENSUBTITLES_API_KEY) {
    return [];
  }

  try {
    const params = {
      languages: 'pt-br,pob,por,en,eng',
      order_by: 'download_count',
      order_direction: 'desc'
    };

    if (imdbId) params.imdb_id = imdbId.replace(/^tt/, '');
    if (season !== undefined && season !== null) params.season_number = season;
    if (episode !== undefined && episode !== null) params.episode_number = episode;
    if (moviehash) params.moviehash = moviehash;
    if (bytesize) params.moviebytesize = bytesize;
    if (filename) params.query = filename;

    const response = await axios.get(`${OPENSUBTITLES_API_URL}/subtitles`, {
      params,
      headers: {
        'User-Agent': USER_AGENT,
        'Api-Key': OPENSUBTITLES_API_KEY,
        'Accept': 'application/json'
      },
      timeout: 6000
    });

    if (!response.data || !response.data.data) {
      return [];
    }

    return response.data.data.map(item => {
      const attributes = item.attributes || {};
      const files = attributes.files || [];
      const fileId = files[0]?.file_id;
      const releaseName = attributes.release || attributes.feature_details?.movie_name || '';
      const language = (attributes.language || '').toLowerCase();
      
      let normalizedLang = 'por';
      if (language === 'pt-br' || language === 'pob') normalizedLang = 'pob';
      else if (language === 'en' || language === 'eng') normalizedLang = 'eng';

      const isForced = attributes.foreign_parts_only || (releaseName.toLowerCase().includes('forced'));

      return {
        sourceKey: 'opensubtitles_rest',
        providerId: item.id || fileId,
        fileId: fileId,
        downloadUrl: attributes.url || null,
        releaseName: releaseName,
        language: normalizedLang,
        isPtBr: normalizedLang === 'pob',
        isEnglish: normalizedLang === 'eng',
        isForced: isForced,
        ratings: attributes.ratings || 0,
        votes: attributes.votes || 0,
        downloads: attributes.download_count || 0,
        fromHashMatch: attributes.moviehash_match || false
      };
    });
  } catch (err) {
    return [];
  }
}

/**
 * Faz download do arquivo de legenda e converte para WebVTT UTF-8 limpo
 */
async function downloadOpenSubtitle(candidate, cleanAds = true) {
  try {
    let fileUrl = candidate.downloadUrl;

    if (!fileUrl && candidate.fileId && OPENSUBTITLES_API_KEY) {
      const dlRes = await axios.post(
        `${OPENSUBTITLES_API_URL}/download`,
        { file_id: candidate.fileId },
        {
          headers: {
            'User-Agent': USER_AGENT,
            'Api-Key': OPENSUBTITLES_API_KEY,
            'Accept': 'application/json'
          },
          timeout: 8000
        }
      );

      if (dlRes.data && dlRes.data.link) {
        fileUrl = dlRes.data.link;
      }
    }

    if (!fileUrl) {
      throw new Error('Nenhum link de download disponível para esta legenda');
    }

    const fileRes = await axios.get(fileUrl, {
      responseType: 'arraybuffer',
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
      }
    });

    let buffer = Buffer.from(fileRes.data);

    if (buffer.length > 2 && buffer[0] === 0x1f && buffer[1] === 0x8b) {
      buffer = zlib.gunzipSync(buffer);
    }

    const utf8Content = bufferToUtf8(buffer);
    return srtToVtt(utf8Content, cleanAds);
  } catch (err) {
    console.error(`[OpenSubtitles] Falha ao baixar legenda ${candidate.fileId || candidate.providerId}:`, err.message);
    throw err;
  }
}

module.exports = {
  searchOpenSubtitlesV3,
  searchOpenSubtitlesRest,
  downloadOpenSubtitle
};
