import { SqliteStore } from "../db/sqlite-store";
import { Quotation, Invoice } from "../shared/types";

export interface TurnResult {
  text: string;
  quotation?: Quotation;
  invoice?: Invoice;
  toolCalled?: string;
}

export async function processMerchantTurn(
  store: SqliteStore,
  userMessage: string,
  aiBinding?: any,
  geminiApiKey?: string
): Promise<TurnResult> {
  const lower = userMessage.toLowerCase().trim();

  // 1. Order Confirmation -> Convert approved quotation to Invoice
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
    const quotations = store.getQuotations();
    const approvedQuote = quotations.find((q) => q.status === "APPROVED");

    if (approvedQuote) {
      const invoiceNumber = `INV-${Math.floor(1000 + Math.random() * 9000)}`;
      const invoice: Invoice = {
        id: "inv-" + Math.random().toString(36).substring(2, 9),
        invoiceNumber,
        quoteNumber: approvedQuote.quoteNumber,
        customerName: approvedQuote.customerName,
        customerPhone: approvedQuote.customerPhone,
        items: approvedQuote.items,
        subtotal: approvedQuote.subtotal,
        tax: approvedQuote.tax,
        total: approvedQuote.total,
        paymentTerms: "Payment on Delivery / RTGS (Net 15 Days)",
        status: "ISSUED",
        currency: approvedQuote.currency,
        currencySymbol: approvedQuote.currencySymbol,
        taxLabel: approvedQuote.taxLabel,
        createdAt: Date.now(),
      };

      store.saveInvoice(invoice);
      store.updateQuotationStatus(approvedQuote.quoteNumber, "CONVERTED", `Converted to Invoice #${invoiceNumber}`);

      store.recordToolTrace({
        id: "tr-" + Math.random().toString(36).substring(2, 9),
        toolName: "convert_to_invoice",
        input: { quoteNumber: approvedQuote.quoteNumber, paymentTerms: invoice.paymentTerms },
        output: { success: true, invoiceNumber, total: invoice.total },
        summary: `Converted Quote #${approvedQuote.quoteNumber} to Tax Invoice #${invoiceNumber} (Total: ₹${invoice.total.toLocaleString("en-IN")})`,
        timestamp: Date.now(),
      });

      const text = `✅ Order Confirmed! Tax Invoice #${invoiceNumber} has been officially issued for Quotation #${approvedQuote.quoteNumber}.\n\nTotal Amount: ₹${invoice.total.toLocaleString("en-IN")}\nPayment Terms: ${invoice.paymentTerms}\nStatus: ${invoice.status}\n\nThank you for choosing Quoteflow Wholesale Depot!`;
      return { text, invoice, toolCalled: "convert_to_invoice" };
    } else {
      const pendingQuote = quotations.find((q) => q.status === "PENDING_APPROVAL");
      if (pendingQuote) {
        return {
          text: `⚠️ Quotation #${pendingQuote.quoteNumber} is currently pending Merchant Manager approval because of the requested special discount rate. As soon as the manager approves it in the console, I will issue your official Tax Invoice immediately!`,
        };
      }
    }
  }

  // 2. Product Nickname / Slang Learning
  if (
    lower.includes("bolte hai") ||
    lower.includes("yaad rakhna") ||
    lower.includes("nickname") ||
    lower.includes("alias")
  ) {
    let sku = "SKU-IND-STEEL-12MM";
    if (lower.includes("cement")) sku = "SKU-IND-CEMT-53G";
    if (lower.includes("wire")) sku = "SKU-IND-WIRE-2.5MM";
    if (lower.includes("paint")) sku = "SKU-IND-APEX-20L";
    if (lower.includes("pipe") || lower.includes("pvc")) sku = "SKU-IND-PVC-4IN";

    const nickMatch = userMessage.match(/['"](.*?)['"]/)?.[1] ||
      userMessage.replace(/.*(?:bolte hai|yaad rakhna|nickname|alias)\s*/i, "").trim() || "tata rod";

    const success = store.addNickname(sku, nickMatch);
    const prod = store.getProductBySku(sku);

    store.recordToolTrace({
      id: "tr-" + Math.random().toString(36).substring(2, 9),
      toolName: "add_product_nickname",
      input: { sku, nickname: nickMatch },
      output: { success, sku, nickname: nickMatch },
      summary: `Bound alias "${nickMatch}" -> SKU ${sku} (${prod?.name})`,
      timestamp: Date.now(),
    });

    return {
      text: `Got it! I have recorded "${nickMatch}" as an official trade alias for ${prod?.name || sku} in our edge database. Future orders using "${nickMatch}" will be recognized automatically!`,
      toolCalled: "add_product_nickname",
    };
  }

  // 3. Informational Question answering (without quotation generation)
  const isQuestion = lower.includes("?") || lower.includes("difference") || lower.includes("kya") || lower.includes("how") || lower.includes("kahan") || lower.includes("where") || lower.includes("specs") || lower.includes("detail");
  const hasOrderIntent = lower.includes("need") || lower.includes("chahiye") || lower.includes("bhejo") || lower.includes("send") || lower.includes("quote") || lower.includes("order") || lower.includes("rate") || lower.includes("price") || lower.includes("de do") || lower.includes("bag") || lower.includes("coil") || lower.includes("bundle") || lower.includes("bucket");

  if (isQuestion && !hasOrderIntent) {
    const products = store.getAllProducts();
    const catalogSummary = products.map((p) => `- ${p.name} (SKU: ${p.sku}, List: ₹${p.listPrice}/${p.unit})`).join("\n");
    const infoSystem = `You are Quoteflow Wholesale Depot AI Assistant. Answer the contractor's question accurately based on building construction domain knowledge and our catalog:\n${catalogSummary}\nKeep it friendly and formatted for WhatsApp with emojis.`;
    const answer = await callLiveLLM(userMessage, infoSystem, aiBinding, geminiApiKey);
    if (answer) {
      return { text: answer };
    }
  }

  // 4. Wholesale RFQ / Pricing Request
  const allProducts = store.getAllProducts();
  const itemsToQuote: Array<{ sku: string; quantity: number; unitPrice: number }> = [];

  // Cement check
  if (lower.includes("cement") || lower.includes("53 grade") || lower.includes("ultratech") || lower.includes("bag")) {
    const qtyMatch = userMessage.match(/(\d+)\s*(?:bags?|pcs?|units?)?/i);
    const qty = qtyMatch ? parseInt(qtyMatch[1], 10) : 50;
    const cement = allProducts.find((p) => p.sku === "SKU-IND-CEMT-53G") || allProducts[0];
    
    // Check if user specified a custom price
    const priceMatch = userMessage.match(/(?:at|for|me|in|@)?\s*₹?\s*(\d{3,5})/i);
    const unitPrice = priceMatch && parseInt(priceMatch[1], 10) !== qty ? parseInt(priceMatch[1], 10) : cement.listPrice;

    itemsToQuote.push({
      sku: cement.sku,
      quantity: qty,
      unitPrice,
    });
  }
  // Wire check
  else if (lower.includes("wire") || lower.includes("finolex") || lower.includes("coil") || lower.includes("2.5")) {
    const qtyMatch = userMessage.match(/(\d+)\s*(?:coils?|rolls?)?/i);
    const qty = qtyMatch ? parseInt(qtyMatch[1], 10) : 10;
    const wire = allProducts.find((p) => p.sku === "SKU-IND-WIRE-2.5MM") || allProducts[3];

    // Check discount rate e.g. "1900 me de do" or "at 1900"
    const priceMatch = userMessage.match(/(?:at|for|me|in|@)?\s*₹?\s*(\d{3,5})/i);
    let customPrice = wire.listPrice;
    if (priceMatch) {
      const extracted = parseInt(priceMatch[1], 10);
      if (extracted !== qty && extracted > 500) {
        customPrice = extracted;
      }
    }

    itemsToQuote.push({
      sku: wire.sku,
      quantity: qty,
      unitPrice: customPrice,
    });
  }
  // Paint check
  else if (lower.includes("paint") || lower.includes("apex") || lower.includes("baalti") || lower.includes("bucket")) {
    const qtyMatch = userMessage.match(/(\d+)\s*(?:buckets?|baalti|cans?)?/i);
    const qty = qtyMatch ? parseInt(qtyMatch[1], 10) : 5;
    const paint = allProducts.find((p) => p.sku === "SKU-IND-APEX-20L") || allProducts[6];
    itemsToQuote.push({
      sku: paint.sku,
      quantity: qty,
      unitPrice: paint.listPrice,
    });
  }
  // Rebar / Steel check
  else if (lower.includes("saria") || lower.includes("steel") || lower.includes("rebar") || lower.includes("tiscon")) {
    const qtyMatch = userMessage.match(/(\d+)\s*(?:bundles?|rods?)?/i);
    const qty = qtyMatch ? parseInt(qtyMatch[1], 10) : 10;
    const steel = allProducts.find((p) => p.sku === "SKU-IND-STEEL-12MM") || allProducts[10];
    itemsToQuote.push({
      sku: steel.sku,
      quantity: qty,
      unitPrice: steel.listPrice,
    });
  }
  // Generic product search if any keyword matches
  else {
    const searchResults = store.searchProducts(userMessage);
    if (searchResults.length > 0) {
      const first = searchResults[0];
      itemsToQuote.push({
        sku: first.sku,
        quantity: 50,
        unitPrice: first.listPrice,
      });
    } else {
      // Default fallback: Cement 50 bags
      itemsToQuote.push({
        sku: "SKU-IND-CEMT-53G",
        quantity: 50,
        unitPrice: 420,
      });
    }
  }

  // Generate Quotation with Margin Calculation
  const quoteNumber = `QT-${Math.floor(1000 + Math.random() * 9000)}`;
  let subtotal = 0;
  let totalCost = 0;
  let hasMarginBreach = false;
  const quoteItems: any[] = [];

  for (const it of itemsToQuote) {
    const prod = store.getProductBySku(it.sku)!;
    const lineTotal = it.unitPrice * it.quantity;
    const lineCost = prod.costPrice * it.quantity;
    const margin = Number((((lineTotal - lineCost) / lineTotal) * 100).toFixed(2));
    if (margin < prod.minMarginPercent) {
      hasMarginBreach = true;
    }
    subtotal += lineTotal;
    totalCost += lineCost;

    quoteItems.push({
      sku: prod.sku,
      name: prod.name,
      unit: prod.unit,
      quantity: it.quantity,
      unitCost: prod.costPrice,
      unitPrice: it.unitPrice,
      totalPrice: lineTotal,
      marginPercent: margin,
    });
  }

  const overallMarginPercent = subtotal > 0 ? Number((((subtotal - totalCost) / subtotal) * 100).toFixed(2)) : 0;
  const tax = Number((subtotal * 0.18).toFixed(2));
  const total = Number((subtotal + tax).toFixed(2));
  const status = hasMarginBreach ? "PENDING_APPROVAL" : "APPROVED";
  const approvalNote = hasMarginBreach
    ? `Special discount rate is below minimum gross margin threshold (${overallMarginPercent}% vs required). Flagged for Merchant Manager review.`
    : `Standard wholesale pricing margin approved (${overallMarginPercent}%).`;

  const quotation: Quotation = {
    id: "qt-" + Math.random().toString(36).substring(2, 9),
    quoteNumber,
    customerName: "Apex Infra Builders",
    customerPhone: "+91 98200 12345",
    items: quoteItems,
    subtotal,
    tax,
    total,
    overallMarginPercent,
    status,
    approvalNote,
    currency: "INR",
    currencySymbol: "₹",
    taxLabel: "GST (18%)",
    expiresAt: Date.now() + 24 * 60 * 60 * 1000,
    createdAt: Date.now(),
  };

  store.saveQuotation(quotation);

  store.recordToolTrace({
    id: "tr-" + Math.random().toString(36).substring(2, 9),
    toolName: "generate_quotation",
    input: { customerName: quotation.customerName, items: itemsToQuote },
    output: { quoteNumber, status, total, marginPercent: overallMarginPercent },
    summary: `Created Quote #${quoteNumber} [${status}] Total: ₹${total.toLocaleString("en-IN")} (Margin: ${overallMarginPercent}%)`,
    timestamp: Date.now(),
  });

  let text = "";
  if (status === "PENDING_APPROVAL") {
    text = `📋 I have drafted Quotation #${quoteNumber} for ₹${total.toLocaleString("en-IN")} (${quoteItems.map((i) => `${i.quantity} ${i.unit} ${i.name} @ ₹${i.unitPrice}`).join(", ")} + 18% GST).\n\n⚠️ Please note: Because the requested unit rate is below our standard gross margin threshold (${overallMarginPercent}% vs minimum required), this quotation has been flagged for Merchant Manager review. You will receive an immediate notification as soon as the manager reviews it!`;
  } else {
    text = `📋 Here is your Quotation #${quoteNumber} for ${quoteItems.map((i) => `${i.quantity} ${i.unit} of ${i.name}`).join(", ")} totaling ₹${total.toLocaleString("en-IN")} (including ${quotation.taxLabel}). All items are in stock and margin-compliant.\n\nWould you like me to confirm this and issue your final Tax Invoice?`;
  }

  // Invoke real live neural LLM (Cloudflare Workers AI Llama 3.3 or Google Gemini)
  const systemInstruction = "You are Quoteflow Wholesale Depot AI Merchant Copilot on WhatsApp. You communicate with building contractors in India. Keep responses polite, concise, professional, and formatted for WhatsApp with emojis. Always retain exact figures and quotation numbers.";
  const modelPrompt = `Customer message: "${userMessage}"
Action taken: Generated Quotation #${quoteNumber} for ₹${total.toLocaleString("en-IN")} (${quoteItems.map((i) => `${i.quantity} ${i.unit} of ${i.name}`).join(", ")}).
Status: ${status} (Gross Margin: ${overallMarginPercent}%).
${status === "PENDING_APPROVAL" ? "Explain politely that the requested unit rate is below minimum gross margin and is flagged for Merchant Manager review." : "Present the quote clearly and ask if they wish to confirm and issue the official Tax Invoice."}
Summarize this for the contractor on WhatsApp.`;

  const liveText = await callLiveLLM(modelPrompt, systemInstruction, aiBinding, geminiApiKey);
  if (liveText) {
    text = liveText;
  }

  return {
    text,
    quotation,
    toolCalled: "generate_quotation",
  };
}

async function callLiveLLM(
  prompt: string,
  systemInstruction: string,
  aiBinding?: any,
  geminiApiKey?: string
): Promise<string | null> {
  // 1. Try Cloudflare Workers AI first (@cf/meta/llama-3.3-70b-instruct)
  if (aiBinding && typeof aiBinding.run === "function") {
    try {
      const res = await aiBinding.run("@cf/meta/llama-3.3-70b-instruct", {
        messages: [
          { role: "system", content: systemInstruction },
          { role: "user", content: prompt },
        ],
        max_tokens: 250,
      });
      if (res?.response) return res.response.trim();
    } catch (e) {
      console.warn("Workers AI Llama 3.3 call fallback:", e);
    }
  }

  // 2. Try Google Gemini with active API key
  if (geminiApiKey) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiApiKey}`;
      const payload = {
        system_instruction: { parts: [{ text: systemInstruction }] },
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          maxOutputTokens: 800,
          temperature: 0.3,
          thinkingConfig: { thinkingBudget: 0 },
        },
      };
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (response.ok) {
        const data: any = await response.json();
        const output = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (output) return output.trim();
      }
    } catch (e) {
      console.warn("Gemini live LLM fallback:", e);
    }
  }

  return null;
}
