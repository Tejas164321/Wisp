import type { Metadata, Viewport } from 'next';
import './globals.css';
import { ThemeProvider } from '@/context/ThemeContext';
import { SocketProvider } from '@/context/SocketContext';

export const metadata: Metadata = {
  title: 'Wisp — Anonymous Realtime Chat',
  description: 'Whisper securely inside the single global room. Zero setup, zero accounts, automatically self-destructing messages.',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Wisp',
  },
  icons: {
    icon: [
      { url: '/favicon.png',      sizes: '16x16',  type: 'image/png' },
      { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
      { url: '/icon-192.png',     sizes: '192x192', type: 'image/png' },
      { url: '/icon-512.png',     sizes: '512x512', type: 'image/png' },
    ],
    apple: [
      { url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
    ],
  },
  other: {
    'mobile-web-app-capable': 'yes',
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: dark)',  color: '#09090B' },
    { media: '(prefers-color-scheme: light)', color: '#F4F4F5' },
  ],
  width: 'device-width',
  initialScale: 1,
  minimumScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        {/* Instant theme flash prevention */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var saved = localStorage.getItem('ghostroom_theme');
                  var theme = saved || 'dark';
                  if (theme === 'dark') {
                    document.documentElement.classList.add('dark');
                    document.documentElement.classList.remove('light');
                  } else {
                    document.documentElement.classList.add('light');
                    document.documentElement.classList.remove('dark');
                  }
                } catch (e) {}
              })();
            `
          }}
        />
        {/* Service Worker registration */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if ('serviceWorker' in navigator) {
                window.addEventListener('load', function() {
                  navigator.serviceWorker.register('/sw.js', { scope: '/' })
                    .then(function(reg) {
                      console.log('[Wisp SW] Registered:', reg.scope);
                    })
                    .catch(function(err) {
                      console.warn('[Wisp SW] Registration failed:', err);
                    });
                });
              }
            `
          }}
        />
      </head>
      <body
        className="antialiased bg-ghost-light-bg text-ghost-light-text dark:bg-ghost-dark-bg dark:text-ghost-dark-text min-h-screen selection:bg-zinc-200 dark:selection:bg-zinc-850"
        suppressHydrationWarning
      >
        <ThemeProvider>
          <SocketProvider>
            {children}
          </SocketProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
