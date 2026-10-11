import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));

export const ROOT_DIR = resolve(here, '..');

// Database lives in a project-local data directory. The location is resolved
// from the backend configuration, never from the browser/working directory.
export const DATA_DIR = process.env.SUBMATE_DATA_DIR
  ? resolve(process.env.SUBMATE_DATA_DIR)
  : join(ROOT_DIR, 'data');

export const DB_PATH = process.env.SUBMATE_DB_PATH
  ? resolve(process.env.SUBMATE_DB_PATH)
  : join(DATA_DIR, 'submate.sqlite');

export const DIST_DIR = join(ROOT_DIR, 'dist');

export const PORT = Number(process.env.SUBMATE_PORT || process.env.PORT || 3001);
export const HOST = process.env.HOST || '127.0.0.1';
