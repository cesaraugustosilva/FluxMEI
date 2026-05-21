import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const defaultEnvFile = path.resolve(__dirname, '..', '..', '.env');

dotenv.config({ path: process.env.FLUXMEI_ENV_FILE || defaultEnvFile });
