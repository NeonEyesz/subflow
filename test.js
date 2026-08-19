const { getSubtitles, resolveAndDownloadSubtitle } = require('./src/services/subtitles');

async function runTests() {
  console.log('=== TESTE 1: Filme com release YTS 4K BluRay ===');
  const movieResults = await getSubtitles({
    type: 'movie',
    id: 'tt0111161',
    extra: { filename: 'The.Shawshank.Redemption.1994.2160p.4K.BluRay.x265.10bit.HDR.AAC5.1-[YTS.MX].mkv' }
  });
  console.log('Resultado filme:', JSON.stringify(movieResults, null, 2));

  if (movieResults.length > 0) {
    const token = movieResults[0].url.split('/')[2];
    const vtt = await resolveAndDownloadSubtitle(decodeURIComponent(token));
    console.log('Início do WebVTT filme:');
    console.log(vtt.substring(0, 250));
  }

  console.log('\n=== TESTE 2: Série com release Breaking Bad REWARD ===');
  const seriesResults = await getSubtitles({
    type: 'series',
    id: 'tt0903747:1:1',
    extra: { filename: 'Breaking.Bad.S01E01.720p.BluRay.X264-REWARD.mkv' }
  });
  console.log('Resultado série:', JSON.stringify(seriesResults, null, 2));

  if (seriesResults.length > 0) {
    const token = seriesResults[0].url.split('/')[2];
    const vtt = await resolveAndDownloadSubtitle(decodeURIComponent(token));
    console.log('Início do WebVTT série:');
    console.log(vtt.substring(0, 250));
  }

  console.log('\n✅ TESTES CONCLUÍDOS COM SUCESSO!');
  process.exit(0);
}

runTests();
