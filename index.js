#!/usr/bin/env node
/**
 * Human Not Required — MCP Server
 * Exposes the HNR store API as Claude tools so agents can buy hats autonomously.
 *
 * Tools:
 *   list_products      — see what's for sale
 *   register_human     — register a human (get api_key + setup_url)
 *   resend_setup       — get api_key + fresh setup link for existing human
 *   place_order        — buy a hat (charges saved card or uses promo)
 *   get_order          — check order status
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const BASE_URL = 'https://web-production-77376.up.railway.app';

async function api(path, { method = 'GET', body, apiKey } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  return { status: res.status, data };
}

const server = new McpServer({
  name: 'humannotrequired',
  version: '1.0.0',
});

// ── list_products ──────────────────────────────────────────────────────────────
server.tool(
  'list_products',
  'List all available products and prices at the Human Not Required store. Call this first to confirm the SKU.',
  {},
  async () => {
    const { data } = await api('/orders/skus');
    return {
      content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
    };
  }
);

// ── register_human ─────────────────────────────────────────────────────────────
server.tool(
  'register_human',
  'Register a human to create their account and get an api_key. Call this once per human — the api_key never expires. If you have a promo_code, include it and no card setup is needed.',
  {
    name: z.string().describe('Full name for the shipping label'),
    email: z.string().email().describe('Human\'s email for receipts and account'),
    address_line1: z.string().describe('Street address'),
    address_line2: z.string().optional().describe('Apt, suite, etc. (optional)'),
    address_city: z.string().describe('City'),
    address_state: z.string().describe('State or province code e.g. NY, ON'),
    address_postal_code: z.string().describe('Postal/ZIP code'),
    address_country: z.string().describe('ISO country code e.g. US, CA, GB'),
    promo_code: z.string().optional().describe('Optional promo code for a free order — no card needed'),
  },
  async ({ name, email, address_line1, address_line2, address_city, address_state, address_postal_code, address_country, promo_code }) => {
    const { status, data } = await api('/register', {
      method: 'POST',
      body: {
        name,
        email,
        promo_code,
        address: {
          line1: address_line1,
          line2: address_line2,
          city: address_city,
          state: address_state,
          postal_code: address_postal_code,
          country: address_country,
        },
      },
    });
    return {
      content: [{ type: 'text', text: JSON.stringify({ status, ...data }, null, 2) }],
    };
  }
);

// ── resend_setup ───────────────────────────────────────────────────────────────
server.tool(
  'resend_setup',
  'Get the api_key and a fresh card setup link for a human who is already registered. Use this if register_human returns 409.',
  {
    email: z.string().email().describe('The human\'s registered email address'),
  },
  async ({ email }) => {
    const { status, data } = await api('/register/resend-setup', {
      method: 'POST',
      body: { email },
    });
    return {
      content: [{ type: 'text', text: JSON.stringify({ status, ...data }, null, 2) }],
    };
  }
);

// ── place_order ────────────────────────────────────────────────────────────────
server.tool(
  'place_order',
  'Place an order on behalf of the human. Charges their saved card or uses a promo credit. Requires the api_key from register_human.',
  {
    api_key: z.string().describe('Bearer token from register_human or resend_setup'),
    sku: z.string().describe('Product SKU — use list_products to confirm. Currently: hat-myagent-os'),
  },
  async ({ api_key, sku }) => {
    const { status, data } = await api('/orders', {
      method: 'POST',
      apiKey: api_key,
      body: { sku },
    });
    return {
      content: [{ type: 'text', text: JSON.stringify({ status, ...data }, null, 2) }],
    };
  }
);

// ── get_order ──────────────────────────────────────────────────────────────────
server.tool(
  'get_order',
  'Check the status of a previously placed order.',
  {
    api_key: z.string().describe('Bearer token for the account that placed the order'),
    order_id: z.string().describe('Order ID from place_order response'),
  },
  async ({ api_key, order_id }) => {
    const { status, data } = await api(`/orders/${order_id}`, { apiKey: api_key });
    return {
      content: [{ type: 'text', text: JSON.stringify({ status, ...data }, null, 2) }],
    };
  }
);

// ── start ──────────────────────────────────────────────────────────────────────
const transport = new StdioServerTransport();
await server.connect(transport);
