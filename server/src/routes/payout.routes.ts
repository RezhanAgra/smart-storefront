import { Router } from "express";
import { getPayoutSummary, requestPayout } from "../controllers/payout.controller.js";
import { requireAuth } from "../middlewares/auth.middleware.js";

const router = Router();
router.use(requireAuth);
router.get("/summary", getPayoutSummary);
router.post("/", requestPayout);

export default router;
