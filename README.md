# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some Oxlint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the Oxlint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and Oxlint's TypeScript related rules in your project.

## Overgain local setup

Install dependencies and start the app:

```sh
npm install
npm run dev
```

The Supabase URL and publishable key are configured in `.env`. Before creating
accounts, open the configured project's SQL Editor and run `supabase_schema.sql`.
That script creates the app tables, profile trigger, and row-level security
policies; it does not delete existing users or data.
It also installs the secure group-invite function used to add members without
triggering row-level security errors. Re-run the complete script in the same
project after updating the app to enable group invite links, public-feed likes
and comments, and workout-photo storage.
Re-run it after profile changes to enable shared profile calendars and public
routine details; routine weights are shared only when the owner enables them,
and training dates follow the profile's activity-visibility setting.
Re-run it after this update to install the secure `leave_group` function needed
for members to leave groups in the cloud.
If login or registration reports a missing `profiles` column or a missing
`public.*` table, the schema has not been fully applied. Run the complete script
against the same Supabase project configured in `.env`, then retry.
New accounts start with no scheduled workouts or rest days. Re-running the
schema also clears only the old automatic workout template; custom schedules
are preserved.

### Push notifications

The Android app keeps an ongoing workout notification with an elapsed-time
counter. Social push notifications cover group messages, group workout posts,
and public workouts from followed athletes. Browser/PWA push requires HTTPS;
the local `http://192.168...` development address cannot receive Web Push.

1. Run the complete `supabase_schema.sql` in the same Supabase project.
2. In Firebase, enable Cloud Messaging, register an Android app with package
   `com.overgain.app`, and put its `google-services.json` at
   `android/app/google-services.json`. The file is ignored by Git.
3. Generate a Web Push certificate in Firebase. Copy `.env.example` to `.env`
   and fill its public Firebase Web configuration and VAPID public key.
4. Create a Firebase service account with the Firebase Cloud Messaging API
   Admin role. Store its complete JSON as the Supabase Edge Function secret
   `FIREBASE_SERVICE_ACCOUNT_JSON`; also set `APP_BASE_URL` to the HTTPS app
   origin. Do not put this service-account JSON in `.env`, frontend code, or Git.
5. Link this folder to the configured Supabase project and deploy
   `supabase/functions/send-notification` with
   `supabase functions deploy send-notification --project-ref <project-ref>`.
6. Run `npm run build` and `npx cap sync android`, then build/install the
   Android app again. In the app, open **Configurações → Notificações** and
   allow notifications on each device.

### Active workout sessions

An in-progress workout, including its set entries, is saved in local browser
storage for the signed-in account. It can be restored after closing and
reopening the app in the same browser on the same device. Active sessions are
not synchronized between devices.

`supabase_reset_old.sql` is a separate, irreversible cleanup for the old project
only. Verify the selected project reference in the Supabase Dashboard before
running it. Never put a Supabase `service_role` key in the frontend.
