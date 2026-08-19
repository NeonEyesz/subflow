const iconv = require('iconv-lite');
const chardet = require('chardet');

/**
 * Converte um buffer de dados de legenda para string UTF-8 limpa.
 * Detecta encodings comuns como UTF-8, Windows-1252, ISO-8859-1.
 */
function bufferToUtf8(buffer) {
  if (!buffer || buffer.length === 0) return '';

  // Detecta o encoding
  let encoding = chardet.detect(buffer);
  if (!encoding) {
    encoding = 'UTF-8';
  }

  // Normaliza nomes de encoding
  const encLower = encoding.toLowerCase();
  let selectedEncoding = 'utf-8';

  if (encLower.includes('windows-1252') || encLower.includes('iso-8859-1') || encLower.includes('latin')) {
    selectedEncoding = 'windows-1252';
  } else if (encLower.includes('utf-16') || encLower.includes('utf16')) {
    selectedEncoding = encLower.includes('le') ? 'utf-16le' : 'utf-16be';
  }

  try {
    const decoded = iconv.decode(buffer, selectedEncoding);
    // Remove BOM se presente
    return decoded.replace(/^\uFEFF/, '');
  } catch (err) {
    return buffer.toString('utf-8').replace(/^\uFEFF/, '');
  }
}

/**
 * Converte conteúdo de legenda SRT para WebVTT padrão.
 */
function srtToVtt(srtContent) {
  if (!srtContent) return 'WEBVTT\n\n';

  // Se já começar com WEBVTT, apenas normaliza quebras de linha
  if (srtContent.trim().startsWith('WEBVTT')) {
    return srtContent.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  }

  // Normaliza quebras de linha
  let content = srtContent.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();

  // Substitui separadores de tempo SRT (vírgula) por VTT (ponto)
  // Ex: 00:01:23,456 --> 00:01:25,789 para 00:01:23.456 --> 00:01:25.789
  content = content.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2');

  // Adiciona cabeçalho WEBVTT
  return `WEBVTT\n\n${content}\n`;
}

module.exports = {
  bufferToUtf8,
  srtToVtt
};
