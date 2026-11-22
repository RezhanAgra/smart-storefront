import { Router } from "express";
import { listOrders } from "../controllers/order.controller.js";
import { requireAuth } from "../middlewares/auth.middleware.js";

const router = Router();
router.get("/", requireAuth, listOrders);

export default router;
