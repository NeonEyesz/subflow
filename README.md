# 🎬 SyncSubs (Self-Hosted Stremio & Nuvio Addon)

Addon independente para **Stremio** e **Nuvio** focado em legendas em Português do Brasil (**PT-BR**), com seleção inteligente por VideoHash e release, conversão automática para WebVTT, cache persistente e fallback automático.

---

## 🚀 Como Funciona por Dentro

1. **Protocolo Stremio v3**:
   - O player envia requisições para `/subtitles/movie/{imdb_id}.json` ou `/subtitles/series/{imdb_id}:{season}:{episode}.json`.
   - Inclui parâmetros extras quando disponíveis (`videoHash`, `videoSize`, `filename`).

2. **Busca e Ranking Inteligente**:
   - Consulta múltiplos provedores (OpenSubtitles REST API, SubDL, etc.) filtrando estritamente por Português Brasileiro (`pob` / `pt-br`).
   - Calcula um índice de compatibilidade para cada legenda baseado em:
     - **VideoHash Match**: Correspondência exata com o arquivo de vídeo em reprodução.
     - **Release Match**: Correspondência entre o nome do arquivo (ex: `1080p`, `BluRay`, `YTS`, `WEB-DL`, `AMZN`) e a legenda.
     - **Popularidade e Avaliações**: Quantidade de downloads e pontuações positivas.

3. **Fallback Dinâmico e Proxy**:
   - O addon retorna uma URL intermediária com os candidatos ordenados em um token Base64 (`/subtitle/{token}/{season}/{episode}.vtt`).
   - Quando o Stremio/Nuvio solicita a legenda:
     - Se estiver no **Cache Persistente**, a entrega é instantânea.
     - Se não estiver, tenta baixar o Candidato #1. Se houver falha de rede ou arquivo corrompido, tenta automaticamente o Candidato #2, #3, etc.
     - Converte o encoding (Windows-1252 / ISO-8859-1 para UTF-8 limpo) e formata para o padrão WebVTT.
     - Salva no cache para acessos futuros.

---

## 🛠️ Como Rodar Localmente (Windows / Linux / Mac)

### Pré-requisitos:
- [Node.js](https://nodejs.org) (v18+)

### Instalação:
1. Abra o terminal na pasta do projeto:
   ```bash
   cd syncsubs
   ```
2. Instale as dependências:
   ```bash
   npm install
   ```
3. Inicie o servidor:
   ```bash
   npm start
   ```
4. Acesse no navegador:
   `http://localhost:7000`
5. Clique em **Instalar no Stremio** ou copie o link do manifesto para o **Nuvio**:
   `http://localhost:7000/manifest.json`

---

## 🐳 Como Rodar com Docker

```bash
docker-compose up -d --build
```
O addon estará disponível em `http://localhost:7000`.

---

## ☁️ Como Fazer Deploy Gratuito na Nuvem (24/7)

Caso queira ter seu próprio SyncSubs rodando online sem precisar deixar seu PC ligado:

### Opção 1: [Railway.app](https://railway.app)
1. Crie uma conta no Railway.
2. Crie um novo projeto a partir do seu repositório GitHub ou suba a pasta.
3. O Railway detectará o `Dockerfile` e gerará uma URL pública (ex: `https://meu-syncsubs.up.railway.app`).
4. Adicione `https://meu-syncsubs.up.railway.app/manifest.json` no seu Stremio / Nuvio.

### Opção 2: [Render.com](https://render.com)
1. Crie um **Web Service** no Render.
2. Conecte o repositório.
3. Build Command: `npm install`
4. Start Command: `npm start`
5. Adicione a URL gerada no Stremio.

---

## ⚙️ Variáveis de Ambiente (Opcionais)

No arquivo `.env`:
- `PORT`: Porta do servidor (padrão: `7000`)
- `OPENSUBTITLES_API_KEY`: Chave de API da OpenSubtitles (opcional)
- `SUBDL_API_KEY`: Chave de API do SubDL (opcional)
