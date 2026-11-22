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
}

/** Item milik user di dashboard (`GET /api/items`), termasuk field internal. */
export interface DashboardItem extends StoreItem {
  userId: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
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
  createdAt: string;
  updatedAt: string;
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
