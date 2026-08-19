const iconv = require('iconv-lite');
const chardet = require('chardet');

/**
 * Padrões de regex para identificar propagandas comuns em legendas
 */
const AD_PATTERNS = [
  /opensubtitles/i,
  /subdl\.com/i,
  /legendas\.tv/i,
  /baixadofilmes/i,
  /yify/i,
  /yts\.(mx|am|lt)/i,
  /subscene/i,
  /traduzido por/i,
  /sincronizado por/i,
  /legenda ripada/i,
  /resync by/i,
  /subtitles by/i,
  /corrected by/i,
  /www\.[a-z0-9-]+\.(com|net|org|br|to|tv|cc)/i,
  /https?:\/\/[^\s]+/i,
  /bet(365|ano|fair|777)/i,
  /1xbet/i,
  /apostas?/i
];

/**
 * Converte um buffer de dados de legenda para string UTF-8 limpa.
 * Detecta encodings comuns como UTF-8, Windows-1252, ISO-8859-1.
 */
function bufferToUtf8(buffer) {
  if (!buffer || buffer.length === 0) return '';

  let encoding = chardet.detect(buffer);
  if (!encoding) {
    encoding = 'UTF-8';
  }

  const encLower = encoding.toLowerCase();
  let selectedEncoding = 'utf-8';

  if (encLower.includes('windows-1252') || encLower.includes('iso-8859-1') || encLower.includes('latin')) {
    selectedEncoding = 'windows-1252';
  } else if (encLower.includes('utf-16') || encLower.includes('utf16')) {
    selectedEncoding = encLower.includes('le') ? 'utf-16le' : 'utf-16be';
  }

  try {
    const decoded = iconv.decode(buffer, selectedEncoding);
    return decoded.replace(/^\uFEFF/, '');
  } catch (err) {
    return buffer.toString('utf-8').replace(/^\uFEFF/, '');
  }
}

/**
 * Remove linhas de anúncios e créditos promocionais de uma legenda
 */
function cleanSubtitleText(text) {
  if (!text) return '';

  const blocks = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split(/\n\n+/);
  const cleanedBlocks = [];

  for (const block of blocks) {
    const lines = block.trim().split('\n');
    if (lines.length < 2) continue;

    // A linha de tempo é geralmente a 1ª ou 2ª linha
    const timeIndex = lines.findIndex(l => l.includes('-->'));
    if (timeIndex === -1) continue;

    const dialogLines = lines.slice(timeIndex + 1).join(' ');

    // Se o diálogo for apenas uma propaganda, ignora este bloco
    const isAd = AD_PATTERNS.some(pattern => pattern.test(dialogLines));
    if (!isAd) {
      cleanedBlocks.push(block.trim());
    }
  }

  return cleanedBlocks.join('\n\n');
}

/**
 * Converte conteúdo de legenda SRT para WebVTT padrão limpo e higienizado.
 */
function srtToVtt(srtContent) {
  if (!srtContent) return 'WEBVTT\n\n';

  let content = srtContent.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();

  // Substitui separadores de tempo SRT (vírgula) por VTT (ponto)
  content = content.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2');

  // Limpa anúncios
  content = cleanSubtitleText(content);

  // Garante que o cabeçalho WEBVTT está presente
  if (!content.startsWith('WEBVTT')) {
    content = `WEBVTT\n\n${content}\n`;
  }

  return content;
}

module.exports = {
  bufferToUtf8,
  srtToVtt,
  cleanSubtitleText
};
