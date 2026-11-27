import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

// Prevent browser "Install to Home Screen" / "Install App" prompts across mobile & desktop
if (typeof window !== 'undefined') {
  window.addEventListener(
    'beforeinstallprompt',
    (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
    },
    { capture: true }
  );

  // Register Service Worker for Web Push Notifications and offline caching
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker
        .register('/sw.js', { scope: '/' })
        .catch((err) => {
          console.warn('Mahasangh Service Worker registration failed:', err);
        });
    });
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
