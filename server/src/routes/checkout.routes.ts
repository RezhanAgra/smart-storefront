import { Router } from "express";
import { createCheckout, midtransNotification, previewCoupon, syncCheckout } from "../controllers/checkout.controller.js";

export const checkoutRouter = Router();
checkoutRouter.post("/", createCheckout);
checkoutRouter.post("/coupon", previewCoupon);
checkoutRouter.post("/:orderCode/sync", syncCheckout);

export const paymentRouter = Router();
paymentRouter.post("/midtrans/notification", midtransNotification);
