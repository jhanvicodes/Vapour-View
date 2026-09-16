import React, { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.jsx';

if (typeof window !== 'undefined') {
  window.React = React;
}

const root = createRoot(document.getElementById('root'));
root.render(
  React.createElement(StrictMode, null, React.createElement(App, null))
);
