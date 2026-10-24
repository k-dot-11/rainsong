import React, { useState, useEffect, useCallback } from "react";
import { TopNav } from "./components/TopNav";
import { WhatsAppChat } from "./components/WhatsAppChat";
import { MerchantConsole } from "./components/MerchantConsole";
import { DocumentModal } from "./components/DocumentModal";
import { Product, Quotation, Invoice, AgentToolTrace } from "@shared/types";

export const App: React.FC = () => {
  const [viewMode, setViewMode] = useState<"buyer" | "manager">("buyer");
  const [products, setProducts] = useState<Product[]>([]);
  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [traces, setTraces] = useState<AgentToolTrace[]>([]);
  const [activeDocument, setActiveDocument] = useState<
    { type: "quotation"; data: Quotation } | { type: "invoice"; data: Invoice } | null
  >(null);

  const fetchState = useCallback(async () => {
    try {
      const res = await fetch("/api/agent/state");
      if (res.ok) {
        const data = (await res.json()) as {
          products?: Product[];
          quotations?: Quotation[];
          invoices?: Invoice[];
          traces?: AgentToolTrace[];
        };
        if (data.products) setProducts(data.products);
        if (data.quotations) setQuotations(data.quotations);
        if (data.invoices) setInvoices(data.invoices);
        if (data.traces) setTraces(data.traces);
      }
    } catch (e) {
      console.warn("Failed to fetch agent state:", e);
    }
  }, []);

  useEffect(() => {
    fetchState();
    const interval = setInterval(fetchState, 5000);
    return () => clearInterval(interval);
  }, [fetchState]);

  const pendingApprovalsCount = quotations.filter((q) => q.status === "PENDING_APPROVAL").length;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col selection:bg-orange-500 selection:text-white">
      <TopNav
        viewMode={viewMode}
        setViewMode={setViewMode}
        pendingApprovalsCount={pendingApprovalsCount}
      />

      <main className="flex-1">
        {viewMode === "buyer" ? (
          <WhatsAppChat
            onViewDocument={setActiveDocument}
            quotations={quotations}
            invoices={invoices}
            traces={traces}
            refreshState={fetchState}
          />
        ) : (
          <MerchantConsole
            products={products}
            quotations={quotations}
            invoices={invoices}
            traces={traces}
            onViewDocument={setActiveDocument}
            refreshState={fetchState}
          />
        )}
      </main>

      <DocumentModal
        document={activeDocument}
        onClose={() => setActiveDocument(null)}
      />
    </div>
  );
};

export default App;
