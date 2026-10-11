import { createApp } from './app.js';
import { getDatabase } from './db/connection.js';
import { DB_PATH, HOST, PORT } from './config.js';

function start() {
  let db;
  try {
    db = getDatabase();
  } catch (error) {
    console.error('SubMate could not initialize the SQLite database.');
    console.error(`Database location: ${DB_PATH}`);
    console.error(`Reason: ${error.message}`);
    process.exit(1);
  }

  const app = createApp({ db });

  const server = app.listen(PORT, HOST, () => {
    console.log(`SubMate backend running at http://${HOST}:${PORT}`);
    console.log(`SQLite database: ${DB_PATH}`);
  });

  server.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
      console.error(`Port ${PORT} is already in use. Set SUBMATE_PORT to choose another port.`);
    } else {
      console.error(`Failed to start the server: ${error.message}`);
    }
    process.exit(1);
  });

  const shutdown = () => {
    server.close(() => process.exit(0));
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

start();
