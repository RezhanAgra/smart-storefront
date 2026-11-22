declare global {
  namespace Express {
    interface Request {
      /** Diisi oleh middleware `requireAuth` setelah JWT terverifikasi. */
      userId?: string;
    }
  }
}

export {};
