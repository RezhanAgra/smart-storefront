import { Router } from "express";
import { downloadDigital, getOrderStatus, listOrders, updateTracking } from "../controllers/order.controller.js";
import { requireAuth } from "../middlewares/auth.middleware.js";

const router = Router();
router.get("/", requireAuth, listOrders);
router.get("/status/:orderCode", getOrderStatus);
router.get("/download/:orderCode", downloadDigital);
router.patch("/:id/tracking", requireAuth, updateTracking);

export default router;
