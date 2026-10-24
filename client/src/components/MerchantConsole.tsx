import React, { useState } from "react";
import {
  ShieldAlert,
  CheckCircle,
  FileText,
  Activity,
  Layers,
  Search,
  TrendingUp,
  Clock,
  ExternalLink,
} from "lucide-react";
import { Product, Quotation, Invoice, AgentToolTrace, QuoteItem } from "@shared/types";

interface MerchantConsoleProps {
  products: Product[];
  quotations: Quotation[];
  invoices: Invoice[];
  traces: AgentToolTrace[];
  onViewDocument: (doc: { type: "quotation"; data: Quotation } | { type: "invoice"; data: Invoice }) => void;
  refreshState: () => void;
}

export const MerchantConsole: React.FC<MerchantConsoleProps> = ({
  products,
  quotations,
  invoices,
  traces,
  onViewDocument,
  refreshState,
}) => {
  const [activeTab, setActiveTab] = useState<"approvals" | "traces" | "catalog" | "invoices">("approvals");
  const [counterRates, setCounterRates] = useState<Record<string, number>>({});
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [catalogSearch, setCatalogSearch] = useState("");

  const pendingApprovals = quotations.filter((q) => q.status === "PENDING_APPROVAL");

  // Calculate high-level KPIs
  const totalSales = invoices.reduce((sum, inv) => sum + inv.total, 0);

  const handleApprove = async (quoteNumber: string) => {
    setActionLoading(quoteNumber);
    try {
      const res = await fetch("/api/manager/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          quoteNumber,
          note: "Approved by Merchant Manager after margin review.",
        }),
      });
      if (!res.ok) throw new Error("Approval failed");
      await refreshState();
    } catch (e) {
      console.error(e);
      alert("Failed to submit approval");
    } finally {
      setActionLoading(null);
    }
  };

  const handleCounter = async (quoteNumber: string) => {
    const rate = counterRates[quoteNumber];
    if (!rate || rate <= 0) {
      alert("Please enter a valid counter rate per unit.");
      return;
    }

    setActionLoading(quoteNumber);
    try {
      const res = await fetch("/api/manager/counter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          quoteNumber,
          counterRate: rate,
          note: `Manager counter-offer: ₹${rate} / unit`,
        }),
      });
      if (!res.ok) throw new Error("Counter offer failed");
      await refreshState();
    } catch (e) {
      console.error(e);
      alert("Failed to submit counter offer");
    } finally {
      setActionLoading(null);
    }
  };

  const filteredProducts = products.filter(
    (p: Product) =>
      p.name.toLowerCase().includes(catalogSearch.toLowerCase()) ||
      p.sku.toLowerCase().includes(catalogSearch.toLowerCase()) ||
      p.nicknames.some((n: string) => n.toLowerCase().includes(catalogSearch.toLowerCase()))
  );

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-6 animate-fadeIn">
      {/* KPI Highlights Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl flex items-center justify-between">
          <div>
            <span className="text-xs uppercase font-semibold text-slate-400">Total Invoiced Sales</span>
            <p className="text-2xl font-bold text-white mt-1">₹{totalSales.toLocaleString("en-IN")}</p>
            <span className="text-xs text-emerald-400 flex items-center gap-1 mt-1 font-medium">
              <TrendingUp className="w-3.5 h-3.5" /> {invoices.length} orders billed
            </span>
          </div>
          <div className="w-12 h-12 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
            <TrendingUp className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl flex items-center justify-between">
          <div>
            <span className="text-xs uppercase font-semibold text-slate-400">Pending Margin Approvals</span>
            <p className="text-2xl font-bold text-amber-400 mt-1">{pendingApprovals.length}</p>
            <span className="text-xs text-slate-400 mt-1 block">Requires manager sign-off</span>
          </div>
          <div className="w-12 h-12 rounded-xl bg-amber-500/10 text-amber-400 flex items-center justify-center">
            <ShieldAlert className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl flex items-center justify-between">
          <div>
            <span className="text-xs uppercase font-semibold text-slate-400">Total Quotations</span>
            <p className="text-2xl font-bold text-white mt-1">{quotations.length}</p>
            <span className="text-xs text-slate-400 mt-1 block">Active edge sessions</span>
          </div>
          <div className="w-12 h-12 rounded-xl bg-indigo-500/10 text-indigo-400 flex items-center justify-center">
            <FileText className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl flex items-center justify-between">
          <div>
            <span className="text-xs uppercase font-semibold text-slate-400">Catalog SKUs</span>
            <p className="text-2xl font-bold text-white mt-1">{products.length}</p>
            <span className="text-xs text-slate-400 mt-1 block">DO SQLite storage</span>
          </div>
          <div className="w-12 h-12 rounded-xl bg-orange-500/10 text-orange-400 flex items-center justify-center">
            <Layers className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Tabs Header */}
      <div className="flex border-b border-slate-800 space-x-2">
        <button
          onClick={() => setActiveTab("approvals")}
          className={`flex items-center space-x-2 py-3 px-4 border-b-2 font-medium text-sm transition ${
            activeTab === "approvals"
              ? "border-amber-500 text-amber-400"
              : "border-transparent text-slate-400 hover:text-slate-200"
          }`}
        >
          <ShieldAlert className="w-4 h-4" />
          <span>Margin Approvals</span>
          {pendingApprovals.length > 0 && (
            <span className="px-1.5 py-0.5 rounded-full text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
              {pendingApprovals.length}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab("traces")}
          className={`flex items-center space-x-2 py-3 px-4 border-b-2 font-medium text-sm transition ${
            activeTab === "traces"
              ? "border-emerald-500 text-emerald-400"
              : "border-transparent text-slate-400 hover:text-slate-200"
          }`}
        >
          <Activity className="w-4 h-4" />
          <span>Live Agent Trace ({traces.length})</span>
        </button>

        <button
          onClick={() => setActiveTab("catalog")}
          className={`flex items-center space-x-2 py-3 px-4 border-b-2 font-medium text-sm transition ${
            activeTab === "catalog"
              ? "border-orange-500 text-orange-400"
              : "border-transparent text-slate-400 hover:text-slate-200"
          }`}
        >
          <Layers className="w-4 h-4" />
          <span>Product Catalog & Nicknames</span>
        </button>

        <button
          onClick={() => setActiveTab("invoices")}
          className={`flex items-center space-x-2 py-3 px-4 border-b-2 font-medium text-sm transition ${
            activeTab === "invoices"
              ? "border-indigo-500 text-indigo-400"
              : "border-transparent text-slate-400 hover:text-slate-200"
          }`}
        >
          <FileText className="w-4 h-4" />
          <span>Invoices Ledger ({invoices.length})</span>
        </button>
      </div>

      {/* Tab 1: Margin Approvals Queue (Human-in-the-Loop) */}
      {activeTab === "approvals" && (
        <div className="space-y-4">
          {pendingApprovals.length === 0 ? (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center space-y-3">
              <div className="w-12 h-12 rounded-full bg-emerald-500/10 text-emerald-400 flex items-center justify-center mx-auto">
                <CheckCircle className="w-6 h-6" />
              </div>
              <h3 className="font-semibold text-white text-base">All Quotations Margin-Compliant</h3>
              <p className="text-xs text-slate-400 max-w-md mx-auto">
                No steep discount requests currently require Merchant Manager intervention. Any quote below company minimum margins will appear here for suspension review.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {pendingApprovals.map((q) => (
                <div
                  key={q.id}
                  className="bg-slate-900 border border-amber-500/30 rounded-2xl p-6 shadow-xl space-y-4"
                >
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 border-b border-slate-800 pb-4">
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="font-bold text-lg text-white">Quote #{q.quoteNumber}</span>
                        <span className="px-2 py-0.5 rounded text-[11px] font-bold uppercase bg-amber-500/20 text-amber-300 border border-amber-500/40">
                          Pending Approval
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Customer: <strong className="text-white">{q.customerName}</strong> ({q.customerPhone})
                      </p>
                    </div>

                    <div className="text-right">
                      <span className="text-xs text-slate-400 block">Requested Total (incl. GST)</span>
                      <span className="text-xl font-bold text-amber-400">₹{q.total.toLocaleString("en-IN")}</span>
                    </div>
                  </div>

                  {/* Items List */}
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-950/60 uppercase text-slate-400">
                        <tr>
                          <th className="py-2.5 px-3">Product Name</th>
                          <th className="py-2.5 px-3 text-center">Qty</th>
                          <th className="py-2.5 px-3 text-right">Cost Price</th>
                          <th className="py-2.5 px-3 text-right">Requested Rate</th>
                          <th className="py-2.5 px-3 text-right">Gross Margin %</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60">
                        {q.items.map((it: QuoteItem, idx: number) => (
                          <tr key={idx}>
                            <td className="py-2.5 px-3">
                              <p className="font-medium text-white">{it.name}</p>
                              <span className="text-[10px] text-slate-400">SKU: {it.sku}</span>
                            </td>
                            <td className="py-2.5 px-3 text-center">{it.quantity} {it.unit}s</td>
                            <td className="py-2.5 px-3 text-right text-slate-400">₹{it.unitCost}</td>
                            <td className="py-2.5 px-3 text-right font-bold text-amber-400">₹{it.unitPrice}</td>
                            <td className="py-2.5 px-3 text-right">
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-500/20 text-red-300">
                                {it.marginPercent}%
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Manager Action Controls */}
                  <div className="bg-slate-950/50 p-4 rounded-xl border border-slate-800 flex flex-col md:flex-row items-center justify-between gap-4">
                    <div className="flex items-center space-x-2 w-full md:w-auto">
                      <input
                        type="number"
                        placeholder="Counter rate / unit (₹)"
                        value={counterRates[q.quoteNumber] || ""}
                        onChange={(e) =>
                          setCounterRates({ ...counterRates, [q.quoteNumber]: parseFloat(e.target.value) })
                        }
                        className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 w-44 focus:outline-none focus:border-indigo-500"
                      />
                      <button
                        onClick={() => handleCounter(q.quoteNumber)}
                        disabled={actionLoading === q.quoteNumber}
                        className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold transition disabled:opacity-50 whitespace-nowrap"
                      >
                        Counter Offer
                      </button>
                    </div>

                    <div className="flex items-center space-x-3 w-full md:w-auto justify-end">
                      <button
                        onClick={() => onViewDocument({ type: "quotation", data: q })}
                        className="text-xs text-slate-400 hover:text-white flex items-center gap-1"
                      >
                        <ExternalLink className="w-3.5 h-3.5" /> View Quote
                      </button>
                      <button
                        onClick={() => handleApprove(q.quoteNumber)}
                        disabled={actionLoading === q.quoteNumber}
                        className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold transition shadow disabled:opacity-50 flex items-center gap-1.5"
                      >
                        <CheckCircle className="w-4 h-4" />
                        Approve Requested Discount
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Live Agent Tool Trace */}
      {activeTab === "traces" && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
          <div className="flex justify-between items-center border-b border-slate-800 pb-3">
            <div>
              <h3 className="font-semibold text-white text-sm">Durable Object Tool Execution Log</h3>
              <p className="text-xs text-slate-400">Chronological SQLite record of tools executed by Llama 3.3</p>
            </div>
            <button
              onClick={refreshState}
              className="text-xs text-emerald-400 hover:underline"
            >
              Refresh Logs
            </button>
          </div>

          <div className="space-y-3">
            {traces.length === 0 ? (
              <p className="text-xs text-slate-500 py-6 text-center">No tool executions recorded yet.</p>
            ) : (
              traces.map((tr) => (
                <div
                  key={tr.id}
                  className="bg-slate-950/80 border border-slate-800/80 rounded-xl p-4 text-xs space-y-2 hover:border-slate-700 transition"
                >
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-orange-400 bg-orange-500/10 border border-orange-500/30 px-2 py-0.5 rounded text-[11px]">
                      {tr.toolName}
                    </span>
                    <span className="text-[10px] text-slate-500 flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {new Date(tr.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                  <p className="font-medium text-white">{tr.summary}</p>
                  <details className="mt-2 text-slate-400">
                    <summary className="cursor-pointer hover:text-slate-200 text-[11px]">
                      View Payload & Result JSON
                    </summary>
                    <pre className="mt-2 p-3 bg-slate-900 rounded-lg overflow-x-auto text-[10px] text-emerald-300 font-mono">
                      {JSON.stringify({ input: tr.input, output: tr.output }, null, 2)}
                    </pre>
                  </details>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Tab 3: Catalog & Nicknames */}
      {activeTab === "catalog" && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-slate-800 pb-4">
            <div>
              <h3 className="font-semibold text-white text-sm">Wholesale Catalog & Slang Nicknames</h3>
              <p className="text-xs text-slate-400">Persisted in Durable Object local SQLite storage</p>
            </div>
            <div className="relative w-full sm:w-64">
              <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Search products or nicknames..."
                value={catalogSearch}
                onChange={(e) => setCatalogSearch(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-orange-500"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950/80 uppercase text-slate-400 border-y border-slate-800">
                <tr>
                  <th className="py-3 px-4">Product Name & Category</th>
                  <th className="py-3 px-4">SKU</th>
                  <th className="py-3 px-4 text-right">Cost Price</th>
                  <th className="py-3 px-4 text-right">List Price</th>
                  <th className="py-3 px-4 text-center">Min Margin</th>
                  <th className="py-3 px-4 text-center">Stock</th>
                  <th className="py-3 px-4">Bound Slang & Nicknames</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filteredProducts.map((p: Product) => (
                  <tr key={p.id} className="hover:bg-slate-950/40">
                    <td className="py-3 px-4">
                      <p className="font-semibold text-white">{p.name}</p>
                      <span className="text-[10px] text-slate-400">{p.category}</span>
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-300">{p.sku}</td>
                    <td className="py-3 px-4 text-right text-slate-400">₹{p.costPrice}</td>
                    <td className="py-3 px-4 text-right font-medium text-emerald-400">₹{p.listPrice}</td>
                    <td className="py-3 px-4 text-center">
                      <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 text-[10px]">
                        {p.minMarginPercent}%
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center font-medium text-white">{p.stockQuantity} {p.unit}s</td>
                    <td className="py-3 px-4">
                      <div className="flex flex-wrap gap-1">
                        {p.nicknames.map((nick: string, i: number) => (
                          <span
                            key={i}
                            className="px-1.5 py-0.5 rounded bg-orange-500/10 text-orange-300 border border-orange-500/20 text-[10px]"
                          >
                            {nick}
                          </span>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 4: Invoices Ledger */}
      {activeTab === "invoices" && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
          <div className="flex justify-between items-center border-b border-slate-800 pb-3">
            <div>
              <h3 className="font-semibold text-white text-sm">Converted Tax Invoices</h3>
              <p className="text-xs text-slate-400">Official order records converted from confirmed quotations</p>
            </div>
          </div>

          <div className="space-y-3">
            {invoices.length === 0 ? (
              <p className="text-xs text-slate-500 py-8 text-center">No invoices issued yet. Confirm a quote in the chat to issue one!</p>
            ) : (
              invoices.map((inv) => (
                <div
                  key={inv.id}
                  className="bg-slate-950/70 border border-slate-800 rounded-xl p-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3"
                >
                  <div>
                    <div className="flex items-center space-x-2">
                      <span className="font-bold text-white text-sm">#{inv.invoiceNumber}</span>
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-indigo-500/20 text-indigo-300 border border-indigo-500/40">
                        {inv.status}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 mt-1">
                      Customer: <strong className="text-white">{inv.customerName}</strong> • Ref Quote: #{inv.quoteNumber}
                    </p>
                  </div>

                  <div className="flex items-center space-x-4">
                    <div className="text-right">
                      <span className="text-xs text-slate-400 block">Total Amount</span>
                      <span className="text-base font-bold text-emerald-400">₹{inv.total.toLocaleString("en-IN")}</span>
                    </div>
                    <button
                      onClick={() => onViewDocument({ type: "invoice", data: inv })}
                      className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-medium flex items-center gap-1 transition"
                    >
                      <FileText className="w-3.5 h-3.5" /> View Invoice
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};
