import { Router } from "express";
import { createCoupon, deleteCoupon, listCoupons, updateCoupon } from "../controllers/coupon.controller.js";
import { requireAuth } from "../middlewares/auth.middleware.js";

const router = Router();
router.use(requireAuth);
router.get("/", listCoupons);
router.post("/", createCoupon);
router.put("/:id", updateCoupon);
router.delete("/:id", deleteCoupon);

export default router;
