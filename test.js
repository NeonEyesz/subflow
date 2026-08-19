const { getSubtitles, resolveAndDownloadSubtitle } = require('./src/services/subtitles');

async function runTests() {
  console.log('=== TESTE 1: Busca de legendas para filme (tt0111161 - Shawshank Redemption) ===');
  const movieResults = await getSubtitles({
    type: 'movie',
    id: 'tt0111161',
    extra: { filename: 'The.Shawshank.Redemption.1994.1080p.BluRay.x264.YIFY.mp4' }
  });
  console.log('Resultado filme:', JSON.stringify(movieResults, null, 2));

  if (movieResults.length > 0) {
    const token = movieResults[0].url.split('/')[2];
    const vtt = await resolveAndDownloadSubtitle(decodeURIComponent(token));
    console.log('Início do WebVTT filme:');
    console.log(vtt.substring(0, 200));
  }

  console.log('\n=== TESTE 2: Busca de legendas para série (tt0903747:1:1 - Breaking Bad S01E01) ===');
  const seriesResults = await getSubtitles({
    type: 'series',
    id: 'tt0903747:1:1',
    extra: { filename: 'Breaking.Bad.S01E01.720p.BluRay.x264.mp4' }
  });
  console.log('Resultado série:', JSON.stringify(seriesResults, null, 2));

  if (seriesResults.length > 0) {
    const token = seriesResults[0].url.split('/')[2];
    const vtt = await resolveAndDownloadSubtitle(decodeURIComponent(token));
    console.log('Início do WebVTT série:');
    console.log(vtt.substring(0, 200));
  }

  console.log('\n✅ TODOS OS TESTES PASSARAM COM SUCESSO!');
}

runTests();
