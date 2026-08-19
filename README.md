# 🌊 SubFlow (Stremio & Nuvio Addon)

Addon independente de alta performance para **Stremio** e **Nuvio** com seleção inteligente de legendas em **Português do Brasil (PT-BR)** e **Inglês (English)**, sincronização automática via VideoHash, higienização anti-anúncios, cache duplo (RAM + Disco) e fallback automático.

Desenvolvido por **Azthe**.

---

## 🌟 Principais Recursos

- 🇧🇷 **Prioridade PT-BR:** Algoritmo dedicado para selecionar e ordenar as melhores legendas em Português do Brasil.
- 🇺🇸 **Faixa em Inglês Simultânea (English Sync):** Entrega no mesmo player a faixa em inglês sincronizada com o vídeo.
- 🧹 **Removedor de Anúncios (Anti-Spam):** Higieniza as legendas removendo propagandas de sites e cassinos automaticamente.
- 🇵🇹 **Fallback Inteligente para PT-PT:** Se um filme raro não tiver PT-BR, oferece Português de Portugal como reserva de emergência.
- ⚡ **Cache Duplo (RAM + Disco):**
  - **Memória RAM:** Respostas instantâneas em ~1ms.
  - **Disco Persistente:** Nunca perde as legendas já baixadas, mesmo reiniciando.
  - **Auto-Limpeza (GC):** Limpeza automática de arquivos de cache não acessados há mais de 30 dias.
- ⚙️ **Painel Web de Configurações (`/configure`):** Escolha quais idiomas e recursos deseja ativar com 1 clique.
- 🎌 **Compatibilidade com Animes e Séries:** Reconhecimento avançado de grupos de fansub, tags de release e resoluções.

---

## 🚀 Como Usar Localmente (Windows / Linux / Mac)

### 1. Iniciar o Servidor:
No terminal da pasta do projeto:
```bash
npm start
```

### 2. Acessar o Painel:
Abra no navegador:
`http://localhost:7000` ou `http://localhost:7000/configure`

### 3. Instalar no Player:
- **Stremio:** Clique no botão **"Instalar no Stremio"** (`stremio://localhost:7000/manifest.json`).
- **Nuvio / Web:** Copie o link do manifesto exibido na tela (`http://localhost:7000/manifest.json`) e cole no seu aplicativo.

---

## 🐳 Como Rodar com Docker

```bash
docker-compose up -d --build
```
O addon estará rodando em `http://localhost:7000`.

---

## ☁️ Como Fazer Deploy Gratuito na Nuvem (24/7)

Para deixar o **SubFlow** online 24 horas por dia em qualquer TV, celular ou PC:

### Opção 1: [Render.com](https://render.com) (100% Gratuito)
1. Crie um repositório no seu GitHub e envie esta pasta:
   ```bash
   git remote add origin https://github.com/SEU_USUARIO/subflow.git
   git push -u origin main
   ```
2. No Render, crie um **Web Service** conectado ao seu GitHub.
3. Use o comando de build `npm install` e start `npm start`.
4. Adicione o link gerado (`https://seu-subflow.onrender.com/manifest.json`) no Stremio e Nuvio.

### Opção 2: [Railway.app](https://railway.app)
1. Suba o repositório no Railway.
2. O Railway detectará o `Dockerfile` e gerará seu domínio público instantaneamente.

---

## 📊 Endpoints Disponíveis

- `GET /` ou `/configure` — Painel interativo com chaveadores e métricas.
- `GET /manifest.json` — Manifesto padrão do addon.
- `GET /:config/manifest.json` — Manifesto personalizado com suas preferências.
- `GET /stats` — Telemetria de uso e estatísticas do cache.
- `GET /health` — Verificação de integridade do servidor.
