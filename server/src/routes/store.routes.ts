import { Router } from "express";
import { getStore, listStores } from "../controllers/store.controller.js";
import { trackEvent } from "../controllers/analytics.controller.js";

const router = Router();

router.get("/", listStores);
router.get("/:username", getStore);
router.post("/:username/events", trackEvent);

export default router;
