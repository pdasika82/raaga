import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { fixturePcm, encodeWav } from './fixture-audio.ts';
const directory = new URL('../../web2/public/demo/', import.meta.url);
await mkdir(directory, { recursive: true });
for (const [name, cents] of [['good', 0], ['off-key', 100]] as const) {
  await writeFile(new URL(`${name}.wav`, directory), encodeWav(fixturePcm(cents)));
}
console.log(`Generated two labeled synthetic audio fixtures in ${fileURLToPath(directory)}`);
