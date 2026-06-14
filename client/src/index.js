import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import AuthWrapper from './auth/AuthWrapper';
import reportWebVitals from './reportWebVitals';
import { datadogRum } from '@datadog/browser-rum';
import { reactPlugin } from '@datadog/browser-rum-react';

datadogRum.init({
  applicationId: '74aebd4a-e928-49a7-be71-3c1253bbcc83',
  clientToken: 'pubef66923151fb0102898acc761191bf1a',
  site: 'datadoghq.eu',
  service: 'studyfocus',
  env: 'development',
  version: '1.0.0',
  sessionSampleRate: 100,
  sessionReplaySampleRate: 20,
  trackResources: true,
  trackUserInteractions: true,
  trackLongTasks: true,
  plugins: [reactPlugin({ router: false })],
});

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <AuthWrapper />
  </React.StrictMode>
);

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
