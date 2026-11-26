import { app, HOST, logger, PORT } from "./app.js";

app
  .listen({ port: PORT, host: HOST })
  .then(() => {
    logger.info(
      { port: PORT, host: HOST },
      "Go.boda Trip Lifecycle Service listening"
    );
  })
  .catch((err) => {
    logger.error({ err }, "Failed to start Go.boda Trip Service");
    process.exit(1);
  });
