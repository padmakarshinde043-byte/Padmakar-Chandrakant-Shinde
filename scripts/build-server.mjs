import { build } from 'esbuild';
import fs from 'fs';

await build({
  entryPoints: ['server.ts'],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  outfile: 'server.cjs',
  external: [
    'express',
    'cors',
    'razorpay',
    'nodemailer',
    'firebase',
    'firebase/*',
    'vite',
    'tsx',
  ],
  logLevel: 'info',
});

if (fs.existsSync('server.cjs')) {
  console.log(`Built server.cjs successfully (${fs.statSync('server.cjs').size} bytes).`);
}
