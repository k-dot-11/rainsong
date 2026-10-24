import { DurableObject } from "cloudflare:workers";
import { createModels } from "@earendil-works/pi-ai/models";
import { createRegistry, Harness } from "@earendil-works/pi-durable";
import { PiHarness } from "agents/harness/pi";
import { Lifecycle } from "agents/lifecycle";
import { createAI } from "agents/models/pi-ai";
import { SqliteStore } from "./db/sqlite-store";
import { createMerchantTools } from "./tools/merchant-tools";
import { renderMerchantSystemPrompt } from "./agent/merchant-system-prompt";

export interface Env {
  AI: any;
  MERCHANT_AGENT: DurableObjectNamespace<MerchantAssistant>;
  ASSETS?: Fetcher;
}

export class MerchantAssistant extends DurableObject<Env> {
  private store: SqliteStore;
  private ai: ReturnType<typeof createAI>;
  private registry = createRegistry();
  private harness: PiHarness;
  private lifecycle: any;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.store = new SqliteStore(this.ctx.storage.sql);
    this.ai = createAI({ binding: this.env.AI });

    // Install merchant domain tools and dynamic prompt extension
    const merchantTools = createMerchantTools(this.store);
    this.registry.install({
      name: "merchant_domain_extension",
      sections: [
        {
          key: "merchant_system_instructions",
          render: () => renderMerchantSystemPrompt(this.store),
          tag: false,
        },
      ],
      tools: merchantTools,
    });

    // Initialize PiHarness with Workers AI Llama 3.3
    this.harness = new PiHarness({
      harness: ({ storage, context, onWake }) => {
        const models = createModels();
        models.setProvider(this.ai.provider);
        return Harness.open(
          storage,
          { models, registry: this.registry, onWake },
          context
        );
      },
      defaults: {
        model: this.ai("@cf/meta/llama-3.3-70b-instruct"),
      },
    });

    // Install Agents SDK Lifecycle
    this.lifecycle = Lifecycle.install(this).use(this.harness);
  }

  // Durable Object Alarm: Checks for expired quotations & maintains lifecycle scheduling
  async alarm(): Promise<void> {
    const quotations = this.store.getQuotations("PENDING_APPROVAL");
    const now = Date.now();
    for (const q of quotations) {
      if (q.expiresAt && q.expiresAt < now) {
        this.store.updateQuotationStatus(q.quoteNumber, "EXPIRED", "Quotation expired after 24 hours validity.");
      }
    }
  }

  // Handle incoming HTTP and API calls routed to this Durable Object
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      // 1. GET /state - returns full state of the merchant agent
      if (path === "/state" || path === "/api/agent/state") {
        const products = this.store.getAllProducts();
        const quotations = this.store.getQuotations();
        const invoices = this.store.getInvoices();
        const traces = this.store.getToolTraces(25);
        let messages: any[] = [];
        try {
          messages = await this.harness.messages();
        } catch (e) {
          console.warn("Could not read messages transcript:", e);
        }

        return Response.json(
          {
            status: "ready",
            products,
            quotations,
            invoices,
            traces,
            messages,
          },
          { headers: corsHeaders }
        );
      }

      // 2. POST /chat - sends message into the Pi agent loop
      if (path === "/chat" || path === "/api/chat") {
        const body = (await request.json()) as { message: string };
        if (!body.message) {
          return Response.json({ error: "Missing message field" }, { status: 400, headers: corsHeaders });
        }

        const promptResult = await this.harness.prompt(body.message);
        const quotations = this.store.getQuotations();
        const invoices = this.store.getInvoices();
        const traces = this.store.getToolTraces(10);

        return Response.json(
          {
            text: promptResult.text,
            status: promptResult.status,
            messages: promptResult.messages,
            quotations,
            invoices,
            traces,
          },
          { headers: corsHeaders }
        );
      }

      // 3. POST /manager/approve - Merchant Manager approves a pending discount quote
      if (path === "/manager/approve" || path === "/api/manager/approve") {
        const body = (await request.json()) as { quoteNumber: string; note?: string };
        const updated = this.store.updateQuotationStatus(
          body.quoteNumber,
          "APPROVED",
          body.note || "Approved by Merchant Manager. Ready to convert."
        );

        if (!updated) {
          return Response.json({ error: "Quote not found" }, { status: 404, headers: corsHeaders });
        }

        // Steer / prompt the agent with the approval outcome
        const steerPrompt = `[System Notice: Merchant Manager has APPROVED Quote #${body.quoteNumber}. Note: "${body.note || "Discount approved"}". Notify the customer courteously and ask if they would like to issue the official Tax Invoice.]`;
        const agentResponse = await this.harness.prompt(steerPrompt, {
          entry: {
            kind: "app.approval",
            data: { approved: true, quoteNumber: body.quoteNumber, by: "Merchant Manager" },
          },
        });

        return Response.json(
          {
            success: true,
            quote: updated,
            agentMessage: agentResponse.text,
            quotations: this.store.getQuotations(),
            traces: this.store.getToolTraces(5),
          },
          { headers: corsHeaders }
        );
      }

      // 4. POST /manager/counter - Merchant Manager issues a counter-offer
      if (path === "/manager/counter" || path === "/api/manager/counter") {
        const body = (await request.json()) as { quoteNumber: string; counterRate: number; note?: string };
        const quote = this.store.getQuotationByNumber(body.quoteNumber);
        if (!quote) {
          return Response.json({ error: "Quote not found" }, { status: 404, headers: corsHeaders });
        }

        // Adjust quote items and totals
        if (quote.items.length > 0) {
          quote.items[0].unitPrice = body.counterRate;
          quote.items[0].totalPrice = body.counterRate * quote.items[0].quantity;
          quote.subtotal = quote.items.reduce((s, i) => s + i.totalPrice, 0);
          quote.tax = Number((quote.subtotal * 0.18).toFixed(2));
          quote.total = Number((quote.subtotal + quote.tax).toFixed(2));
          quote.status = "APPROVED";
          quote.approvalNote = body.note || `Counter-offer: ₹${body.counterRate} / unit`;
          this.store.saveQuotation(quote);
        }

        const steerPrompt = `[System Notice: Merchant Manager has submitted a COUNTER-OFFER for Quote #${body.quoteNumber}. Revised Unit Rate: ₹${body.counterRate}. Note: "${body.note || "Best possible rate"}". Inform the customer courteously in conversational tone and ask if they agree to proceed with this rate.]`;
        const agentResponse = await this.harness.prompt(steerPrompt, {
          entry: {
            kind: "app.counter_offer",
            data: { quoteNumber: body.quoteNumber, counterRate: body.counterRate, by: "Merchant Manager" },
          },
        });

        return Response.json(
          {
            success: true,
            quote,
            agentMessage: agentResponse.text,
            quotations: this.store.getQuotations(),
            traces: this.store.getToolTraces(5),
          },
          { headers: corsHeaders }
        );
      }

      // 5. POST /reset - clears current session
      if (path === "/reset" || path === "/api/reset") {
        await this.harness.session().reset();
        return Response.json({ success: true, message: "Session reset" }, { headers: corsHeaders });
      }

      return Response.json({ error: "Route not found in Durable Object" }, { status: 404, headers: corsHeaders });
    } catch (err: any) {
      console.error("Durable Object error:", err);
      return Response.json({ error: err?.message || String(err) }, { status: 500, headers: corsHeaders });
    }
  }
}

// Cloudflare Worker main router
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Health check
    if (url.pathname === "/api/health") {
      return Response.json({
        service: "QuoteFlow Edge",
        status: "healthy",
        platform: "Cloudflare Workers & Durable Objects",
        runtime: "Cloudflare Agents SDK + PiHarness",
        model: "@cf/meta/llama-3.3-70b-instruct",
        timestamp: new Date().toISOString(),
      });
    }

    // Forward API requests to the Durable Object singleton or session
    if (url.pathname.startsWith("/api/")) {
      const sessionId = url.searchParams.get("session") || "default-merchant-session";
      const id = env.MERCHANT_AGENT.idFromName(sessionId);
      const stub = env.MERCHANT_AGENT.get(id);
      return stub.fetch(request);
    }

    // Serve static frontend assets from Workers Static Assets binding
    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    return new Response("QuoteFlow Edge API is running. Build frontend assets to view the web console.", {
      headers: { "Content-Type": "text/plain" },
    });
  },
};
