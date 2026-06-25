# Game Config Validator

A Next.js service that validates game configuration JSON with JSON Schema and provides balancing feedback from an LLM.

## Install And Run

1. Install dependencies:

```bash
npm install
```

2. Create your local environment file:

```bash
cp .env.local.example .env.local
```

If `.env.local.example` does not exist in your copy, create `.env.local` manually as described below.

3. Start the dev server:

```bash
npm run dev
```

4. Open the app:

http://localhost:3000

## Run With Docker

1. Build the image:

```bash
docker build -t game-config-validator .
```

2. Run the container:

```bash
docker run --rm -p 3000:3000 \
	-e GEMINI_API_KEY=your_gemini_api_key_here \
	game-config-validator
```

3. Open the app:

http://localhost:3000

## Configure The LLM API Key

Create or edit `.env.local` in the project root.

### Option 1: Gemini (default)

```bash
GEMINI_API_KEY=your_gemini_api_key_here
```

Optional:

```bash
GEMINI_MODEL=gemini-2.5-flash
```

### Option 2: OpenAI

```bash
LLM_PROVIDER=openai
OPENAI_API_KEY=your_openai_api_key_here
OPENAI_MODEL=gpt-4o-mini
```

### Option 3: Local Model (OpenAI-compatible endpoint, e.g. Ollama)

```bash
LLM_PROVIDER=local
LOCAL_LLM_BASE_URL=http://localhost:11434/v1
LOCAL_LLM_MODEL=llama3.1
```

Optional:

```bash
LOCAL_LLM_API_KEY=your_local_provider_key_if_needed
```

Notes:
- If `LLM_PROVIDER` is not set, the app defaults to Gemini.
- If `LLM_PROVIDER` is not set and only `OPENAI_API_KEY` is configured, the app uses OpenAI automatically.
- If `LLM_PROVIDER` is not set and only `LOCAL_LLM_BASE_URL` is configured, the app uses the local model automatically.

Notes:
- Do not commit `.env.local`.
- Restart the dev server after changing environment variables.

## Example Commands To Test The Service

The API endpoint is:

`POST /api/config-validator`

### 1. Valid Configuration

```bash
curl -X POST http://localhost:3000/api/config-validator \
	-H "Content-Type: application/json" \
	-d '{
		"level": 1,
		"difficulty": "easy",
		"reward": 5000,
		"time_limit": 60
	}'
```

### 2. Invalid Configuration (Schema Error)

```bash
curl -X POST http://localhost:3000/api/config-validator \
	-H "Content-Type: application/json" \
	-d '{
		"level": 0,
		"difficulty": "easy",
		"reward": 100
	}'
```

### 3. Malformed JSON

```bash
curl -X POST http://localhost:3000/api/config-validator \
	-H "Content-Type: application/json" \
	-d '{"level":1, "difficulty":"easy"'
```
