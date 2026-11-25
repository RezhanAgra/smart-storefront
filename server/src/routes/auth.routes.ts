import { Router } from "express";
import {
  changePassword,
  deleteAccount,
  forgotPassword,
  login,
  logout,
  me,
  register,
  resetPassword,
  updateProfile,
} from "../controllers/auth.controller.js";
import { requireAuth } from "../middlewares/auth.middleware.js";

const router = Router();

router.post("/register", register);
router.post("/login", login);
router.post("/logout", logout);
router.post("/forgot-password", forgotPassword);
router.post("/reset-password", resetPassword);
router.get("/me", requireAuth, me);
router.put("/profile", requireAuth, updateProfile);
router.put("/password", requireAuth, changePassword);
router.delete("/account", requireAuth, deleteAccount);

export default router;
