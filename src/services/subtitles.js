const { searchOpenSubtitlesV3Plus, downloadSubtitle } = require('./opensubtitles');
const cache = require('../utils/cache');

/**
 * Normaliza e pontua a similaridade entre o nome do arquivo do vídeo e o título da legenda.
 */
function calculateReleaseMatchScore(candidateRelease, targetFilename) {
  if (!candidateRelease || !targetFilename) return 0;

  const tokenize = str => str.toLowerCase()
    .replace(/[\[\]\(\)\._-]/g, ' ')
    .replace(/\b(1080p|720p|2160p|4k|hdr|bluray|web-dl|webrip|web|hdtv|x264|x265|hevc|aac|dts)\b/g, ' $1 ')
    .split(/\s+/)
    .filter(Boolean);

  const targetTokens = new Set(tokenize(targetFilename));
  const candidateTokens = tokenize(candidateRelease);

  let score = 0;
  for (const token of candidateTokens) {
    if (targetTokens.has(token)) {
      // Tags de alta fidelidade (grupos de release e fontes de vídeo)
      if (['web-dl', 'webrip', 'bluray', 'hdtv', 'remux', 'atvp', 'amzn', 'nf', 'dsnp', 'hbo', 'flux', 'ntb', 'yts', 'rarbg', 'psa', 'fgt', 'reward', 'ctrlhd', 'pia', 'zicamanhd'].includes(token)) {
        score += 150;
      } else if (['2160p', '1080p', '720p', '4k', 'hdr', 'x264', 'x265', 'hevc'].includes(token)) {
        score += 80;
      } else {
        score += 20;
      }
    }
  }

  return score;
}

/**
 * Classifica e ordena os candidatos de legenda por exatidão de sincronismo
 */
function rankCandidates(candidates, { filename }) {
  return candidates.map(candidate => {
    let score = 0;

    // 1. Hash exato
    if (candidate.fromHashMatch) {
      score += 10000;
    }

    // 2. Pontuação por compatibilidade com o arquivo de vídeo do usuário
    if (filename && candidate.releaseName) {
      score += calculateReleaseMatchScore(candidate.releaseName, filename);
    }

    // 3. PT-BR confirmado
    if (candidate.isPtBr) {
      score += 500;
    }

    // 4. Penaliza traduções puramente por IA se houver legendas humanas
    if (candidate.aiTranslated) {
      score -= 50;
    }

    return {
      ...candidate,
      rankingScore: score
    };
  }).sort((a, b) => b.rankingScore - a.rankingScore);
}

/**
 * Decodifica configurações do usuário a partir da URL
 */
function parseUserConfig(configStr) {
  const defaults = {
    enablePtBr: true,
    enableEnglish: true,
    fallbackPtPt: true,
    cleanAds: true
  };

  if (!configStr) return defaults;

  try {
    const params = new URLSearchParams(configStr);
    return {
      enablePtBr: params.get('ptbr') !== '0',
      enableEnglish: params.get('eng') !== '0',
      fallbackPtPt: params.get('ptpt') !== '0',
      cleanAds: params.get('ads') !== '0'
    };
  } catch (err) {
    return defaults;
  }
}

/**
 * Busca e seleciona as melhores legendas
 */
async function getSubtitles({ type, id, extra = {}, config = '' }) {
  let imdbId = id;
  let season = null;
  let episode = null;

  if (id.includes(':')) {
    const parts = id.split(':');
    imdbId = parts[0];
    season = parseInt(parts[1], 10);
    episode = parseInt(parts[2], 10);
  }

  const userConfig = parseUserConfig(config);

  const queryParams = {
    type,
    id,
    imdbId,
    season,
    episode,
    videoHash: extra.videoHash,
    videoSize: extra.videoSize,
    filename: extra.filename,
    extra
  };

  const allCandidates = await searchOpenSubtitlesV3Plus(queryParams);

  if (allCandidates.length === 0) {
    return [];
  }

  const seasonParam = season !== null ? season : 0;
  const episodeParam = episode !== null ? episode : 0;
  const results = [];

  // 1. Faixa PT-BR
  if (userConfig.enablePtBr) {
    let ptCandidates = allCandidates.filter(c => c.language === 'pob');

    let isFallback = false;
    if (ptCandidates.length === 0 && userConfig.fallbackPtPt) {
      ptCandidates = allCandidates.filter(c => c.language === 'por');
      isFallback = ptCandidates.length > 0;
    }

    if (ptCandidates.length > 0) {
      const rankedPt = rankCandidates(ptCandidates, queryParams).slice(0, 10);
      const topPt = rankedPt.map((cand, idx) => ({
        sourceKey: cand.sourceKey,
        providerId: cand.providerId,
        downloadUrl: cand.downloadUrl,
        releaseName: cand.releaseName,
        cleanAds: userConfig.cleanAds,
        ranking: idx + 1
      }));

      const ptPayload = {
        candidatos: topPt,
        cacheKey: `subflow-pt-${id}-${extra.videoHash || extra.filename || 'default'}`,
        release: topPt.map(c => c.releaseName).filter(Boolean),
        cleanAds: userConfig.cleanAds,
        fallback: null
      };

      const ptToken = Buffer.from(JSON.stringify(ptPayload)).toString('base64');
      results.push({
        id: `subflow-pt-${ptToken.substring(0, 16)}`,
        url: `/subtitle/${encodeURIComponent(ptToken)}/${seasonParam}/${episodeParam}.vtt`,
        lang: 'pob',
        label: isFallback ? 'SubFlow [Português - Fallback]' : 'SubFlow [PT-BR Automático]'
      });
    }
  }

  // 2. Faixa Inglês
  if (userConfig.enableEnglish) {
    const enCandidates = allCandidates.filter(c => c.language === 'eng');
    if (enCandidates.length > 0) {
      const rankedEn = rankCandidates(enCandidates, queryParams).slice(0, 10);
      const topEn = rankedEn.map((cand, idx) => ({
        sourceKey: cand.sourceKey,
        providerId: cand.providerId,
        downloadUrl: cand.downloadUrl,
        releaseName: cand.releaseName,
        cleanAds: userConfig.cleanAds,
        ranking: idx + 1
      }));

      const enPayload = {
        candidatos: topEn,
        cacheKey: `subflow-en-${id}-${extra.videoHash || extra.filename || 'default'}`,
        release: topEn.map(c => c.releaseName).filter(Boolean),
        cleanAds: userConfig.cleanAds,
        fallback: null
      };

      const enToken = Buffer.from(JSON.stringify(enPayload)).toString('base64');
      results.push({
        id: `subflow-en-${enToken.substring(0, 16)}`,
        url: `/subtitle/${encodeURIComponent(enToken)}/${seasonParam}/${episodeParam}.vtt`,
        lang: 'eng',
        label: 'SubFlow [English Sync]'
      });
    }
  }

  // 3. Faixa de Legendas Forçadas
  const forcedCandidates = allCandidates.filter(c => c.isForced);
  if (forcedCandidates.length > 0) {
    const rankedForced = rankCandidates(forcedCandidates, queryParams).slice(0, 4);
    const topForced = rankedForced.map((cand, idx) => ({
      sourceKey: cand.sourceKey,
      providerId: cand.providerId,
      downloadUrl: cand.downloadUrl,
      releaseName: cand.releaseName,
      cleanAds: userConfig.cleanAds,
      ranking: idx + 1
    }));

    const forcedPayload = {
      candidatos: topForced,
      cacheKey: `subflow-forced-${id}-${extra.videoHash || extra.filename || 'default'}`,
      release: topForced.map(c => c.releaseName).filter(Boolean),
      cleanAds: userConfig.cleanAds,
      fallback: null
    };

    const forcedToken = Buffer.from(JSON.stringify(forcedPayload)).toString('base64');
    results.push({
      id: `subflow-forced-${forcedToken.substring(0, 16)}`,
      url: `/subtitle/${encodeURIComponent(forcedToken)}/${seasonParam}/${episodeParam}.vtt`,
      lang: 'pob',
      label: 'SubFlow [PT-BR Forçada / Trechos Estrangeiros]'
    });
  }

  return results;
}

/**
 * Tenta baixar a legenda do melhor candidato com fallback automático
 */
async function resolveAndDownloadSubtitle(token) {
  let payload;
  try {
    const jsonStr = Buffer.from(token, 'base64').toString('utf-8');
    payload = JSON.parse(jsonStr);
  } catch (err) {
    throw new Error('Token de legenda inválido');
  }

  const { candidatos, cacheKey, cleanAds = true } = payload;

  if (cacheKey && cache.has(cacheKey)) {
    const cachedVtt = cache.get(cacheKey);
    if (cachedVtt) {
      console.log(`[Cache Hit] Legenda servida do cache: ${cacheKey}`);
      return cachedVtt;
    }
  }

  if (!candidatos || candidatos.length === 0) {
    throw new Error('Nenhum candidato de legenda disponível');
  }

  let lastError = null;

  for (let i = 0; i < candidatos.length; i++) {
    const candidate = candidatos[i];
    console.log(`[SubFlow] Tentando baixar candidato #${i + 1}: ${candidate.releaseName || candidate.providerId}`);

    try {
      const vttContent = await downloadSubtitle(candidate, cleanAds);

      if (vttContent && vttContent.includes('WEBVTT')) {
        console.log(`[SubFlow] Sucesso no candidato #${i + 1} (${candidate.releaseName})! Gravando em cache...`);
        if (cacheKey) {
          cache.set(cacheKey, vttContent);
        }
        return vttContent;
      }
    } catch (err) {
      console.warn(`[SubFlow] Falha no candidato #${i + 1}: ${err.message}. Tentando próximo...`);
      lastError = err;
    }
  }

  throw new Error(`Todos os ${candidatos.length} candidatos falharam: ${lastError ? lastError.message : 'desconhecido'}`);
}

module.exports = {
  getSubtitles,
  resolveAndDownloadSubtitle,
  parseUserConfig
};
