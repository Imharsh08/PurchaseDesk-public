/**
 * The form screens of the web app (new / edit indent, quotation, PO, amendment, goods receipt, bill,
 * stock count, import): the form's starting data from the API (src/lib/screens/forms loaders), then
 * the same view as the Next app. Saving goes through the actions bridge, which follows the action's
 * redirect. A loader can also answer { redirect } (e.g. a PO that is no longer a draft): followed here.
 */
import { useEffect } from "react";
import { useNavigate, useParams } from "react-router";
import { Importer } from "@/app/(app)/import/importer";
import { PageHeader } from "@/components/page-header";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AmendPurchaseOrderView } from "@/components/screens/amend-purchase-order";
import { BillFormView } from "@/components/screens/bill-form";
import { EditIndentView } from "@/components/screens/edit-indent";
import { EditPurchaseOrderView } from "@/components/screens/edit-purchase-order";
import { EditQuotationView } from "@/components/screens/edit-quotation";
import { NewIndentView } from "@/components/screens/new-indent";
import { NewPurchaseOrderView } from "@/components/screens/new-purchase-order";
import { NewQuotationView } from "@/components/screens/new-quotation";
import { ReceiveGoodsView } from "@/components/screens/receive-goods";
import { StockUpdateView } from "@/components/screens/stock-update";
import type {
  loadAmendForm,
  loadBillForm,
  loadEditIndentForm,
  loadEditPurchaseOrderForm,
  loadEditQuotationForm,
  loadNewIndentForm,
  loadNewPurchaseOrderScreen,
  loadNewQuotationForm,
  loadReceiveForm,
  loadStockUpdateForm,
} from "@/lib/screens/forms";
import { useTitle } from "../app-shell";
import { Screen, useApi, useIdParam, useSearchObject } from "../screen";
import { useCan, useSession } from "../session";

type Loaded<F extends (...args: never[]) => unknown> = Awaited<ReturnType<F>>;
type Redirect = { redirect: string };

const useUser = () => useSession().me!.user;
const isRedirect = (data: unknown): data is Redirect => typeof data === "object" && data !== null && "redirect" in data;

/** A form's data: a { redirect } answer replaces this page with where the loader sent it. */
function FormScreen<T>({ path, children }: { path: string | null; children: (data: T) => React.ReactNode }) {
  const state = useApi<T | Redirect>(path);
  const navigate = useNavigate();
  const to = isRedirect(state.data) ? state.data.redirect : null;
  useEffect(() => {
    if (to) navigate(to, { replace: true });
  }, [to, navigate]);
  if (to) return null;
  return <Screen state={state}>{(d) => children(d as T)}</Screen>;
}

/** "?items=12:250" pre-fills lines (from the stock screen). */
export function NewIndentPage() {
  useTitle("New indent");
  const user = useUser();
  const { items } = useSearchObject();
  const path = `/forms/indents/new${items ? `?items=${encodeURIComponent(items)}` : ""}`;
  return <FormScreen<Loaded<typeof loadNewIndentForm>> path={path}>{(d) => <NewIndentView {...d} user={user} />}</FormScreen>;
}

export function EditIndentPage() {
  useTitle("Edit indent");
  const id = useIdParam();
  return <FormScreen<Loaded<typeof loadEditIndentForm>> path={`/forms/indents/${id}/edit`}>{(d) => <EditIndentView {...d} id={id} />}</FormScreen>;
}

export function NewQuotationPage() {
  useTitle("Add quotation");
  const indentId = useIdParam();
  return (
    <FormScreen<Loaded<typeof loadNewQuotationForm>> path={`/forms/indents/${indentId}/quotations/new`}>
      {(d) => <NewQuotationView {...d} indentId={indentId} />}
    </FormScreen>
  );
}

export function EditQuotationPage() {
  useTitle("Edit quotation");
  const indentId = useIdParam();
  const quotationId = Number(useParams().qid);
  const { added } = useSearchObject();
  return (
    <FormScreen<Loaded<typeof loadEditQuotationForm>> path={`/forms/indents/${indentId}/quotations/${quotationId}/edit`}>
      {(d) => <EditQuotationView {...d} added={added} indentId={indentId} quotationId={quotationId} />}
    </FormScreen>
  );
}

export function NewPurchaseOrderPage() {
  useTitle("New purchase order");
  const user = useUser();
  return <FormScreen<Loaded<typeof loadNewPurchaseOrderScreen>> path="/forms/purchase-orders/new">{(d) => <NewPurchaseOrderView {...d} user={user} />}</FormScreen>;
}

export function EditPurchaseOrderPage() {
  useTitle("Edit purchase order");
  const user = useUser();
  const poId = useIdParam();
  return (
    <FormScreen<Loaded<typeof loadEditPurchaseOrderForm>> path={`/forms/purchase-orders/${poId}/edit`}>
      {(d) => <EditPurchaseOrderView {...d} user={user} />}
    </FormScreen>
  );
}

export function AmendPurchaseOrderPage() {
  useTitle("Amend purchase order");
  const user = useUser();
  const id = useIdParam();
  return (
    <FormScreen<Loaded<typeof loadAmendForm>> path={`/forms/purchase-orders/${id}/amend`}>
      {(d) => <AmendPurchaseOrderView {...d} id={id} user={user} />}
    </FormScreen>
  );
}

/** ?po= the order being received. */
export function ReceiveGoodsPage() {
  useTitle("Receive material");
  const sp = useSearchObject();
  return (
    <FormScreen<Loaded<typeof loadReceiveForm>> path={`/forms/goods-receipts/new?po=${encodeURIComponent(sp.po ?? "")}`}>
      {(d) => <ReceiveGoodsView {...d} sp={sp} />}
    </FormScreen>
  );
}

/** ?grn= the checked receipt the bill is for. */
export function BillFormPage() {
  useTitle("Enter bill");
  const sp = useSearchObject();
  return (
    <FormScreen<Loaded<typeof loadBillForm>> path={`/forms/bills/new?grn=${encodeURIComponent(sp.grn ?? "")}`}>
      {(d) => <BillFormView {...d} sp={sp} />}
    </FormScreen>
  );
}

export function StockUpdatePage() {
  useTitle("Update stock");
  return <FormScreen<Loaded<typeof loadStockUpdateForm>> path="/forms/stock/update">{(d) => <StockUpdateView {...d} />}</FormScreen>;
}

/** Nothing to load: the importer reads the file in the browser and sends rows to the import action. */
export function ImportPage() {
  useTitle("Import from Excel");
  const can = useCan();
  if (!can("importData"))
    return (
      <Alert variant="destructive">
        <AlertDescription>You don&apos;t have permission to do that.</AlertDescription>
      </Alert>
    );
  return (
    <div className="space-y-6">
      <PageHeader
        title="Import from Excel"
        description="Load items, vendors, opening stock, vendor items (who supplies what) and unit conversions in bulk. Each row is checked; rows with errors are skipped and listed."
      />
      <Importer />
    </div>
  );
}
