export type RegionMode = "INDIA" | "GLOBAL";
export type CurrencyCode = "INR" | "USD";
export type CurrencySymbol = "₹" | "$";

export interface Product {
  id: string;
  sku: string;
  name: string;
  category: string;
  unit: string;
  costPrice: number;
  listPrice: number;
  minMarginPercent: number;
  stockQuantity: number;
  nicknames: string[];
  currency: CurrencyCode;
  currencySymbol: CurrencySymbol;
}

export interface QuoteItem {
  sku: string;
  name: string;
  unit: string;
  quantity: number;
  unitCost: number;
  unitPrice: number;
  totalPrice: number;
  marginPercent: number;
}

export type QuotationStatus =
  | "DRAFT"
  | "PENDING_APPROVAL"
  | "APPROVED"
  | "REJECTED"
  | "CONVERTED"
  | "EXPIRED";

export interface Quotation {
  id: string;
  quoteNumber: string;
  customerName: string;
  customerPhone?: string;
  items: QuoteItem[];
  subtotal: number;
  tax: number;
  total: number;
  overallMarginPercent: number;
  status: QuotationStatus;
  approvalNote?: string;
  currency: CurrencyCode;
  currencySymbol: CurrencySymbol;
  taxLabel: string;
  expiresAt: number; // Unix timestamp ms
  createdAt: number; // Unix timestamp ms
}

export type InvoiceStatus = "ISSUED" | "PAID";

export interface Invoice {
  id: string;
  invoiceNumber: string;
  quoteNumber: string;
  customerName: string;
  customerPhone?: string;
  items: QuoteItem[];
  subtotal: number;
  tax: number;
  total: number;
  paymentTerms: string;
  status: InvoiceStatus;
  currency: CurrencyCode;
  currencySymbol: CurrencySymbol;
  taxLabel: string;
  createdAt: number;
}

export interface AgentToolTrace {
  id: string;
  timestamp: number;
  toolName: string;
  input: Record<string, any>;
  output: Record<string, any>;
  summary: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: number;
  kind?: string;
  attachment?: {
    type: "quotation" | "invoice" | "approval_notice";
    referenceId: string;
    data?: any;
  };
}
