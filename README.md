# Wisp

Wisp is an anonymous, ephemeral real-time chat application. Users generate a nickname locally, create or join four-digit rooms, exchange text or meme audio, and can install the app as a progressive web app (PWA). No account is required.

Messages are intentionally temporary: Redis-backed rooms expire after 24 hours and messages expire after 3 hours. When Redis is not configured, the server uses an in-memory fallback suitable for local development only.

## Features

- Anonymous nicknames generated and stored in the browser
- Four-digit chat room keys with memorable room names
- Real-time messaging over Socket.IO
- HTTP polling fallback when WebSocket connectivity is unavailable
- Reply-to-message interactions, including swipe/drag gestures on mobile
- Text sanitization, profanity filtering, spam detection, and server-side rate limiting
- Meme audio search across MyInstants, Voicy, 101Soundboards, Freesound, Pixabay, and Mixkit
- Safe audio URL validation and a rate-limited MyInstants streaming proxy
- Optional Web Push notifications
- Optional Upstash Redis persistence with automatic in-memory fallback
- Installable PWA with offline app shell support
- Light and dark themes, responsive mobile-first UI, sound effects, and haptic feedback

## Requirements

- Node.js 20 or newer
- npm
- Upstash Redis (recommended for hosted deployments)
- VAPID keys (optional, only required for Web Push notifications)

## Quick start

```bash
git clone https://github.com/Tejas164321/Wisp.git
cd Wisp
npm install
cp .env.example .env.local
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

The app can run locally without Redis or push credentials. In that mode, messages and rooms exist only in the running Node.js process and are lost when the process restarts.

## Environment variables

Create `.env.local` for local development or configure the same variables in your hosting provider.

| Variable | Required | Purpose |
| --- | --- | --- |
| `UPSTASH_REDIS_REST_URL` | Recommended | Upstash Redis REST endpoint for room, message, and push-subscription persistence |
| `UPSTASH_REDIS_REST_TOKEN` | Recommended | Upstash Redis authentication token |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Optional | Public VAPID key used by browsers to subscribe to Web Push |
| `VAPID_PRIVATE_KEY` | Optional | Server-only VAPID private key used to send Web Push notifications |
| `APP_URL` | Optional | Public application URL used when configuring Web Push VAPID details |
| `GEMINI_API_KEY` | Optional | Gemini API key reserved for AI Studio/runtime integrations |

Never commit `.env.local`, Redis tokens, private VAPID keys, or other credentials. Use `.env.example` as the configuration template.

### Generating VAPID keys

If Web Push is enabled, generate a key pair with the `web-push` CLI:

```bash
npx web-push generate-vapid-keys
```

Set the public key in `NEXT_PUBLIC_VAPID_PUBLIC_KEY` and the private key in `VAPID_PRIVATE_KEY`. The public key is exposed to the browser; the private key must remain server-only.

## Available scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start the custom Next.js and Socket.IO server in development mode |
| `npm run build` | Create the production Next.js build |
| `npm start` | Start the custom server in production mode |
| `npm run lint` | Run ESLint |
| `npm run clean` | Clean Next.js build output |

For a production-like local run:

```bash
npm run build
npm start
```

The server listens on port `3000`. Set `HOSTNAME` when the process must bind to a specific interface; the default is `0.0.0.0`.

## How it works

### Client

- `app/page.tsx` contains the main chat experience and room UI.
- `context/SocketContext.tsx` owns the Socket.IO connection, room state, message state, local persistence, and polling fallback.
- `context/ThemeContext.tsx` manages the theme preference.
- `hooks/usePushNotifications.ts` manages browser notification permission and subscriptions.
- `public/sw.js` handles the PWA service worker and notification clicks.

The browser stores the generated nickname, client identifier, active room, and up to 20 recently joined rooms in `localStorage`. These values are not authentication credentials.

### Server

`server.ts` creates a Node HTTP server, attaches Socket.IO, and delegates regular requests to Next.js. Socket.IO handles room membership, presence counts, typing indicators, message delivery, and disconnect cleanup.

The HTTP API is used by the polling fallback and for browser push subscription management. All message paths apply server-side validation and sanitization; client-side validation is not a security boundary.

### Persistence and retention

When configured, Upstash Redis stores:

- Room records for 24 hours
- Message records for 3 hours
- Up to 200 recent message IDs per room
- Push subscriptions until removed or expired
- Short-lived presence and rate-limit keys

Without valid Redis credentials, the same interfaces use process memory. This fallback is useful for development but does not work reliably across multiple instances and is cleared on restart.

## HTTP API

### `GET /api/messages`

Fetch room history and refresh presence.

Query parameters:

- `roomKey`: required four-digit room key
- `nickname`: optional presence identity
- `clientId`: optional stable browser identity

Example:

```bash
curl 'http://localhost:3000/api/messages?roomKey=1234&clientId=local-client'
```

Returns:

```json
{
  "messages": [],
  "onlineCount": 1
}
```

### `POST /api/messages`

Submit a text or meme-audio message through the polling path.

Required fields:

- `roomKey`
- `nickname`
- `text` for text messages, or `type: "meme_audio"` with a validated `memeAudio` object

Optional fields include `clientId`, `replyToId`, `replyToNickname`, and `replyToText`.

### `POST /api/push`

Save a browser push subscription. The JSON body must include `clientId` and `subscription`.

### `DELETE /api/push?clientId=...`

Remove a saved browser push subscription.

### `GET /api/memes?query=...`

Search supported meme-audio providers. Results are normalized into the `MemeAudio` shape and cached briefly in memory.

### `GET /api/memes/stream?url=...`

Rate-limited audio proxy for approved MyInstants media URLs. The endpoint accepts byte-range requests so browser audio controls can seek when the upstream supports it.

## Message and room rules

- Room keys must contain exactly four digits.
- Socket messages are rate-limited to one message every five seconds per connection.
- Polling messages use a five-second Redis-backed rate limit when Redis is available.
- Empty messages, spam, unsupported audio providers, invalid URLs, and oversized payloads are rejected.
- Audio URLs must use HTTPS and match an approved provider host and path/extension rule.
- Room history is temporary and should not be treated as durable storage.

## Deployment

Wisp requires a long-running Node.js process because Socket.IO is hosted by the custom server. Deploy the project as a Node service rather than a static-only Next.js export.

General deployment steps:

```bash
npm ci
npm run build
npm start
```

Configure the environment variables in the hosting platform and expose the service on port `3000` (or use the platform's port mapping). Set `APP_URL` to the public HTTPS origin when using Web Push.

For multiple application instances, configure a shared Redis database and use a Socket.IO deployment design that supports cross-instance events/sticky sessions. The in-memory fallback is single-process only.

## Security and privacy notes

- Wisp provides anonymity, not strong anonymity guarantees. Network operators, hosting providers, and upstream services may still observe traffic.
- Do not use chat rooms for secrets or sensitive personal information.
- Keep Redis and VAPID credentials server-side.
- Review the terms and licensing requirements of each meme-audio provider before production use.
- The application validates external audio URLs to reduce SSRF and unsafe media risks, but upstream provider availability can change.

## Project structure

```text
app/                 Next.js pages and API routes
components/          Reusable UI components
context/             Client-side theme and Socket.IO state
hooks/               Browser hooks, including push notifications
lib/                 Redis, validation, message, room, and audio helpers
public/              PWA manifest, icons, and service worker
scripts/             Local utility scripts
server.ts            Custom HTTP + Next.js + Socket.IO entry point
```

## License

No license file is currently included. Treat the repository as all rights reserved unless the project owner adds an explicit license.
