import { lazyPage } from "@/lib/lazyPage";

// Dashboard pages load on demand. The dashboard shell preloads them in the
// background (preloadDashboardPages), so opening a page needs no download.
export const Settings = lazyPage(() => import("./pages/Settings"));
export const Analytics = lazyPage(() => import("./pages/Analytics"));
export const OrderChat = lazyPage(() => import("./pages/OrderChat"));
export const Products = lazyPage(() => import("./pages/Products"));
export const Warehouses = lazyPage(() => import("./pages/Warehouses"));
export const WarehouseDetail = lazyPage(() => import("./pages/WarehouseDetail"));
export const ProductNew = lazyPage(() => import("./pages/ProductNew"));
export const ProductEdit = lazyPage(() => import("./pages/ProductEdit"));
export const OrderDetail = lazyPage(() => import("./pages/OrderDetail"));
export const NewOrder = lazyPage(() => import("./pages/NewOrder"));
export const AbandonedDetail = lazyPage(() => import("./pages/AbandonedDetail"));
export const Customers = lazyPage(() => import("./pages/Customers"));
export const CustomerDetail = lazyPage(() => import("./pages/CustomerDetail"));
export const FacebookInbox = lazyPage(() => import("./pages/FacebookInbox"));
export const InstagramInbox = lazyPage(() => import("./pages/InstagramInbox"));
export const WhatsappInbox = lazyPage(() => import("./pages/WhatsappInbox"));
export const InboxOrders = lazyPage(() => import("./pages/InboxOrders"));
export const Studio = lazyPage(() => import("./pages/Studio"));
export const Billing = lazyPage(() => import("./pages/Billing"));
export const Returns = lazyPage(() => import("./pages/Returns"));
export const OnlineStore = lazyPage(() => import("./pages/OnlineStore"));
export const Overview = lazyPage(() => import("./pages/Overview"));
export const OrderProtection = lazyPage(() => import("./pages/OrderProtection"));
export const StaffPerformance = lazyPage(() => import("./pages/StaffPerformance"));
export const BusinessReport = lazyPage(() => import("./pages/BusinessReport"));
export const ActivityLog = lazyPage(() => import("./pages/ActivityLog"));
export const CampaignLinks = lazyPage(() => import("./pages/CampaignLinks"));
export const CampaignLinkDetail = lazyPage(() => import("./pages/CampaignLinkDetail"));

// Most used first; one at a time so the page being viewed keeps the bandwidth.
const PRELOAD_ORDER = [
  OrderDetail,
  NewOrder,
  Customers,
  CustomerDetail,
  Products,
  Returns,
  OrderProtection,
  Overview,
  Analytics,
  InboxOrders,
  FacebookInbox,
  InstagramInbox,
  WhatsappInbox,
  OrderChat,
  Warehouses,
  WarehouseDetail,
  AbandonedDetail,
  CampaignLinks,
  CampaignLinkDetail,
  StaffPerformance,
  ActivityLog,
  BusinessReport,
  OnlineStore,
  ProductNew,
  ProductEdit,
  Settings,
  Studio,
  Billing,
];

export async function preloadDashboardPages(): Promise<void> {
  for (const page of PRELOAD_ORDER) {
    // A failed download is retried when the page is opened.
    await page.preload().catch(() => undefined);
  }
}
