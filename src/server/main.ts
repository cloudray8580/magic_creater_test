import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createApp } from './app.js';
import { loadConfig, type ServerConfig } from './config.js';
export async function startServer(config: ServerConfig) {
  const context = await createApp(config);
  try {
    await context.app.listen({ host: config.host, port: config.port });
    return context;
  } catch (error) {
    await context.app.close();
    throw error;
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  startServer(loadConfig())
    .then(({ app }) => {
      for (const signal of ['SIGTERM', 'SIGINT'])
        process.once(signal, () => {
          void app.close();
        });
    })
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
}
