import { registerSW } from 'virtual:pwa-register';
import './style.css';
import { App } from './ui/app';

registerSW({ immediate: true });

const root = document.getElementById('app');
if (root) void new App(root).init();
