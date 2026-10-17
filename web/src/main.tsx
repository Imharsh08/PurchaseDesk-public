import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ThemeProvider } from "next-themes";
import { BrowserRouter, Route, Routes } from "react-router";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppShell } from "./app-shell";
import {
  AmendPurchaseOrderPage,
  BillFormPage,
  EditIndentPage,
  EditPurchaseOrderPage,
  EditQuotationPage,
  ImportPage,
  NewIndentPage,
  NewPurchaseOrderPage,
  NewQuotationPage,
  ReceiveGoodsPage,
  StockUpdatePage,
} from "./pages/forms";
import { AuthCallbackPage, LoginPage } from "./pages/login";
import { PurchaseOrdersPage } from "./pages/purchase-orders";
import {
  ApprovalsPage,
  BillPage,
  BillsPage,
  DashboardPage,
  DebitNotePage,
  FmsPage,
  GoodsReceiptPage,
  GoodsReceiptsPage,
  IndentPage,
  IndentsPage,
  ItemPage,
  ItemsPage,
  NotYetPage,
  PurchaseOrderPage,
  QuotationsPage,
  ReportsPage,
  SettingsPage,
  StockPage,
  UsersPage,
  VendorPage,
  VendorsPage,
} from "./pages/screens";
import { installFileLinks } from "./files";
import { RequireAuth, SessionProvider } from "./session";
import "./styles.css";

installFileLinks();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem disableTransitionOnChange>
      <TooltipProvider>
        <BrowserRouter>
          <SessionProvider>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/auth/callback" element={<AuthCallbackPage />} />
              {/* Printable, without the app frame (as in the Next app). */}
              <Route
                path="/debit-note/:id"
                element={
                  <RequireAuth>
                    <DebitNotePage />
                  </RequireAuth>
                }
              />
              {/* The same addresses as the Next app: shared screens link to them. */}
              <Route
                element={
                  <RequireAuth>
                    <AppShell />
                  </RequireAuth>
                }
              >
                <Route index element={<DashboardPage />} />
                <Route path="/approvals" element={<ApprovalsPage />} />
                <Route path="/fms" element={<FmsPage />} />
                <Route path="/reports" element={<ReportsPage />} />
                <Route path="/indents" element={<IndentsPage />} />
                <Route path="/indents/new" element={<NewIndentPage />} />
                <Route path="/indents/:id" element={<IndentPage />} />
                <Route path="/indents/:id/edit" element={<EditIndentPage />} />
                <Route path="/indents/:id/quotations/new" element={<NewQuotationPage />} />
                <Route path="/indents/:id/quotations/:qid/edit" element={<EditQuotationPage />} />
                <Route path="/quotations" element={<QuotationsPage />} />
                <Route path="/purchase-orders" element={<PurchaseOrdersPage />} />
                <Route path="/purchase-orders/new" element={<NewPurchaseOrderPage />} />
                <Route path="/purchase-orders/:id" element={<PurchaseOrderPage />} />
                <Route path="/purchase-orders/:id/edit" element={<EditPurchaseOrderPage />} />
                <Route path="/purchase-orders/:id/amend" element={<AmendPurchaseOrderPage />} />
                <Route path="/goods-receipts" element={<GoodsReceiptsPage />} />
                <Route path="/goods-receipts/new" element={<ReceiveGoodsPage />} />
                <Route path="/goods-receipts/:id" element={<GoodsReceiptPage />} />
                <Route path="/bills" element={<BillsPage />} />
                <Route path="/bills/new" element={<BillFormPage />} />
                <Route path="/bills/:id" element={<BillPage />} />
                <Route path="/stock" element={<StockPage />} />
                <Route path="/stock/update" element={<StockUpdatePage />} />
                <Route path="/vendors" element={<VendorsPage />} />
                <Route path="/vendors/:id" element={<VendorPage />} />
                <Route path="/items" element={<ItemsPage />} />
                <Route path="/items/:id" element={<ItemPage />} />
                <Route path="/import" element={<ImportPage />} />
                <Route path="/users" element={<UsersPage />} />
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="*" element={<NotYetPage title="Page not found" />} />
              </Route>
            </Routes>
          </SessionProvider>
        </BrowserRouter>
      </TooltipProvider>
      <Toaster richColors position="top-right" />
    </ThemeProvider>
  </StrictMode>,
);
