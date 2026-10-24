import { Product, Quotation, Invoice, AgentToolTrace, QuoteItem } from "../shared/types";
import { INITIAL_PRODUCTS } from "./seed";

export class SqliteStore {
  private sql: DurableObjectStorage["sql"];

  constructor(sql: DurableObjectStorage["sql"]) {
    this.sql = sql;
    this.initTables();
    this.seedProducts();
  }

  private initTables() {
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS products (
        id TEXT PRIMARY KEY,
        sku TEXT UNIQUE,
        name TEXT,
        category TEXT,
        unit TEXT,
        cost_price REAL,
        list_price REAL,
        min_margin_percent REAL,
        stock_quantity INTEGER,
        currency TEXT,
        currency_symbol TEXT
      );

      CREATE TABLE IF NOT EXISTS product_nicknames (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        product_sku TEXT,
        nickname TEXT UNIQUE
      );

      CREATE TABLE IF NOT EXISTS quotations (
        id TEXT PRIMARY KEY,
        quote_number TEXT UNIQUE,
        customer_name TEXT,
        customer_phone TEXT,
        items_json TEXT,
        subtotal REAL,
        tax REAL,
        total REAL,
        overall_margin_percent REAL,
        status TEXT,
        approval_note TEXT,
        currency TEXT,
        currency_symbol TEXT,
        tax_label TEXT,
        expires_at INTEGER,
        created_at INTEGER
      );

      CREATE TABLE IF NOT EXISTS invoices (
        id TEXT PRIMARY KEY,
        invoice_number TEXT UNIQUE,
        quote_number TEXT,
        customer_name TEXT,
        customer_phone TEXT,
        items_json TEXT,
        subtotal REAL,
        tax REAL,
        total REAL,
        payment_terms TEXT,
        status TEXT,
        currency TEXT,
        currency_symbol TEXT,
        tax_label TEXT,
        created_at INTEGER
      );

      CREATE TABLE IF NOT EXISTS tool_traces (
        id TEXT PRIMARY KEY,
        tool_name TEXT,
        input_json TEXT,
        output_json TEXT,
        summary TEXT,
        timestamp INTEGER
      );

      CREATE TABLE IF NOT EXISTS chat_messages (
        id TEXT PRIMARY KEY,
        role TEXT,
        text TEXT,
        metadata_json TEXT,
        created_at INTEGER
      );
    `);
  }

  private seedProducts() {
    const cursor = this.sql.exec("SELECT COUNT(*) as count FROM products");
    const row = cursor.toArray()[0] as { count: number };
    if (row.count > 0) return;

    for (const p of INITIAL_PRODUCTS) {
      this.sql.exec(
        `INSERT OR REPLACE INTO products (id, sku, name, category, unit, cost_price, list_price, min_margin_percent, stock_quantity, currency, currency_symbol)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        p.id,
        p.sku,
        p.name,
        p.category,
        p.unit,
        p.costPrice,
        p.listPrice,
        p.minMarginPercent,
        p.stockQuantity,
        p.currency,
        p.currencySymbol
      );

      for (const nick of p.nicknames) {
        this.sql.exec(
          `INSERT OR IGNORE INTO product_nicknames (product_sku, nickname) VALUES (?, ?)`,
          p.sku,
          nick.toLowerCase().trim()
        );
      }
    }
  }

  // --- Products & Nicknames ---
  getAllProducts(): Product[] {
    const rows = this.sql.exec("SELECT * FROM products ORDER BY name ASC").toArray() as any[];
    return rows.map((r) => this.mapProduct(r));
  }

  getProductBySku(sku: string): Product | null {
    const rows = this.sql.exec("SELECT * FROM products WHERE sku = ?", sku).toArray() as any[];
    if (rows.length === 0) return null;
    return this.mapProduct(rows[0]);
  }

  searchProducts(query: string): Product[] {
    const q = query.toLowerCase().trim();
    if (!q) return this.getAllProducts();

    // 1. Direct nickname match
    const nickRows = this.sql
      .exec("SELECT product_sku FROM product_nicknames WHERE nickname LIKE ?", `%${q}%`)
      .toArray() as any[];
    
    const matchedSkus = new Set<string>(nickRows.map((nr) => nr.product_sku));

    // 2. Product name, sku, or category search
    const prodRows = this.sql
      .exec(
        "SELECT * FROM products WHERE sku LIKE ? OR name LIKE ? OR category LIKE ?",
        `%${q}%`,
        `%${q}%`,
        `%${q}%`
      )
      .toArray() as any[];

    for (const r of prodRows) {
      matchedSkus.add(r.sku);
    }

    const results: Product[] = [];
    for (const sku of matchedSkus) {
      const p = this.getProductBySku(sku);
      if (p) results.push(p);
    }
    return results;
  }

  addNickname(sku: string, nickname: string): boolean {
    const product = this.getProductBySku(sku);
    if (!product) return false;
    this.sql.exec(
      "INSERT OR IGNORE INTO product_nicknames (product_sku, nickname) VALUES (?, ?)",
      sku,
      nickname.toLowerCase().trim()
    );
    return true;
  }

  private mapProduct(r: any): Product {
    const nickRows = this.sql
      .exec("SELECT nickname FROM product_nicknames WHERE product_sku = ?", r.sku)
      .toArray() as any[];
    return {
      id: r.id,
      sku: r.sku,
      name: r.name,
      category: r.category,
      unit: r.unit,
      costPrice: r.cost_price,
      listPrice: r.list_price,
      minMarginPercent: r.min_margin_percent,
      stockQuantity: r.stock_quantity,
      currency: r.currency,
      currencySymbol: r.currency_symbol,
      nicknames: nickRows.map((n) => n.nickname),
    };
  }

  // --- Quotations ---
  saveQuotation(q: Quotation): void {
    this.sql.exec(
      `INSERT OR REPLACE INTO quotations 
       (id, quote_number, customer_name, customer_phone, items_json, subtotal, tax, total, overall_margin_percent, status, approval_note, currency, currency_symbol, tax_label, expires_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      q.id,
      q.quoteNumber,
      q.customerName,
      q.customerPhone || null,
      JSON.stringify(q.items),
      q.subtotal,
      q.tax,
      q.total,
      q.overallMarginPercent,
      q.status,
      q.approvalNote || null,
      q.currency,
      q.currencySymbol,
      q.taxLabel,
      q.expiresAt,
      q.createdAt
    );
  }

  getQuotationByNumber(quoteNumber: string): Quotation | null {
    const rows = this.sql
      .exec("SELECT * FROM quotations WHERE quote_number = ?", quoteNumber)
      .toArray() as any[];
    if (rows.length === 0) return null;
    return this.mapQuotation(rows[0]);
  }

  getQuotations(statusFilter?: string): Quotation[] {
    let query = "SELECT * FROM quotations";
    const params: any[] = [];
    if (statusFilter) {
      query += " WHERE status = ?";
      params.push(statusFilter);
    }
    query += " ORDER BY created_at DESC";
    const rows = this.sql.exec(query, ...params).toArray() as any[];
    return rows.map((r) => this.mapQuotation(r));
  }

  updateQuotationStatus(quoteNumber: string, status: Quotation["status"], note?: string): Quotation | null {
    const quote = this.getQuotationByNumber(quoteNumber);
    if (!quote) return null;
    quote.status = status;
    if (note !== undefined) quote.approvalNote = note;
    this.saveQuotation(quote);
    return quote;
  }

  private mapQuotation(r: any): Quotation {
    return {
      id: r.id,
      quoteNumber: r.quote_number,
      customerName: r.customer_name,
      customerPhone: r.customer_phone,
      items: JSON.parse(r.items_json || "[]") as QuoteItem[],
      subtotal: r.subtotal,
      tax: r.tax,
      total: r.total,
      overallMarginPercent: r.overall_margin_percent,
      status: r.status,
      approvalNote: r.approval_note,
      currency: r.currency,
      currencySymbol: r.currency_symbol,
      taxLabel: r.tax_label,
      expiresAt: r.expires_at,
      createdAt: r.created_at,
    };
  }

  // --- Invoices ---
  saveInvoice(inv: Invoice): void {
    this.sql.exec(
      `INSERT OR REPLACE INTO invoices 
       (id, invoice_number, quote_number, customer_name, customer_phone, items_json, subtotal, tax, total, payment_terms, status, currency, currency_symbol, tax_label, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      inv.id,
      inv.invoiceNumber,
      inv.quoteNumber,
      inv.customerName,
      inv.customerPhone || null,
      JSON.stringify(inv.items),
      inv.subtotal,
      inv.tax,
      inv.total,
      inv.paymentTerms,
      inv.status,
      inv.currency,
      inv.currencySymbol,
      inv.taxLabel,
      inv.createdAt
    );
  }

  getInvoiceByNumber(invoiceNumber: string): Invoice | null {
    const rows = this.sql
      .exec("SELECT * FROM invoices WHERE invoice_number = ?", invoiceNumber)
      .toArray() as any[];
    if (rows.length === 0) return null;
    return this.mapInvoice(rows[0]);
  }

  getInvoices(): Invoice[] {
    const rows = this.sql.exec("SELECT * FROM invoices ORDER BY created_at DESC").toArray() as any[];
    return rows.map((r) => this.mapInvoice(r));
  }

  private mapInvoice(r: any): Invoice {
    return {
      id: r.id,
      invoiceNumber: r.invoice_number,
      quoteNumber: r.quote_number,
      customerName: r.customer_name,
      customerPhone: r.customer_phone,
      items: JSON.parse(r.items_json || "[]") as QuoteItem[],
      subtotal: r.subtotal,
      tax: r.tax,
      total: r.total,
      paymentTerms: r.payment_terms,
      status: r.status,
      currency: r.currency,
      currencySymbol: r.currency_symbol,
      taxLabel: r.tax_label,
      createdAt: r.created_at,
    };
  }

  // --- Tool Traces ---
  recordToolTrace(trace: AgentToolTrace): void {
    this.sql.exec(
      `INSERT INTO tool_traces (id, tool_name, input_json, output_json, summary, timestamp)
       VALUES (?, ?, ?, ?, ?, ?)`,
      trace.id,
      trace.toolName,
      JSON.stringify(trace.input),
      JSON.stringify(trace.output),
      trace.summary,
      trace.timestamp
    );
  }

  getToolTraces(limit: number = 30): AgentToolTrace[] {
    const rows = this.sql
      .exec("SELECT * FROM tool_traces ORDER BY timestamp DESC LIMIT ?", limit)
      .toArray() as any[];
    return rows.map((r) => ({
      id: r.id,
      toolName: r.tool_name,
      input: JSON.parse(r.input_json || "{}"),
      output: JSON.parse(r.output_json || "{}"),
      summary: r.summary,
      timestamp: r.timestamp,
    }));
  }

  // --- Chat Messages Transcript ---
  saveMessage(role: "user" | "assistant" | "system", text: string, metadata?: any): void {
    const id = "msg-" + Math.random().toString(36).substring(2, 9);
    this.sql.exec(
      `INSERT INTO chat_messages (id, role, text, metadata_json, created_at)
       VALUES (?, ?, ?, ?, ?)`,
      id,
      role,
      text,
      JSON.stringify(metadata || {}),
      Date.now()
    );
  }

  getMessages(): Array<{ id: string; role: string; text: string; metadata?: any; timestamp: number }> {
    const rows = this.sql
      .exec("SELECT * FROM chat_messages ORDER BY created_at ASC")
      .toArray() as any[];
    return rows.map((r) => ({
      id: r.id,
      role: r.role,
      text: r.text,
      metadata: JSON.parse(r.metadata_json || "{}"),
      timestamp: r.created_at,
    }));
  }

  clearMessages(): void {
    this.sql.exec("DELETE FROM chat_messages");
  }
}
