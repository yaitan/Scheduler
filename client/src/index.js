/**
 * index.js
 *
 * React application entry point. Mounts the root <App /> component into the
 * #root DOM element defined in public/index.html.
 *
 * This file is intentionally minimal — all application logic lives in App.js
 * and the component/view tree below it.
 */

import React from 'react';
import ReactDOM from 'react-dom/client';
import './styles/global.css';
import App from './App';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);
