# Local Capsule Proxy + AWS Lambda Handoff

This gives you a **safe local test setup** for capsule lookup without exposing prod Mongo publicly.

## What’s included

- Local test server:
  - `scripts/run-capsule-proxy-local.mjs:1`
- Shared lookup logic:
  - `scripts/capsule-proxy-core.mjs:1`
- Lambda-ready handler:
  - `lambda/capsuleProxy.mjs:1`

## 1) Local env

Add these to `.env.local`:

```env
MONGODB_URI=mongodb+srv://app:...@production.0y4ju.mongodb.net/rocketium_2
MONGODB_DB_NAME=rocketium_2
CAPSULE_PROXY_KEY=your_proxy_shared_secret
CAPSULE_PROXY_PORT=8787
```

## 2) Run the local proxy

```bash
npm run proxy:local
```

Expected output:

```bash
Capsule proxy listening on http://127.0.0.1:8787
```

The local runner now reads `.env.local` automatically, so you do not need to export those variables manually first.

## 3) Test it directly

```bash
curl -H 'x-capsule-proxy-key: your_proxy_shared_secret' \
  'http://127.0.0.1:8787/api/capsules/69b28ccaf35e94046e80824f'
```

Expected:

- `200`
- JSON with `success: true`
- `capsule.capsuleId`

## 4) Point Supabase to the proxy for local-only testing

Hosted Supabase cannot call `localhost`, so this only works if:

- you run the function locally, or
- you expose the local proxy via a tunnel

If you use a tunnel:

```bash
/tmp/supabase-cli/supabase secrets set CAPSULE_LOOKUP_BASE_URL='https://your-tunnel-url'
/tmp/supabase-cli/supabase secrets set CAPSULE_LOOKUP_TOKEN='your_proxy_shared_secret' --project-ref ebiazcvcqgxytkyoqjuq
```

Then redeploy:

```bash
/tmp/supabase-cli/supabase functions deploy create-evaluation --project-ref ebiazcvcqgxytkyoqjuq
```

## 5) AWS Lambda handoff

Deploy:

- `lambda/capsuleProxy.mjs:1`

Expected route shape:

- `GET /capsules/{capsuleId}`

Required Lambda env vars:

```env
MONGODB_URI=...
MONGODB_DB_NAME=rocketium_2
CAPSULE_PROXY_KEY=your_proxy_shared_secret
```

Then point Supabase at your Lambda/API Gateway URL:

```bash
/tmp/supabase-cli/supabase secrets set CAPSULE_LOOKUP_BASE_URL='https://your-api.example.com'
/tmp/supabase-cli/supabase secrets set CAPSULE_LOOKUP_TOKEN='your_proxy_shared_secret' --project-ref ebiazcvcqgxytkyoqjuq
/tmp/supabase-cli/supabase functions deploy create-evaluation --project-ref ebiazcvcqgxytkyoqjuq
```

## Notes

- The proxy is **read-only**
- It only supports capsule fetch by `capsuleId` / `_id`
- No capsule data is stored in Supabase in this setup
