# Supabase Edge Functions for Project Compliance Inspector

## Functions

### 1. `create-evaluation`
Creates a new evaluation job and starts analyzing creatives in the background.

**Endpoint:** `POST /functions/v1/create-evaluation`

**Request Body:**
```json
{
  "project_link": "https://rocketium.com/campaign/p/xxx-123/name/view",
  "platform_id": "default",
  "base_url": "https://your-app.com"
}
```

**Response:**
```json
{
  "success": true,
  "job_id": "eval-abc123-xyz789",
  "shareable_url": "https://your-app.com/preview/eval-abc123-xyz789",
  "project_id": "xxx-123",
  "project_name": "My Project",
  "total_creatives": 5,
  "status": "pending"
}
```

### 2. `get-evaluation`
Gets the status and results of an evaluation job.

**Endpoint:** `GET /functions/v1/get-evaluation?job_id=eval-abc123-xyz789`

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "eval-abc123-xyz789",
    "project_id": "xxx-123",
    "project_name": "My Project",
    "platform_id": "default",
    "status": "completed",
    "total_creatives": 5,
    "analyzed_creatives": 5,
    "creatives": [...],
    "summary": {
      "avg_score": 85,
      "completed": 5,
      "failed": 0,
      "pending": 0,
      "analyzing": 0,
      "compliance": {
        "passed": 20,
        "failed": 3,
        "warnings": 2
      }
    }
  }
}
```

## Deployment

### 1. Link your Supabase project
```bash
supabase link --project-ref YOUR_PROJECT_REF
```

### 2. Set environment variables
```bash
supabase secrets set GEMINI_API_KEY=your_gemini_api_key
```

### 3. Deploy functions
```bash
supabase functions deploy create-evaluation
supabase functions deploy get-evaluation
```

### 4. Run the database migration
Go to Supabase Dashboard > SQL Editor and run the contents of `supabase_migration.sql`

## Testing with cURL

### Create Evaluation
```bash
curl -X POST 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/create-evaluation' \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer YOUR_ANON_KEY' \
  -d '{
    "project_link": "YOUR_PROJECT_ID",
    "platform_id": "default",
    "base_url": "https://your-app.com"
  }'
```

### Get Evaluation Status
```bash
curl 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/get-evaluation?job_id=eval-xxx' \
  -H 'Authorization: Bearer YOUR_ANON_KEY'
```

## Local Development

```bash
# Start local Supabase
supabase start

# Serve functions locally
supabase functions serve --env-file .env.local
```

Create `.env.local` with:
```
GEMINI_API_KEY=your_gemini_api_key
```
