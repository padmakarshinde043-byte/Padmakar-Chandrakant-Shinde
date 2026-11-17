import React from 'react';
import ReactDOM from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import './index.css';

try {
  registerSW({
    immediate: true,
    onRegisteredSW(_swUrl, registration) {
      if (registration) {
        // Check for updated website builds cleanly once per hour
        setInterval(() => {
          registration.update().catch(() => {});
        }, 60 * 60 * 1000);
      }
    },
  });
} catch {
  // Ignore SW registration errors in restricted browsers/iframes
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
