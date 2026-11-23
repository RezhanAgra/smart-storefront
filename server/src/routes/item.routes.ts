import { Router } from "express";
import { createItem, deleteItem, listItems, reorderItems, updateItem } from "../controllers/item.controller.js";
import { requireAuth } from "../middlewares/auth.middleware.js";

const router = Router();

router.use(requireAuth);
router.get("/", listItems);
router.post("/", createItem);
// Didaftarkan sebelum "/:id" agar "reorder" tidak dibaca sebagai id.
router.patch("/reorder", reorderItems);
router.put("/:id", updateItem);
router.delete("/:id", deleteItem);

export default router;
