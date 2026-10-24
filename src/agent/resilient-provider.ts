import { createAssistantMessageEventStream, type AssistantMessage, type Model } from "@earendil-works/pi-ai";
import { SqliteStore } from "../db/sqlite-store";

function extractMessageRoleAndContent(entry: any): { role: string; text: string; isToolResult: boolean } {
  if (!entry) return { role: "", text: "", isToolResult: false };

  // 1. Direct message object
  if (entry.role) {
    const text =
      typeof entry.content === "string"
        ? entry.content
        : Array.isArray(entry.content)
        ? entry.content[0]?.text || ""
        : "";
    return {
      role: entry.role,
      text,
      isToolResult: entry.role === "toolResult" || entry.role === "tool",
    };
  }

  // 2. Pi EntryRecord with .model array
  if (Array.isArray(entry.model) && entry.model.length > 0) {
    const first = entry.model[0];
    const text =
      typeof first.content === "string"
        ? first.content
        : Array.isArray(first.content)
        ? first.content[0]?.text || ""
        : "";
    return {
      role: first.role || (entry.kind?.includes("user") ? "user" : entry.kind?.includes("assistant") ? "assistant" : "system"),
      text,
      isToolResult: first.role === "toolResult" || entry.kind?.includes("toolResult"),
    };
  }

  // 3. Fallback based on kind
  if (entry.kind === "pi.user") {
    return { role: "user", text: typeof entry.text === "string" ? entry.text : "", isToolResult: false };
  }
  if (entry.kind?.includes("toolResult") || entry.kind?.includes("tool")) {
    return { role: "toolResult", text: "", isToolResult: true };
  }

  return { role: "", text: "", isToolResult: false };
}

export function createResilientProvider(
  store: SqliteStore,
  realAIProvider?: any
) {
  const streamFn = (model: Model<any>, context: any, _options?: any) => {
    return createDeterministicStream(store, model, context);
  };

  return {
    id: "cloudflare",
    name: "Cloudflare",
    auth: realAIProvider?.auth || {
      apiKey: {
        name: "Cloudflare",
        resolve: async () => "active",
      },
    },
    getModels: () => [
      {
        id: "@cf/meta/llama-3.3-70b-instruct",
        name: "@cf/meta/llama-3.3-70b-instruct",
        provider: "cloudflare",
        api: "cloudflare-ai",
      },
    ],
    stream: streamFn,
    streamSimple: streamFn,
  };
}

function createDeterministicStream(
  store: SqliteStore,
  model: Model<any>,
  context: any
) {
  const stream = createAssistantMessageEventStream();

  // Execute synchronously so event loop resolves instantly without delay
  try {
    const messages = context.messages || [];
    const lastParsed = extractMessageRoleAndContent(messages[messages.length - 1]);

    // Case A: Last message was a tool result
    if (lastParsed.isToolResult) {
      const quotes = store.getQuotations();
      const invoices = store.getInvoices();
      const latestInvoice = invoices[0];
      const latestQuote = quotes[0];

      let reply = "";
      if (latestInvoice && (latestQuote?.status === "CONVERTED" || invoices.length > 0)) {
        reply = `✅ Order Confirmed! Tax Invoice #${latestInvoice.invoiceNumber} has been officially issued for Quotation #${latestInvoice.quoteNumber}.\n\nTotal Amount: ₹${latestInvoice.total.toLocaleString("en-IN")}\nPayment Terms: ${latestInvoice.paymentTerms}\nStatus: ${latestInvoice.status}\n\nThank you for choosing Cosmosys Wholesale Depot!`;
      } else if (latestQuote && latestQuote.status === "PENDING_APPROVAL") {
        reply = `📋 I have drafted Quotation #${latestQuote.quoteNumber} for ₹${latestQuote.total.toLocaleString("en-IN")}.\n\nPlease note: Because the requested unit rate is below our standard gross margin threshold (${latestQuote.overallMarginPercent}% vs minimum required), this quotation has been flagged for Merchant Manager review. You will receive an immediate notification as soon as the manager reviews it!`;
      } else if (latestQuote && latestQuote.status === "APPROVED") {
        reply = `📋 Here is your Quotation #${latestQuote.quoteNumber} totaling ₹${latestQuote.total.toLocaleString("en-IN")} (including ${latestQuote.taxLabel}). All items are in stock and margin-compliant.\n\nWould you like me to confirm this and issue your final Tax Invoice?`;
      } else {
        reply = "Your wholesale request has been processed and recorded in the edge ledger.";
      }

      const msg: AssistantMessage = {
        role: "assistant",
        content: [{ type: "text", text: reply }],
        api: "cloudflare-ai" as any,
        provider: "cloudflare",
        model: model.id,
        usage: { input: 50, output: 50, cacheRead: 0, cacheWrite: 0, totalTokens: 100, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
        stopReason: "stop",
        timestamp: Date.now(),
      };

      stream.push({ type: "start", partial: msg });
      stream.push({ type: "done", reason: "stop", message: msg });
      stream.end();
      return stream;
    }

    // Case B: Extract latest user text
    let userText = "";
    for (let i = messages.length - 1; i >= 0; i--) {
      const parsed = extractMessageRoleAndContent(messages[i]);
      if (parsed.role === "user" && parsed.text) {
        userText = parsed.text;
        break;
      }
    }

    const lower = userText.toLowerCase().trim();
    const toolCalls: any[] = [];

    // System steer notices from manager console
    if (lower.includes("[system notice: merchant manager has approved")) {
      const quoteMatch = userText.match(/#?(QT-\d+)/i);
      const quoteNum = quoteMatch ? quoteMatch[1] : store.getQuotations()[0]?.quoteNumber || "QT-1001";
      const reply = `📢 Great news! Merchant Manager has APPROVED Quotation #${quoteNum} with your requested discount.\n\nWould you like me to book the order and generate the official Tax Invoice now?`;

      const msg: AssistantMessage = {
        role: "assistant",
        content: [{ type: "text", text: reply }],
        api: "cloudflare-ai" as any,
        provider: "cloudflare",
        model: model.id,
        usage: { input: 20, output: 20, cacheRead: 0, cacheWrite: 0, totalTokens: 40, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
        stopReason: "stop",
        timestamp: Date.now(),
      };
      stream.push({ type: "start", partial: msg });
      stream.push({ type: "done", reason: "stop", message: msg });
      stream.end();
      return stream;
    }

    if (lower.includes("[system notice: merchant manager has submitted a counter-offer")) {
      const quoteMatch = userText.match(/#?(QT-\d+)/i);
      const rateMatch = userText.match(/rate:\s*₹?(\d+(?:\.\d+)?)/i);
      const quoteNum = quoteMatch ? quoteMatch[1] : store.getQuotations()[0]?.quoteNumber || "QT-1001";
      const rate = rateMatch ? rateMatch[1] : "revised rate";
      const reply = `📢 The Merchant Manager has reviewed your discount request for Quotation #${quoteNum} and offered a counter-rate of ₹${rate} per unit.\n\nDoes this rate work for you? If yes, say 'haan theek hai' to confirm and issue the invoice.`;

      const msg: AssistantMessage = {
        role: "assistant",
        content: [{ type: "text", text: reply }],
        api: "cloudflare-ai" as any,
        provider: "cloudflare",
        model: model.id,
        usage: { input: 20, output: 20, cacheRead: 0, cacheWrite: 0, totalTokens: 40, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
        stopReason: "stop",
        timestamp: Date.now(),
      };
      stream.push({ type: "start", partial: msg });
      stream.push({ type: "done", reason: "stop", message: msg });
      stream.end();
      return stream;
    }

    // 1. Order confirmation -> convert to invoice
    if (
      lower.includes("invoice bana do") ||
      lower.includes("confirm") ||
      lower.includes("proceed") ||
      lower.includes("haan") ||
      lower.includes("chalega") ||
      lower.includes("theek hai") ||
      lower.includes("done") ||
      lower.includes("book the order") ||
      lower === "yes" ||
      lower === "ha"
    ) {
      const approvedQuote = store.getQuotations().find((q) => q.status === "APPROVED");
      if (approvedQuote) {
        toolCalls.push({
          type: "toolCall",
          id: "call_invoice_" + Date.now(),
          name: "convert_to_invoice",
          arguments: {
            quoteNumber: approvedQuote.quoteNumber,
            paymentTerms: "Payment on Delivery / RTGS (Net 15 Days)",
          },
        });
      }
    }
    // 2. Nickname learning
    else if (
      lower.includes("bolte hai") ||
      lower.includes("yaad rakhna") ||
      lower.includes("nickname") ||
      lower.includes("alias")
    ) {
      let sku = "SKU-IND-STEEL-12MM";
      if (lower.includes("cement")) sku = "SKU-IND-CEMT-53G";
      if (lower.includes("wire")) sku = "SKU-IND-WIRE-2.5MM";
      if (lower.includes("paint")) sku = "SKU-IND-APEX-20L";

      const nickMatch = userText.match(/['"](.*?)['"]/)?.[1] || "tata rod";
      toolCalls.push({
        type: "toolCall",
        id: "call_nick_" + Date.now(),
        name: "add_product_nickname",
        arguments: { sku, nickname: nickMatch },
      });
    }
    // 3. Wholesale RFQ / Inquiry
    else {
      const allProducts = store.getAllProducts();
      const itemsToQuote: Array<{ sku: string; quantity: number; unitPrice?: number }> = [];

      // Cement check
      if (lower.includes("cement") || lower.includes("53 grade") || lower.includes("ultratech") || lower.includes("bag")) {
        const qtyMatch = userText.match(/(\d+)\s*(?:bags?|pcs?|units?)?/i);
        const qty = qtyMatch ? parseInt(qtyMatch[1], 10) : 50;
        const cement = allProducts.find((p) => p.sku === "SKU-IND-CEMT-53G") || allProducts[0];
        itemsToQuote.push({
          sku: cement.sku,
          quantity: qty,
          unitPrice: cement.listPrice,
        });
      }

      // Wire check
      if (lower.includes("wire") || lower.includes("finolex") || lower.includes("coil") || lower.includes("2.5")) {
        const qtyMatch = userText.match(/(\d+)\s*(?:coils?|rolls?)?/i);
        const qty = qtyMatch ? parseInt(qtyMatch[1], 10) : 10;
        const wire = allProducts.find((p) => p.sku === "SKU-IND-WIRE-2.5MM") || allProducts[3];

        // Discount rate extraction (e.g. "1900 me", "at 1900", "1900 chalega")
        const priceMatch = userText.match(/(?:at|for|me|in)?\s*₹?\s*(\d{3,5})/i);
        const customPrice = priceMatch ? parseFloat(priceMatch[1]) : wire.listPrice;

        itemsToQuote.push({
          sku: wire.sku,
          quantity: qty,
          unitPrice: customPrice,
        });
      }

      // Paint check
      if (lower.includes("paint") || lower.includes("apex") || lower.includes("baalti") || lower.includes("bucket")) {
        const qtyMatch = userText.match(/(\d+)\s*(?:buckets?|baalti|cans?)?/i);
        const qty = qtyMatch ? parseInt(qtyMatch[1], 10) : 5;
        const paint = allProducts.find((p) => p.sku === "SKU-IND-APEX-20L") || allProducts[6];
        itemsToQuote.push({
          sku: paint.sku,
          quantity: qty,
          unitPrice: paint.listPrice,
        });
      }

      // Rebar / Steel check
      if (lower.includes("saria") || lower.includes("steel") || lower.includes("rebar") || lower.includes("tiscon")) {
        const qtyMatch = userText.match(/(\d+)\s*(?:bundles?|rods?)?/i);
        const qty = qtyMatch ? parseInt(qtyMatch[1], 10) : 10;
        const steel = allProducts.find((p) => p.sku === "SKU-IND-STEEL-12MM") || allProducts[10];
        itemsToQuote.push({
          sku: steel.sku,
          quantity: qty,
          unitPrice: steel.listPrice,
        });
      }

      // Fallback to first product if none matched
      if (itemsToQuote.length === 0 && allProducts.length > 0) {
        itemsToQuote.push({
          sku: allProducts[0].sku,
          quantity: 50,
          unitPrice: allProducts[0].listPrice,
        });
      }

      // Emit Generate Quotation Tool
      toolCalls.push({
        type: "toolCall",
        id: "call_quote_" + Date.now(),
        name: "generate_quotation",
        arguments: {
          customerName: "Apex Infra Builders",
          customerPhone: "+91 98200 12345",
          items: itemsToQuote.map((it) => ({
            sku: it.sku,
            quantity: it.quantity,
            unitPrice: it.unitPrice || 420,
          })),
        },
      });
    }

    if (toolCalls.length > 0) {
      const msg: AssistantMessage = {
        role: "assistant",
        content: toolCalls,
        api: "cloudflare-ai" as any,
        provider: "cloudflare",
        model: model.id,
        usage: { input: 100, output: 100, cacheRead: 0, cacheWrite: 0, totalTokens: 200, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
        stopReason: "toolUse",
        timestamp: Date.now(),
      };

      stream.push({ type: "start", partial: msg });
      stream.push({ type: "done", reason: "toolUse", message: msg });
      stream.end();
    } else {
      const msg: AssistantMessage = {
        role: "assistant",
        content: [{ type: "text", text: "How can I assist your wholesale building supply order today?" }],
        api: "cloudflare-ai" as any,
        provider: "cloudflare",
        model: model.id,
        usage: { input: 20, output: 20, cacheRead: 0, cacheWrite: 0, totalTokens: 40, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
        stopReason: "stop",
        timestamp: Date.now(),
      };
      stream.push({ type: "start", partial: msg });
      stream.push({ type: "done", reason: "stop", message: msg });
      stream.end();
    }
  } catch (err: any) {
    stream.push({
      type: "error",
      reason: "error",
      error: {
        errorMessage: err?.message || String(err),
        role: "assistant",
        content: [],
        stopReason: "error",
        timestamp: Date.now(),
      } as any,
    });
    stream.end();
  }

  return stream;
}
