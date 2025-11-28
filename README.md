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

## Authentication

The app requires authentication and only allows users with `@rocketium.com` email addresses to sign in or sign up. 

- **Sign Up**: New users with `@rocketium.com` email addresses can create an account directly from the login page
- **Sign In**: Existing users can sign in with their credentials
- **Email Verification**: After signing up, users will receive an email verification link (if email confirmation is enabled in Supabase)

**Note**: Make sure email authentication is enabled in your Supabase project settings (Authentication > Settings > Email Auth).
