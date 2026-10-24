import { Type } from "@earendil-works/pi-ai";
import type { ToolRegistration } from "@earendil-works/pi-durable";
import { SqliteStore } from "../db/sqlite-store";
import { QuoteItem, Quotation, Invoice, AgentToolTrace } from "../shared/types";

export function createMerchantTools(store: SqliteStore) {
  // 1. Search Product Tool
  const SearchProductParams = Type.Object({
    query: Type.String({ description: "Search term: trade slang, nickname, SKU, or product category (e.g. '53 grade', 'finolex 2.5', 'wall putty', 'saria', 'dr fixit', '4 inch pvc')" }),
  });

  const searchProductTool: ToolRegistration<typeof SearchProductParams> = {
    name: "search_product",
    description: "Search wholesale product catalog by SKU, standard name, category, or colloquial trade nicknames/slang.",
    parameters: SearchProductParams,
    replay: "safe",
    async execute({ query }) {
      const start = Date.now();
      const products = store.searchProducts(query);
      const output = {
        query,
        count: products.length,
        matches: products.map((p) => ({
          sku: p.sku,
          name: p.name,
          category: p.category,
          unit: p.unit,
          listPrice: p.listPrice,
          costPrice: p.costPrice,
          minMarginPercent: p.minMarginPercent,
          stock: p.stockQuantity,
          currency: p.currencySymbol,
          nicknames: p.nicknames,
        })),
      };

      store.recordToolTrace({
        id: "tr-" + Math.random().toString(36).substring(2, 9),
        toolName: "search_product",
        input: { query },
        output,
        summary: `Found ${products.length} products matching "${query}"`,
        timestamp: start,
      });

      return {
        output: [
          {
            type: "text",
            text: JSON.stringify(output, null, 2),
          },
        ],
      };
    },
  };

  // 2. Check Margins & Pricing Tool
  const MarginCheckParams = Type.Object({
    items: Type.Array(
      Type.Object({
        sku: Type.String({ description: "Product SKU" }),
        quantity: Type.Number({ description: "Quantity ordered" }),
        requestedUnitPrice: Type.Optional(Type.Number({ description: "Price per unit offered or requested by customer" })),
      })
    ),
  });

  const marginCalculatorTool: ToolRegistration<typeof MarginCheckParams> = {
    name: "check_margins_and_pricing",
    description: "Calculate gross profit margins for line items. Determines if requested pricing meets company minimum margin thresholds or requires Merchant Manager approval.",
    parameters: MarginCheckParams,
    replay: "safe",
    async execute({ items }) {
      const start = Date.now();
      let totalCost = 0;
      let totalRevenue = 0;
      let requiresManagerApproval = false;
      const itemAnalyses = [];

      for (const item of items) {
        const product = store.getProductBySku(item.sku);
        if (!product) {
          itemAnalyses.push({
            sku: item.sku,
            error: `Product SKU '${item.sku}' not found in catalog`,
          });
          continue;
        }

        const unitCost = product.costPrice;
        const unitPrice = item.requestedUnitPrice ?? product.listPrice;
        const lineRevenue = unitPrice * item.quantity;
        const lineCost = unitCost * item.quantity;
        const lineProfit = lineRevenue - lineCost;
        const marginPercent = Number(((lineProfit / lineRevenue) * 100).toFixed(2));
        const compliant = marginPercent >= product.minMarginPercent;

        if (!compliant) {
          requiresManagerApproval = true;
        }

        totalCost += lineCost;
        totalRevenue += lineRevenue;

        itemAnalyses.push({
          sku: product.sku,
          name: product.name,
          quantity: item.quantity,
          unit: product.unit,
          unitCost,
          listPrice: product.listPrice,
          unitPrice,
          marginPercent,
          minMarginRequired: product.minMarginPercent,
          compliant,
          status: compliant ? "COMPLIANT" : "MARGIN_BREACH_NEEDS_APPROVAL",
        });
      }

      const overallProfit = totalRevenue - totalCost;
      const overallMarginPercent = totalRevenue > 0 ? Number(((overallProfit / totalRevenue) * 100).toFixed(2)) : 0;

      const output = {
        totalRevenue,
        totalCost,
        overallProfit,
        overallMarginPercent,
        requiresManagerApproval,
        recommendation: requiresManagerApproval
          ? "Special discount requested is below minimum allowable margin. Generate a quotation with status PENDING_APPROVAL for Merchant Manager review."
          : "Margin is healthy (>= minimum threshold). Generate a formal quotation with status APPROVED.",
        items: itemAnalyses,
      };

      store.recordToolTrace({
        id: "tr-" + Math.random().toString(36).substring(2, 9),
        toolName: "check_margins_and_pricing",
        input: { items },
        output,
        summary: `Analyzed pricing: Overall margin ${overallMarginPercent}%. Approval required: ${requiresManagerApproval}`,
        timestamp: start,
      });

      return {
        output: [
          {
            type: "text",
            text: JSON.stringify(output, null, 2),
          },
        ],
      };
    },
  };

  // 3. Generate Quotation Tool
  const GenerateQuotationParams = Type.Object({
    customerName: Type.String({ description: "Customer or Contractor name" }),
    customerPhone: Type.Optional(Type.String({ description: "WhatsApp phone number or contact info" })),
    items: Type.Array(
      Type.Object({
        sku: Type.String({ description: "Product SKU" }),
        quantity: Type.Number({ description: "Quantity" }),
        unitPrice: Type.Number({ description: "Agreed or requested unit price" }),
      })
    ),
    status: Type.Optional(Type.Union([Type.Literal("APPROVED"), Type.Literal("PENDING_APPROVAL")], { description: "Quotation status: APPROVED if margins are compliant, PENDING_APPROVAL if steep discount requested" })),
    reason: Type.Optional(Type.String({ description: "Note or reason if pending approval" })),
  });

  const generateQuotationTool: ToolRegistration<typeof GenerateQuotationParams> = {
    name: "generate_quotation",
    description: "Generate an official wholesale Quotation. If price meets margin policy, status is APPROVED; otherwise status is PENDING_APPROVAL.",
    parameters: GenerateQuotationParams,
    replay: "safe",
    async execute({ customerName, customerPhone, items, status: requestedStatus, reason }) {
      const start = Date.now();
      const quoteNumber = `QT-${Math.floor(1000 + Math.random() * 9000)}`;
      let subtotal = 0;
      let totalCost = 0;
      const quoteItems: QuoteItem[] = [];
      let hasMarginBreach = false;

      for (const item of items) {
        const product = store.getProductBySku(item.sku);
        if (!product) continue;
        const lineTotal = item.unitPrice * item.quantity;
        const lineCost = product.costPrice * item.quantity;
        const margin = Number((((lineTotal - lineCost) / lineTotal) * 100).toFixed(2));
        if (margin < product.minMarginPercent) {
          hasMarginBreach = true;
        }
        subtotal += lineTotal;
        totalCost += lineCost;

        quoteItems.push({
          sku: product.sku,
          name: product.name,
          unit: product.unit,
          quantity: item.quantity,
          unitCost: product.costPrice,
          unitPrice: item.unitPrice,
          totalPrice: lineTotal,
          marginPercent: margin,
        });
      }

      const overallMarginPercent = subtotal > 0 ? Number((((subtotal - totalCost) / subtotal) * 100).toFixed(2)) : 0;
      // Tax: GST 18% standard for wholesale supplies
      const taxRate = 0.18;
      const tax = Number((subtotal * taxRate).toFixed(2));
      const total = Number((subtotal + tax).toFixed(2));

      const status = requestedStatus || (hasMarginBreach ? "PENDING_APPROVAL" : "APPROVED");
      const expiresAt = Date.now() + 24 * 60 * 60 * 1000; // 24 hours validity

      const quotation: Quotation = {
        id: "qt-" + Math.random().toString(36).substring(2, 9),
        quoteNumber,
        customerName: customerName || "Customer",
        customerPhone: customerPhone || "+91 98200 12345",
        items: quoteItems,
        subtotal,
        tax,
        total,
        overallMarginPercent,
        status,
        approvalNote: reason || (status === "PENDING_APPROVAL" ? "Discount requested below threshold. Awaiting manager approval." : "Standard margin approved."),
        currency: "INR",
        currencySymbol: "₹",
        taxLabel: "GST (18%)",
        expiresAt,
        createdAt: Date.now(),
      };

      store.saveQuotation(quotation);

      const output = {
        success: true,
        quoteNumber,
        status,
        customerName: quotation.customerName,
        total: quotation.total,
        currency: quotation.currencySymbol,
        itemsCount: quoteItems.length,
        overallMarginPercent,
        approvalNote: quotation.approvalNote,
        instruction: status === "PENDING_APPROVAL"
          ? `Quotation #${quoteNumber} is PENDING_APPROVAL. Inform the customer politely that their discounted pricing is under review by the Merchant Manager.`
          : `Quotation #${quoteNumber} is APPROVED. Present the full quotation summary to the customer and ask if they would like to confirm and issue the official Tax Invoice.`,
      };

      store.recordToolTrace({
        id: "tr-" + Math.random().toString(36).substring(2, 9),
        toolName: "generate_quotation",
        input: { customerName, items, requestedStatus, reason },
        output,
        summary: `Created Quote #${quoteNumber} [${status}] Total: ₹${total} (Margin: ${overallMarginPercent}%)`,
        timestamp: start,
      });

      return {
        output: [
          {
            type: "text",
            text: JSON.stringify(output, null, 2),
          },
        ],
      };
    },
  };

  // 4. Convert To Invoice Tool
  const ConvertToInvoiceParams = Type.Object({
    quoteNumber: Type.String({ description: "The approved Quotation number (e.g. 'QT-7102')" }),
    paymentTerms: Type.Optional(Type.String({ description: "Payment terms (e.g. 'Net 30 Days' or 'Immediate / UPI')" })),
  });

  const convertToInvoiceTool: ToolRegistration<typeof ConvertToInvoiceParams> = {
    name: "convert_to_invoice",
    description: "Convert an APPROVED quotation into an official wholesale Tax Invoice. Quote must be confirmed or agreed upon by customer.",
    parameters: ConvertToInvoiceParams,
    replay: "safe",
    async execute({ quoteNumber, paymentTerms }) {
      const start = Date.now();
      const quote = store.getQuotationByNumber(quoteNumber);

      if (!quote) {
        return {
          output: [
            {
              type: "text",
              text: JSON.stringify({ error: `Quotation #${quoteNumber} not found.` }),
            },
          ],
        };
      }

      if (quote.status === "PENDING_APPROVAL") {
        return {
          output: [
            {
              type: "text",
              text: JSON.stringify({
                error: `Quotation #${quoteNumber} is currently PENDING_APPROVAL by the Merchant Manager and cannot be converted to an invoice yet.`,
              }),
            },
          ],
        };
      }

      if (quote.status === "CONVERTED") {
        return {
          output: [
            {
              type: "text",
              text: JSON.stringify({
                message: `Quotation #${quoteNumber} has already been converted to an invoice.`,
              }),
            },
          ],
        };
      }

      const invoiceNumber = `INV-${Math.floor(1000 + Math.random() * 9000)}`;
      const invoice: Invoice = {
        id: "inv-" + Math.random().toString(36).substring(2, 9),
        invoiceNumber,
        quoteNumber: quote.quoteNumber,
        customerName: quote.customerName,
        customerPhone: quote.customerPhone,
        items: quote.items,
        subtotal: quote.subtotal,
        tax: quote.tax,
        total: quote.total,
        paymentTerms: paymentTerms || "Payment on Delivery (Net 15 Days)",
        status: "ISSUED",
        currency: quote.currency,
        currencySymbol: quote.currencySymbol,
        taxLabel: quote.taxLabel,
        createdAt: Date.now(),
      };

      store.saveInvoice(invoice);
      store.updateQuotationStatus(quote.quoteNumber, "CONVERTED", `Converted to Invoice #${invoiceNumber}`);

      const output = {
        success: true,
        invoiceNumber,
        quoteNumber: quote.quoteNumber,
        customerName: invoice.customerName,
        total: invoice.total,
        currency: invoice.currencySymbol,
        paymentTerms: invoice.paymentTerms,
        instruction: `Official Tax Invoice #${invoiceNumber} successfully created and recorded in the ledger! Congratulate the customer on their order, summarize the items and total, and provide payment details.`,
      };

      store.recordToolTrace({
        id: "tr-" + Math.random().toString(36).substring(2, 9),
        toolName: "convert_to_invoice",
        input: { quoteNumber, paymentTerms },
        output,
        summary: `Converted Quote #${quoteNumber} to Tax Invoice #${invoiceNumber} (Total: ₹${invoice.total})`,
        timestamp: start,
      });

      return {
        output: [
          {
            type: "text",
            text: JSON.stringify(output, null, 2),
          },
        ],
      };
    },
  };

  // 5. Add Product Nickname Tool
  const AddNicknameParams = Type.Object({
    sku: Type.String({ description: "Product SKU to bind nickname to (e.g. 'SKU-IND-STEEL-12MM')" }),
    nickname: Type.String({ description: "The colloquial trade name or slang (e.g. 'saria', 'baroda steel', 'pvc pipe')" }),
  });

  const addNicknameTool: ToolRegistration<typeof AddNicknameParams> = {
    name: "add_product_nickname",
    description: "Learn and persist a customer colloquial nickname or slang alias for a product SKU into the edge database.",
    parameters: AddNicknameParams,
    replay: "safe",
    async execute({ sku, nickname }) {
      const start = Date.now();
      const success = store.addNickname(sku, nickname);
      const output = {
        success,
        sku,
        nickname,
        message: success
          ? `Successfully bound nickname "${nickname}" to SKU ${sku}. Future searches for "${nickname}" will resolve automatically.`
          : `SKU ${sku} not found.`,
      };

      store.recordToolTrace({
        id: "tr-" + Math.random().toString(36).substring(2, 9),
        toolName: "add_product_nickname",
        input: { sku, nickname },
        output,
        summary: `Bound alias "${nickname}" -> SKU ${sku}`,
        timestamp: start,
      });

      return {
        output: [
          {
            type: "text",
            text: JSON.stringify(output, null, 2),
          },
        ],
      };
    },
  };

  return [
    searchProductTool,
    marginCalculatorTool,
    generateQuotationTool,
    convertToInvoiceTool,
    addNicknameTool,
  ];
}
