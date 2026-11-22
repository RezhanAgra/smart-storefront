import type { Request, Response } from "express";
import { prisma } from "../lib/prisma.js";
import { isObjectId } from "../lib/validation.js";

const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;
/** Tanggal kalender WIB (YYYY-MM-DD), karena pengguna utamanya di Indonesia. */
const wibDay = (date: Date) => new Date(date.getTime() + WIB_OFFSET_MS).toISOString().slice(0, 10);

/**
 * POST /api/store/:username/events?type=view|click&itemId=...
 * Publik dan tanpa body (simple request, tanpa preflight CORS) supaya ringan dari halaman toko.
 */
export async function trackEvent(req: Request, res: Response): Promise<void> {
  const type = req.query.type;
  const itemId = req.query.itemId;
  if (type !== "view" && type !== "click") {
    res.status(400).json({ message: "type harus view atau click." });
    return;
  }

  const user = await prisma.user.findUnique({
    where: { username: String(req.params.username ?? "").toLowerCase() },
    select: { id: true },
  });
  if (!user) {
    res.status(404).end();
    return;
  }

  let validItemId: string | null = null;
  if (type === "click") {
    if (!isObjectId(itemId)) {
      res.status(400).json({ message: "itemId wajib untuk click." });
      return;
    }
    const item = await prisma.item.findFirst({ where: { id: itemId, userId: user.id }, select: { id: true } });
    if (!item) {
      res.status(404).end();
      return;
    }
    validItemId = item.id;
  }

  await prisma.analyticsEvent.create({ data: { userId: user.id, type, itemId: validItemId } });
  res.status(204).end();
}

/** GET /api/analytics?days=14: ringkasan untuk dashboard penjual. */
export async function getAnalytics(req: Request, res: Response): Promise<void> {
  const userId = req.userId!;
  const days = [7, 14, 30].includes(Number(req.query.days)) ? Number(req.query.days) : 14;

  // Hari pertama periode dimulai pukul 00:00 WIB.
  const todayWib = wibDay(new Date());
  const since = new Date(Date.parse(`${todayWib}T00:00:00+07:00`) - (days - 1) * 86_400_000);

  const [events, orders, items] = await Promise.all([
    prisma.analyticsEvent.findMany({
      where: { userId, createdAt: { gte: since } },
      select: { type: true, itemId: true, createdAt: true },
    }),
    prisma.order.findMany({
      where: { userId, createdAt: { gte: since } },
      select: { itemId: true, status: true, grossAmount: true, quantity: true, createdAt: true, paidAt: true },
    }),
    prisma.item.findMany({ where: { userId }, select: { id: true, title: true, type: true } }),
  ]);

  const labels = Array.from({ length: days }, (_, i) => wibDay(new Date(since.getTime() + i * 86_400_000)));
  const index = new Map(labels.map((d, i) => [d, i]));
  const zeros = () => labels.map(() => 0);
  const series = { views: zeros(), clicks: zeros(), revenue: zeros(), paidOrders: zeros() };

  const perItem = new Map<string, { clicks: number; paidOrders: number; revenue: number }>();
  const itemStats = (id: string) => {
    let s = perItem.get(id);
    if (!s) perItem.set(id, (s = { clicks: 0, paidOrders: 0, revenue: 0 }));
    return s;
  };

  for (const e of events) {
    const i = index.get(wibDay(e.createdAt));
    if (i === undefined) continue;
    if (e.type === "view") series.views[i]!++;
    else if (e.type === "click") {
      series.clicks[i]!++;
      if (e.itemId) itemStats(e.itemId).clicks++;
    }
  }

  let pendingOrders = 0;
  for (const o of orders) {
    if (o.status === "PENDING") pendingOrders++;
    if (o.status !== "PAID") continue;
    const i = index.get(wibDay(o.paidAt ?? o.createdAt));
    if (i !== undefined) {
      series.revenue[i]! += o.grossAmount;
      series.paidOrders[i]!++;
    }
    const s = itemStats(o.itemId);
    s.paidOrders++;
    s.revenue += o.grossAmount;
  }

  const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
  const totals = {
    views: sum(series.views),
    clicks: sum(series.clicks),
    paidOrders: sum(series.paidOrders),
    revenue: sum(series.revenue),
    pendingOrders,
  };

  const titles = new Map(items.map((it) => [it.id, it]));
  const topItems = [...perItem.entries()]
    .map(([id, s]) => ({
      id,
      title: titles.get(id)?.title ?? "(item sudah dihapus)",
      type: titles.get(id)?.type ?? "product",
      ...s,
    }))
    .sort((a, b) => b.revenue - a.revenue || b.clicks - a.clicks)
    .slice(0, 5);

  res.json({ days, labels, series, totals, topItems });
}
