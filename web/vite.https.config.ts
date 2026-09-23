import basicSsl from '@vitejs/plugin-basic-ssl';
import { defineConfig, mergeConfig } from 'vite';
import base from './vite.config';

// `npm run dev:https` serves over HTTPS on the LAN so an iPhone can use the microphone.
export default mergeConfig(base, defineConfig({ plugins: [basicSsl()], server: { https: {} } }));
