const axios = require('axios');
const zlib = require('zlib');
const { bufferToUtf8, srtToVtt } = require('../utils/converter');

const SUBDL_API_KEY = process.env.SUBDL_API_KEY || '';
const SUBDL_API_URL = 'https://api.subdl.com/api/v1/subtitles';

/**
 * Busca legendas no SubDL (provedor alternativo/fallback)
 */
async function searchSubDL({ imdbId, season, episode, filename }) {
  if (!SUBDL_API_KEY) {
    return [];
  }

  try {
    const params = {
      api_key: SUBDL_API_KEY,
      imdb_id: imdbId,
      languages: 'PT,BR'
    };

    if (season !== undefined && season !== null) {
      params.season_number = season;
    }
    if (episode !== undefined && episode !== null) {
      params.episode_number = episode;
    }

    const response = await axios.get(SUBDL_API_URL, { params, timeout: 6000 });

    if (!response.data || !response.data.subtitles) {
      return [];
    }

    return response.data.subtitles.map(sub => {
      const isPtBr = (sub.language || '').toLowerCase().includes('br') || (sub.release_name || '').toLowerCase().includes('pt-br');
      return {
        sourceKey: 'subdl',
        providerId: sub.url || sub.id,
        downloadUrl: sub.url ? `https://dl.subdl.com${sub.url}` : null,
        releaseName: sub.release_name || sub.name || '',
        language: isPtBr ? 'pob' : 'por',
        isPtBr: isPtBr,
        ratings: 0,
        votes: 0,
        downloads: 0,
        fromHashMatch: false
      };
    });
  } catch (err) {
    console.warn('[SubDL] Erro na busca:', err.message);
    return [];
  }
}

/**
 * Faz download de legenda do SubDL
 */
async function downloadSubDL(candidate) {
  try {
    if (!candidate.downloadUrl) {
      throw new Error('Nenhum link de download disponível no SubDL');
    }

    const response = await axios.get(candidate.downloadUrl, {
      responseType: 'arraybuffer',
      timeout: 10000
    });

    let buffer = Buffer.from(response.data);
    const utf8Content = bufferToUtf8(buffer);
    return srtToVtt(utf8Content);
  } catch (err) {
    console.error('[SubDL] Erro ao baixar legenda:', err.message);
    throw err;
  }
}

module.exports = {
  searchSubDL,
  downloadSubDL
};
