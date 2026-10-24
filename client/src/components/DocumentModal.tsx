import React from "react";
import { X, Printer, CheckCircle, FileText, Building2 } from "lucide-react";
import { Quotation, Invoice, QuoteItem } from "@shared/types";

interface DocumentModalProps {
  document: { type: "quotation"; data: Quotation } | { type: "invoice"; data: Invoice } | null;
  onClose: () => void;
}

export const DocumentModal: React.FC<DocumentModalProps> = ({ document, onClose }) => {
  if (!document) return null;

  const isInvoice = document.type === "invoice";
  const doc = document.data;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fadeIn">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-3xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 bg-slate-800/60 border-b border-slate-700/60 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <FileText className={`w-5 h-5 ${isInvoice ? "text-indigo-400" : "text-emerald-400"}`} />
            <h2 className="font-semibold text-lg text-white">
              {isInvoice ? `Tax Invoice #${(doc as Invoice).invoiceNumber}` : `Quotation #${(doc as Quotation).quoteNumber}`}
            </h2>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={() => window.print()}
              className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-700/50 transition"
              title="Print Document"
            >
              <Printer className="w-5 h-5" />
            </button>
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-700/50 transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Document Body */}
        <div className="p-8 overflow-y-auto space-y-6 bg-slate-950/40 text-slate-200">
          {/* Company & Document Info */}
          <div className="flex justify-between items-start border-b border-slate-800 pb-6">
            <div>
              <div className="flex items-center space-x-2 text-orange-400 mb-1">
                <Building2 className="w-5 h-5" />
                <span className="font-bold text-lg text-white">QUOTEFLOW WHOLESALE LTD</span>
              </div>
              <p className="text-xs text-slate-400">Industrial & Building Supplies Depot</p>
              <p className="text-xs text-slate-400">GSTIN: 27AABCC1234F1Z9</p>
              <p className="text-xs text-slate-400">Bandra-Kurla Complex, Mumbai, MH</p>
            </div>
            <div className="text-right">
              <span className={`inline-block px-3 py-1 rounded-full text-xs font-bold uppercase mb-2 ${
                isInvoice
                  ? "bg-indigo-500/20 text-indigo-300 border border-indigo-500/30"
                  : doc.status === "APPROVED"
                  ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                  : "bg-amber-500/20 text-amber-300 border border-amber-500/30"
              }`}>
                {doc.status}
              </span>
              <p className="text-xs text-slate-400">
                Date: {new Date(doc.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
              </p>
              {isInvoice && (
                <p className="text-xs text-slate-400">
                  Ref Quote: #{(doc as Invoice).quoteNumber}
                </p>
              )}
            </div>
          </div>

          {/* Customer Info */}
          <div className="bg-slate-900/60 p-4 rounded-xl border border-slate-800/80">
            <span className="text-xs font-semibold uppercase text-slate-400">Billed To</span>
            <p className="font-semibold text-white mt-1">{doc.customerName}</p>
            {doc.customerPhone && <p className="text-xs text-slate-400">Contact: {doc.customerPhone}</p>}
          </div>

          {/* Items Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase bg-slate-900 text-slate-400 border-y border-slate-800">
                <tr>
                  <th className="py-3 px-4">Item & Description</th>
                  <th className="py-3 px-4 text-center">Qty</th>
                  <th className="py-3 px-4 text-right">Unit Rate</th>
                  <th className="py-3 px-4 text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {doc.items.map((item: QuoteItem, idx: number) => (
                  <tr key={idx} className="hover:bg-slate-900/30">
                    <td className="py-3 px-4">
                      <p className="font-medium text-white">{item.name}</p>
                      <span className="text-[11px] text-slate-400">SKU: {item.sku}</span>
                    </td>
                    <td className="py-3 px-4 text-center">
                      {item.quantity} {item.unit}s
                    </td>
                    <td className="py-3 px-4 text-right">₹{item.unitPrice.toLocaleString("en-IN")}</td>
                    <td className="py-3 px-4 text-right font-medium text-white">
                      ₹{item.totalPrice.toLocaleString("en-IN")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Summary Calculation */}
          <div className="flex justify-end pt-4 border-t border-slate-800">
            <div className="w-64 space-y-2 text-sm">
              <div className="flex justify-between text-slate-400">
                <span>Subtotal:</span>
                <span className="font-medium text-white">₹{doc.subtotal.toLocaleString("en-IN")}</span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>{doc.taxLabel || "GST (18%)"}:</span>
                <span className="font-medium text-white">₹{doc.tax.toLocaleString("en-IN")}</span>
              </div>
              <div className="flex justify-between pt-2 border-t border-slate-700 text-base font-bold text-emerald-400">
                <span>Total Amount:</span>
                <span>₹{doc.total.toLocaleString("en-IN")}</span>
              </div>
            </div>
          </div>

          {/* Terms & Footer */}
          <div className="border-t border-slate-800 pt-4 text-xs text-slate-500 flex justify-between items-center">
            <p>Terms: {isInvoice ? (doc as Invoice).paymentTerms : "Valid for 24 hours from quotation date."}</p>
            <div className="flex items-center space-x-1 text-emerald-500">
              <CheckCircle className="w-3.5 h-3.5" />
              <span>Edge Verified by Cloudflare Durable Object</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
