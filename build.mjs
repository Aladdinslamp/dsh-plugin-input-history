/**
 * Build script: bundles the browser half into the exact DSH client-module
 * protocol observed in official plugin bundles (dsh-client-modules):
 *
 *   window.__ModuleLoader__.load({
 *     id: "<package name>",
 *     factory: (require) => {
 *       var module = { exports: {} };
 *       var exports = module.exports;
 *       ...bundled CJS body (react stays external, resolved from the
 *          platform module table)...
 *       return module.exports;
 *     }
 *   });
 */
import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import pkg from './package.json' with { type: 'json' };

const result = await build({
  entryPoints: ['src/client/index.ts'],
  bundle: true,
  format: 'cjs',
  platform: 'browser',
  jsx: 'automatic',
  external: ['react', 'react/jsx-runtime', 'react-dom', 'react-dom/client'],
  write: false,
  logLevel: 'info',
  legalComments: 'none',
});

const body = result.outputFiles[0].text;
const client = `window.__ModuleLoader__.load({
\tid: ${JSON.stringify(pkg.name)},
\tfactory: (require) => {
\t\tvar module = { exports: {} };
\t\tvar exports = module.exports;
\t\t${body}
\t\treturn module.exports;
\t}
});
`;

mkdirSync('lib', { recursive: true });
writeFileSync('lib/client.js', client);
copyFileSync('src/index.host.js', 'lib/index.js');
console.log('built lib/client.js and lib/index.js');
