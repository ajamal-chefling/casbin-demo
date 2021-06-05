import { Router } from "@awaitjs/express";
import createHttpError from "http-errors";

function getRoutes() {
  const router = Router();

  router.getAsync("/math", async (req, res) => {
    throw createHttpError(400, "Ops!");
  });

  return router;
}

export { getRoutes };
