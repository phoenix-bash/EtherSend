import { buildApp } from "./app.js";
import { env } from "./config/env.js";

async function start(): Promise<void> {
  const app = await buildApp();

  try {
    await app.listen({
      host: "0.0.0.0",
      port: env.PORT
    });
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
}

void start();
