import { Router } from "express";
import { createCheckout, midtransNotification, syncCheckout } from "../controllers/checkout.controller.js";

export const checkoutRouter = Router();
checkoutRouter.post("/", createCheckout);
checkoutRouter.post("/:orderCode/sync", syncCheckout);

export const paymentRouter = Router();
paymentRouter.post("/midtrans/notification", midtransNotification);
