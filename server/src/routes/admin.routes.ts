import { Router } from "express";
import { decidePayout, getOverview, setReportStatus, setSuspended } from "../controllers/admin.controller.js";
import { requireAdmin, requireAuth } from "../middlewares/auth.middleware.js";

const router = Router();
router.use(requireAuth, requireAdmin);
router.get("/overview", getOverview);
router.patch("/users/:id/suspend", setSuspended);
router.patch("/reports/:id", setReportStatus);
router.patch("/payouts/:id", decidePayout);

export default router;
