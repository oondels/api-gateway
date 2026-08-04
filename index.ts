import { createApp } from "./src/app";
import { loadConfig } from "./src/config/dotenv";

const config = loadConfig();
const app = createApp(config);

const server = app.listen(config.port, "0.0.0.0", (error?: Error) => {
  if (error) {
    throw error;
  }

  console.log(
    `Dass API Gateway running on port ${config.port} in ${config.isDevelopment ? "Development" : "Production"} mode.`,
  );
});

let shuttingDown = false;

const shutdown = () => {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;

  const deadline = setTimeout(() => {
    console.error("Timed out while stopping Dass API Gateway; closing active connections.");
    server.closeAllConnections();
    process.exitCode = 1;
  }, 10_000);
  deadline.unref();

  server.closeIdleConnections();
  server.close((error) => {
    clearTimeout(deadline);
    if (error) {
      console.error("Failed to stop Dass API Gateway cleanly.", error);
      process.exitCode = 1;
    }
  });
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
