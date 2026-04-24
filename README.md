Version: 1.0.1
<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/drive/1pSrIvrSggxHUQi0UzqZtXeo9PJog0fFK

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set up environment variables:
   - Create a `.env.local` file in the root directory
   - Add your Gemini API key:
     ```
     GEMINI_API_KEY=your_gemini_api_key_here
     ```
   - Add your Supabase credentials:
     ```
     VITE_SUPABASE_URL=your_supabase_project_url
     VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
     ```
3. Set up Supabase:
   - Create a project at [supabase.com](https://supabase.com)
   - Go to Authentication > Settings and enable Email authentication
   - Optionally, set up Row Level Security (RLS) policies to restrict access to @rocketium.com emails
   - Users can now sign up directly with their @rocketium.com email addresses
4. Run the app:
   `npm run dev`

## New in Phase 1

- **Multi-project asset preview links** are supported for shareable/background evaluations.
- **Brand rule libraries** can be managed from the in-app admin screen.
- **Chrome side-panel extension** lives in `extension/` and can be loaded as an unpacked extension.

## Supabase migration

Run the SQL in `supabase_migration.sql` to add:
- append-per-run `project_evaluations` storage with `evaluation_job_id`
- `evaluation_jobs.metadata`
- `platform_configs`
- `brand_configs`

## Chrome extension

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select the `extension/` folder
5. Set the **App Base URL** in the side panel to your deployed app URL or local Vite server

## Local capsule proxy + tunnel

Use this when you want to test **fact-based capsule rules locally** while keeping Mongo protected.

### Local env

Add these to `.env.local`:

```env
MONGODB_URI=your_mongodb_uri
MONGODB_DB_NAME=rocketium_2
CAPSULE_PROXY_KEY=your_proxy_shared_secret
CAPSULE_PROXY_PORT=8787
```

### Start the local capsule proxy

```bash
npm run proxy:local
```

The local proxy reads `.env.local` automatically.

### Start a public tunnel

```bash
cloudflared tunnel --url http://127.0.0.1:8787
```

This gives you a temporary public URL like:

```bash
https://your-random-subdomain.trycloudflare.com
```

### Point Supabase to the tunnel

```bash
/tmp/supabase-cli/supabase secrets set CAPSULE_LOOKUP_BASE_URL='https://your-random-subdomain.trycloudflare.com' --project-ref ebiazcvcqgxytkyoqjuq
/tmp/supabase-cli/supabase secrets set CAPSULE_LOOKUP_TOKEN='your_proxy_shared_secret' --project-ref ebiazcvcqgxytkyoqjuq
/tmp/supabase-cli/supabase functions deploy create-evaluation --project-ref ebiazcvcqgxytkyoqjuq
```

### Test the proxy directly

```bash
curl -H 'x-capsule-proxy-key: your_proxy_shared_secret' \
  'http://127.0.0.1:8787/api/capsules/69b28ccaf35e94046e80824f'
```

### Important note

- Yes, you need to start the proxy and tunnel again each time you want **hosted Supabase** to call your **local machine**
- Cloudflare quick tunnel URLs are temporary, so if the URL changes you must update `CAPSULE_LOOKUP_BASE_URL` and redeploy `create-evaluation`
- The long-term replacement for this setup is the AWS Lambda proxy in `lambda/capsuleProxy.mjs`

## Authentication

The app requires authentication and only allows users with `@rocketium.com` email addresses to sign in or sign up. 

- **Sign Up**: New users with `@rocketium.com` email addresses can create an account directly from the login page
- **Sign In**: Existing users can sign in with their credentials
- **Email Verification**: After signing up, users will receive an email verification link (if email confirmation is enabled in Supabase)

**Note**: Make sure email authentication is enabled in your Supabase project settings (Authentication > Settings > Email Auth).
