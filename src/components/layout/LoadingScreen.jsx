import React from 'react';
import './LoadingScreen.css';

export default function LoadingScreen() {
  return (
    <main className="app-loading-screen" role="status" aria-live="polite">
      <div className="app-loading-brand">
        <img src="/pwa-192x192.png" alt="" className="app-loading-mark" />
        <strong className="app-loading-name">OVERGAIN</strong>
        <span className="app-loading-message">Preparando seu treino</span>
        <span className="app-loading-progress" aria-hidden="true">
          <span />
        </span>
      </div>
    </main>
  );
}
