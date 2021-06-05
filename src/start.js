import express from "express";
import logger from "loglevel";
import { addAsync } from "@awaitjs/express";
import createHttpError from "http-errors";
import { getRoutes } from "./routes/index.js";

import { newEnforcer } from "casbin";
import { MongooseAdapter } from "casbin-mongoose-adapter";

const adapter = await MongooseAdapter.newAdapter(
  "mongodb+srv://dbUser:B7sGMZCHxetKpNk4@personal-projects.rf3jq.mongodb.net",
  {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    dbName: "permissions",
    useCreateIndex: true,
  }
);

const model = new URL("./model.conf", import.meta.url);
const e = await newEnforcer(model.pathname, adapter);

const methodActionMap = {
  GET: "read",
  POST: "write",
  PUT: "write",
  PATCH: "write",
  DELETE: "write",
};

function startServer({ port = process.env.PORT || 80 } = {}) {
  const app = addAsync(express());

  app.useAsync(async (req, res, next) => {
    const action = methodActionMap[req.method];
    const resource = "recipes";
    const authorized = await e.enforce(123, resource, action);
    if (authorized) {
      next();
    }
    throw createHttpError(403);
  });

  app.useAsync("/api", getRoutes());

  app.useAsync((req, res, next) => {
    next(createHttpError(404));
  });

  app.useAsync(errorMiddleware);

  return new Promise((resolve) => {
    const server = app.listen(port, () => {
      logger.info(`Listening on port ${server.address().port}`);
      const originalClose = server.close.bind(server);
      server.close = () => {
        return new Promise((resolveClose) => {
          originalClose(resolveClose);
        });
      };
      setupCloseOnExit(server);
      resolve(server);
    });
  });
}

function errorMiddleware(error, req, res, next) {
  if (res.headersSent) {
    next(error);
  } else {
    logger.error({
      path: req.url,
      verb: req.method,
      message: error.message,
      stack: error.stack,
    });

    res.status(error.status || 500);
    res.json({
      message: error.message,
      status: error.status,
      // we only add a `stack` property in non-production environments
      ...(process.env.NODE_ENV === "production"
        ? null
        : { stack: error.stack }),
    });
  }
}

function setupCloseOnExit(server) {
  // thank you stack overflow
  // https://stackoverflow.com/a/14032965/971592
  async function exitHandler(options = {}) {
    await server
      .close()
      .then(() => {
        logger.info("Server successfully closed");
      })
      .catch((e) => {
        logger.warn("Something went wrong closing the server", e.stack);
      });
    // eslint-disable-next-line no-process-exit
    if (options.exit) process.exit();
  }

  // do something when app is closing
  process.on("exit", exitHandler);

  // catches ctrl+c event
  process.on("SIGINT", exitHandler.bind(null, { exit: true }));

  // catches "kill pid" (for example: nodemon restart)
  process.on("SIGUSR1", exitHandler.bind(null, { exit: true }));
  process.on("SIGUSR2", exitHandler.bind(null, { exit: true }));

  // catches uncaught exceptions
  process.on("uncaughtException", exitHandler.bind(null, { exit: true }));
}

export { startServer };
