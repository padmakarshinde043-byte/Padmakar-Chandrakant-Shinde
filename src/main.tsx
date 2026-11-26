import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

// Prevent browser "Install to Home Screen" / "Install App" prompts across mobile & desktop
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
  });

  // Register clean offline Service Worker for 30-day caching and instant PWA performance
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker
        .register('/sw.js')
        .then((reg) => {
          console.log('Mahasangh PWA Service Worker registered successfully:', reg.scope);
        })
        .catch((err) => {
          console.warn('Mahasangh PWA Service Worker registration failed:', err);
        });
    });
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
