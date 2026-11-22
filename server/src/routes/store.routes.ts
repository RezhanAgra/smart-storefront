import { Router } from "express";
import { getStore } from "../controllers/store.controller.js";
import { trackEvent } from "../controllers/analytics.controller.js";

const router = Router();

router.get("/:username", getStore);
router.post("/:username/events", trackEvent);

export default router;
