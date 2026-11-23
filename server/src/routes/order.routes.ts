import { Router } from "express";
import { downloadDigital, getOrderStatus, listOrders } from "../controllers/order.controller.js";
import { requireAuth } from "../middlewares/auth.middleware.js";

const router = Router();
router.get("/", requireAuth, listOrders);
router.get("/status/:orderCode", getOrderStatus);
router.get("/download/:orderCode", downloadDigital);

export default router;
