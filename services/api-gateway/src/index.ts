import { app, config, logger } from "./app.js";

app
  .listen({ port: config.port, host: config.host })
  .then(() => {
    logger.info(
      { port: config.port, host: config.host },
      "Go.boda API Gateway listening"
    );
  })
  .catch((err) => {
    logger.error({ err }, "Failed to start Go.boda API Gateway");
    process.exit(1);
  });
