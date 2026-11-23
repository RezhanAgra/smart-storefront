import { Router } from "express";
import { getOrderStatus, listOrders } from "../controllers/order.controller.js";
import { requireAuth } from "../middlewares/auth.middleware.js";

const router = Router();
router.get("/", requireAuth, listOrders);
router.get("/status/:orderCode", getOrderStatus);

export default router;
