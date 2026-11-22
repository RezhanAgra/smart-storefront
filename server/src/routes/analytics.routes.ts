import { Router } from "express";
import { getAnalytics } from "../controllers/analytics.controller.js";
import { requireAuth } from "../middlewares/auth.middleware.js";

const router = Router();
router.get("/", requireAuth, getAnalytics);

export default router;
