// Generates src/schema.ts from the API's OpenAPI document.
// Usage: npm run api:types                       (local API on :8080)
//        API_URL=https://api-dev.rentopia.in npm run api:types
import { execFileSync } from 'node:child_process';

const apiUrl = (process.env.API_URL || 'http://localhost:8080').replace(/\/+$/, '');
const source = `${apiUrl}/v3/api-docs`;
console.log(`Generating types from ${source}`);
execFileSync('npx', ['openapi-typescript', source, '-o', 'src/schema.ts'], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
});
