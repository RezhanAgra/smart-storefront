import { Router } from "express";
import { createReport } from "../controllers/report.controller.js";
import { reportLimiter } from "../middlewares/rate-limit.middleware.js";

const router = Router();
router.post("/", reportLimiter, createReport);

export default router;
