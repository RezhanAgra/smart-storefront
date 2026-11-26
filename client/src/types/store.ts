export type ItemType = "link" | "product";
export type OrderStatus = "PENDING" | "PAID" | "FAILED";

/** Item seperti yang dikirim oleh `GET /api/store/:username` (hanya item aktif). */
export interface StoreItem {
  id: string;
  type: ItemType;
  title: string;
  description: string | null;
  /** Harga dalam Rupiah, bilangan bulat. */
  price: number | null;
  stock: number | null;
  url: string | null;
  imageUrl: string | null;
  orderIndex: number;
  /** Produk digital: file bisa diunduh dari struk setelah lunas. */
  isDigital?: boolean | null;
  /** Barang fisik: checkout meminta nomor HP dan alamat pengiriman. */
  isPhysical?: boolean | null;
}

/** Item milik user di dashboard (`GET /api/items`), termasuk field internal. */
export interface DashboardItem extends StoreItem {
  userId: string;
  isActive: boolean;
  digitalFileKey: string | null;
  digitalFileName: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SocialLink {
  platform: string;
  url: string;
}

export type StorePayments =
  | { enabled: true; clientKey: string; snapJsUrl: string }
  | { enabled: false };

export interface PublicStoreProfile {
  username: string;
  displayName: string;
  bio: string | null;
  avatarUrl: string | null;
  themeColor: string;
  isVerified: boolean;
  socialLinks: SocialLink[];
  items: StoreItem[];
  payments: StorePayments;
}

/** Profil user yang login (`GET /api/auth/me`). */
export interface UserProfile {
  id: string;
  username: string;
  email: string;
  displayName: string;
  bio: string | null;
  avatarUrl: string | null;
  themeColor: string;
  isVerified: boolean;
  socialLinks: SocialLink[];
  role?: "SELLER" | "ADMIN" | null;
  /** Email sudah dikonfirmasi lewat tautan (syarat pencairan dana). */
  emailVerified?: boolean | null;
  isSuspended?: boolean | null;
  suspendedReason?: string | null;
  createdAt: string;
  updatedAt: string;
}

/** `GET /api/orders/status/:orderCode` (publik, untuk struk pembeli) */
export interface OrderReceipt {
  orderCode: string;
  buyerName: string;
  itemTitle: string;
  unitPrice: number;
  quantity: number;
  subtotal: number;
  couponCode: string | null;
  discountAmount: number;
  totalAmount: number;
  digital: { fileName: string; downloadsLeft: number } | null;
  needsShipping: boolean;
  trackingNumber: string | null;
  shippedAt: string | null;
  status: OrderStatus;
  paymentType: string | null;
  paidAt: string | null;
  createdAt: string;
  store: { displayName: string; username: string };
}

/** `POST /api/checkout` */
export interface CheckoutResponse {
  orderCode: string;
  token: string;
  redirectUrl: string;
  grossAmount: number;
}

/** `GET /api/orders` */
export interface Order {
  id: string;
  orderCode: string;
  itemTitle: string;
  quantity: number;
  grossAmount: number;
  couponCode: string | null;
  discountAmount: number | null;
  digitalFileName: string | null;
  downloadCount: number | null;
  shippingAddress: string | null;
  shippingPhone: string | null;
  trackingNumber: string | null;
  shippedAt: string | null;
  buyerName: string;
  buyerEmail: string;
  note: string | null;
  status: OrderStatus;
  paymentType: string | null;
  paidAt: string | null;
  createdAt: string;
}

/** `GET /api/analytics` */
export interface AnalyticsSummary {
  days: number;
  labels: string[];
  series: { views: number[]; clicks: number[]; revenue: number[]; paidOrders: number[] };
  totals: { views: number; clicks: number; paidOrders: number; revenue: number; pendingOrders: number };
  topItems: { id: string; title: string; type: ItemType; clicks: number; paidOrders: number; revenue: number }[];
}

export interface ApiError {
  message: string;
}

/** `GET /api/coupons` */
export interface Coupon {
  id: string;
  code: string;
  type: "PERCENT" | "FIXED";
  value: number;
  maxUses: number | null;
  usedCount: number;
  expiresAt: string | null;
  isActive: boolean;
  createdAt: string;
}

/** `POST /api/checkout/coupon` */
export interface CouponPreview {
  code: string;
  subtotal: number;
  discountAmount: number;
  total: number;
}

export type PayoutStatus = "PENDING" | "APPROVED" | "REJECTED";

export interface Payout {
  id: string;
  amount: number;
  bankName: string;
  accountNumber: string;
  accountHolder: string;
  status: PayoutStatus;
  adminNote: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Balance {
  totalRevenue: number;
  totalWithdrawn: number;
  pendingWithdrawal: number;
  availableBalance: number;
}

/** `GET /api/payouts/summary` */
export interface PayoutSummary extends Balance {
  minimumPayout: number;
  canWithdraw: boolean;
  emailVerified: boolean;
  isSuspended: boolean;
  history: Payout[];
}

export type ReportReason = "PHISHING" | "PENIPUAN" | "KONTEN_TERLARANG" | "LAINNYA";

/** `GET /api/admin/overview` */
export interface AdminOverview {
  users: {
    id: string;
    username: string;
    displayName: string;
    email: string;
    role: "SELLER" | "ADMIN";
    emailVerified: boolean;
    isSuspended: boolean;
    suspendedReason: string | null;
    createdAt: string;
    _count: { items: number; orders: number; reports: number };
  }[];
  reports: {
    id: string;
    reason: ReportReason;
    description: string;
    reporterEmail: string | null;
    status: "OPEN" | "RESOLVED" | "DISMISSED";
    createdAt: string;
    targetUser: { id: string; username: string; displayName: string; isSuspended: boolean | null };
  }[];
  payouts: (Payout & {
    seller: { id: string; username: string; displayName: string; email: string; isSuspended: boolean | null };
    sellerBalance: Balance;
  })[];
}
