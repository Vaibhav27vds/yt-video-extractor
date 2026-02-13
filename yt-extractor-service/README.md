# yt-extractor-service

Express microservice that trims audio segments from YouTube videos, uploads to Supabase Storage, and returns a public URL.

Example curl usage:

```
curl -X POST http://localhost:3000/extract \
 -H "Authorization: Bearer ${SERVICE_API_KEY}" \
 -H "Content-Type: application/json" \
 -d '{"youtubeUrl":"https://www.youtube.com/watch?v=dQw4w9WgXcQ","start":"1:30","end":"2:30"}'
```

## Supabase Setup

Before running the service, ensure you have a storage bucket in Supabase:

1. Go to your Supabase project dashboard
2. Navigate to **Storage** in the left sidebar
3. Create a bucket named `audio` (or whatever you set in `STORAGE_BUCKET`)
4. Set it to **Public** bucket (so URLs are accessible)

This service uses the same bucket as direct audio uploads for consistency.

## Local development

```bash
cd yt-extractor-service
npm install
cp .env.example .env
# edit .env with your Supabase details and SERVICE_API_KEY
npm run dev
```

Build and run with Docker
```
docker build -t yt-extractor:local .
docker run -e SUPABASE_URL=$SUPABASE_URL -e SUPABASE_SERVICE_ROLE_KEY=$SUPABASE_SERVICE_ROLE_KEY -e SERVICE_API_KEY=$SERVICE_API_KEY -p 3000:3000 yt-extractor:local
```

Railway / deployment notes
- Connect this folder to Railway or push the Docker image. Set environment variables in Railway: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SERVICE_API_KEY`, `NODE_ENV=production`.
