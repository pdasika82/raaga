import { registerSW } from 'virtual:pwa-register';
import './style.css';
import { App } from './ui/app';

registerSW({
  immediate: true,
  onRegisteredSW(_url, registration) {
    if (!registration) return;
    const check = () => void registration.update();
    window.setInterval(check, 60 * 60 * 1000);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check(); });
  },
});

const root = document.getElementById('app');
if (root) void new App(root).init();
