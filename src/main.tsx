import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

// Prevent browser "Install to Home Screen" / "Install App" prompts across mobile & desktop
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
  });

  // Unregister any previously installed legacy PWA Service Workers & purge old workbox caches
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker
      .getRegistrations()
      .then((registrations) => {
        for (const registration of registrations) {
          registration.unregister().catch(() => {});
        }
      })
      .catch(() => {});
  }

  if ('caches' in window) {
    caches
      .keys()
      .then((keys) => {
        for (const key of keys) {
          if (
            key.startsWith('workbox-') ||
            key.includes('vite-pwa') ||
            key === 'server-uploads-images-cache' ||
            key === 'cloudinary-images-cache' ||
            key === 'google-fonts-cache' ||
            key === 'gstatic-fonts-cache'
          ) {
            caches.delete(key).catch(() => {});
          }
        }
      })
      .catch(() => {});
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
