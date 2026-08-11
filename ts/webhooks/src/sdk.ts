/**
 * SDK facade for figma-webhooks
 * Provides ergonomic API for Figma Webhooks operations.
 *
 * Every Figma call routes through the generic client verbs
 * (`fetcher.get/post/put/delete`) against the v2 webhooks endpoints — the SDK
 * does NOT depend on bespoke `fetcher.createWebhook`/`paginateWebhooks`/… domain
 * methods (which the shipped `FigmaApiClient` does not implement). Pagination,
 * signature verification, and the event/context vocabularies live in this
 * service layer (R1), mirroring the Python edition's behavior.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

/** Figma v2 webhook event types. */
export const WEBHOOK_EVENT_TYPES = [
  "PING",
  "FILE_UPDATE",
  "FILE_VERSION_UPDATE",
  "FILE_DELETE",
  "LIBRARY_PUBLISH",
  "FILE_COMMENT",
] as const;

/** Figma v2 webhook context types. */
export const WEBHOOK_CONTEXT_TYPES = ["team", "project", "file"] as const;

export interface FigmaWebhooksSDKConfig {
  /** FigmaApiClient instance (required) */
  fetcher: any;
  /** Custom logger */
  logger?: any;
}

/**
 * High-level SDK for Figma Webhooks API
 * Provides convenient methods for common webhook operations
 *
 * @example
 * import { FigmaApiClient } from '@figma-api/fetch';
 * import { FigmaWebhooksSDK } from 'figma-webhooks';
 *
 * const fetcher = new FigmaApiClient({ apiToken: process.env.FIGMA_TOKEN });
 * const sdk = new FigmaWebhooksSDK({ fetcher });
 */
export class FigmaWebhooksSDK {
  fetcher: any;
  logger: any;

  /**
   * Initialize the Figma Webhooks SDK
   * @param config - Configuration object
   * @param config.fetcher - FigmaApiClient instance (required)
   * @param config.logger - Custom logger
   */
  constructor(
    {
      fetcher,
      logger = console,
    }: FigmaWebhooksSDKConfig = {} as FigmaWebhooksSDKConfig,
  ) {
    if (!fetcher) {
      throw new Error(
        "fetcher parameter is required. Please create and pass a FigmaApiClient instance.",
      );
    }

    this.fetcher = fetcher;
    this.logger = logger;
  }

  // === Internal helpers (generic-verb plumbing) ===

  /**
   * Build the snake_case v2 create/update body Figma expects from a camelCase
   * options object, dropping undefined fields.
   */
  private _toWebhookBody(input: Record<string, any>): Record<string, any> {
    const map: Record<string, string> = {
      eventType: "event_type",
      contextId: "context_id",
      planApiId: "plan_api_id",
    };
    const body: Record<string, any> = {};
    for (const [key, value] of Object.entries(input)) {
      if (value === undefined) continue;
      body[map[key] || key] = value;
    }
    return body;
  }

  /** Unwrap a `{ webhook }` envelope (Figma returns the created/updated webhook nested). */
  private _unwrapWebhook(response: any): any {
    return response?.webhook ?? response;
  }

  /** POST /v2/webhooks (create). */
  private async _createWebhook(input: Record<string, any>): Promise<any> {
    const response = await this.fetcher.post(
      "/v2/webhooks",
      this._toWebhookBody(input),
    );
    return this._unwrapWebhook(response);
  }

  /** Is this error a 404 from the shared error model? */
  private _isNotFound(error: any): boolean {
    return error?.code === "NOT_FOUND" || error?.meta?.status === 404;
  }

  // === Webhook Management Methods ===

  /**
   * Create a file update webhook
   * @returns Created webhook
   */
  async createFileWebhook({
    fileKey,
    endpoint,
    passcode,
    description,
    active = true,
  }: {
    fileKey: string;
    endpoint: string;
    passcode: string;
    description?: string;
    active?: boolean;
  }): Promise<any> {
    return this._createWebhook({
      eventType: "FILE_UPDATE",
      context: "file",
      contextId: fileKey,
      endpoint,
      passcode,
      status: active ? "ACTIVE" : "PAUSED",
      description,
    });
  }

  /**
   * Create a project webhook for all files in a project
   * @returns Created webhook
   */
  async createProjectWebhook({
    projectId,
    eventType = "FILE_UPDATE",
    endpoint,
    passcode,
    description,
    active = true,
  }: {
    projectId: string;
    eventType?: string;
    endpoint: string;
    passcode: string;
    description?: string;
    active?: boolean;
  }): Promise<any> {
    return this._createWebhook({
      eventType,
      context: "project",
      contextId: projectId,
      endpoint,
      passcode,
      status: active ? "ACTIVE" : "PAUSED",
      description,
    });
  }

  /**
   * Create a team webhook for all team activity
   * @returns Created webhook
   */
  async createTeamWebhook({
    teamId,
    eventType = "FILE_UPDATE",
    endpoint,
    passcode,
    description,
    active = true,
  }: {
    teamId: string;
    eventType?: string;
    endpoint: string;
    passcode: string;
    description?: string;
    active?: boolean;
  }): Promise<any> {
    return this._createWebhook({
      eventType,
      context: "team",
      contextId: teamId,
      endpoint,
      passcode,
      status: active ? "ACTIVE" : "PAUSED",
      description,
    });
  }

  /**
   * Get webhook by ID with enhanced error handling
   * @param webhookId - Webhook ID
   * @returns Webhook data or null if not found
   */
  async getWebhook(webhookId: string): Promise<any | null> {
    try {
      const response = await this.fetcher.get(`/v2/webhooks/${webhookId}`);
      return this._unwrapWebhook(response);
    } catch (error: any) {
      if (this._isNotFound(error)) {
        return null;
      }
      throw error;
    }
  }

  /**
   * List all webhooks for a context
   * @param options - Query options ({ context, contextId, planApiId })
   * @returns Array of webhooks
   */
  async listWebhooks(options: Record<string, any> = {}): Promise<any[]> {
    const response = await this.fetcher.get(
      "/v2/webhooks",
      this._toWebhookBody(options),
    );
    return response.webhooks || [];
  }

  /**
   * List all webhooks across all accessible contexts, following pagination.
   * @param planApiId - Plan API ID
   * @returns Array of all webhooks
   */
  async listAllWebhooks(planApiId: string): Promise<any[]> {
    const webhooks: any[] = [];
    let cursor: string | undefined;

    do {
      const params: Record<string, any> = { plan_api_id: planApiId };
      if (cursor) params.cursor = cursor;
      const response = await this.fetcher.get("/v2/webhooks", params);
      if (Array.isArray(response.webhooks)) {
        webhooks.push(...response.webhooks);
      }
      cursor = response.next_page || undefined;
    } while (cursor);

    return webhooks;
  }

  /**
   * Update webhook with partial data
   * @param webhookId - Webhook ID
   * @param updates - Fields to update
   * @returns Updated webhook
   */
  async updateWebhook(
    webhookId: string,
    updates: Record<string, any>,
  ): Promise<any> {
    const response = await this.fetcher.put(
      `/v2/webhooks/${webhookId}`,
      this._toWebhookBody(updates),
    );
    return this._unwrapWebhook(response);
  }

  /**
   * Delete webhook with confirmation
   * @param webhookId - Webhook ID
   * @returns True if successfully deleted
   */
  async deleteWebhook(webhookId: string): Promise<boolean> {
    try {
      await this.fetcher.delete(`/v2/webhooks/${webhookId}`);
      return true;
    } catch (error: any) {
      if (this._isNotFound(error)) {
        return false; // Already deleted
      }
      throw error;
    }
  }

  /**
   * Pause webhook
   * @param webhookId - Webhook ID
   * @returns Updated webhook
   */
  async pauseWebhook(webhookId: string): Promise<any> {
    return this.updateWebhook(webhookId, { status: "PAUSED" });
  }

  /**
   * Activate webhook
   * @param webhookId - Webhook ID
   * @returns Updated webhook
   */
  async activateWebhook(webhookId: string): Promise<any> {
    return this.updateWebhook(webhookId, { status: "ACTIVE" });
  }

  // === Webhook Monitoring Methods ===

  /**
   * Get webhook delivery history for debugging
   * @param webhookId - Webhook ID
   * @returns Recent webhook requests
   */
  async getWebhookHistory(webhookId: string): Promise<any[]> {
    const response = await this.fetcher.get(
      `/v2/webhooks/${webhookId}/requests`,
    );
    return response.requests || [];
  }

  /**
   * Check webhook health by analyzing recent deliveries
   * @param webhookId - Webhook ID
   * @returns Health status report
   */
  async checkWebhookHealth(webhookId: string): Promise<any> {
    const requests = await this.getWebhookHistory(webhookId);

    if (requests.length === 0) {
      return {
        status: "unknown",
        message: "No recent webhook deliveries found",
        successRate: null,
        lastDelivery: null,
      };
    }

    const successful = requests.filter(
      (req: any) =>
        req.response_info && parseInt(req.response_info.status, 10) < 400,
    );

    const successRate = successful.length / requests.length;
    const lastRequest = requests[0]; // Most recent

    let status = "healthy";
    let message = `Webhook is healthy (${Math.round(successRate * 100)}% success rate)`;

    if (successRate < 0.8) {
      status = "degraded";
      message = `Webhook is experiencing issues (${Math.round(successRate * 100)}% success rate)`;
    }

    if (successRate === 0) {
      status = "failing";
      message = "Webhook is failing all deliveries";
    }

    return {
      status,
      message,
      successRate,
      lastDelivery: lastRequest?.request_info?.sent_at,
      totalRequests: requests.length,
      successfulRequests: successful.length,
      failedRequests: requests.length - successful.length,
    };
  }

  // === Bulk Operations ===

  /**
   * Create multiple webhooks with the same configuration
   * @param contextIds - Array of context IDs
   * @param webhookConfig - Base webhook configuration
   * @returns Results with created webhooks and errors
   */
  async createBulkWebhooks(
    contextIds: string[],
    webhookConfig: Record<string, any>,
  ): Promise<any> {
    const results: { created: any[]; errors: any[] } = {
      created: [],
      errors: [],
    };

    for (const contextId of contextIds) {
      try {
        const webhook = await this._createWebhook({
          ...webhookConfig,
          contextId,
        });
        results.created.push(webhook);
      } catch (error: any) {
        results.errors.push({
          contextId,
          error: error.message,
          code: error.code,
        });
      }
    }

    return results;
  }

  /**
   * Delete multiple webhooks
   * @param webhookIds - Array of webhook IDs
   * @returns Results with deletion status
   */
  async deleteBulkWebhooks(webhookIds: string[]): Promise<any> {
    const results: { deleted: any[]; errors: any[] } = {
      deleted: [],
      errors: [],
    };

    for (const webhookId of webhookIds) {
      try {
        await this.deleteWebhook(webhookId);
        results.deleted.push(webhookId);
      } catch (error: any) {
        results.errors.push({
          webhookId,
          error: error.message,
          code: error.code,
        });
      }
    }

    return results;
  }

  /**
   * Pause multiple webhooks
   * @param webhookIds - Array of webhook IDs
   * @returns Results with pause status
   */
  async pauseBulkWebhooks(webhookIds: string[]): Promise<any> {
    const results: { paused: any[]; errors: any[] } = {
      paused: [],
      errors: [],
    };

    for (const webhookId of webhookIds) {
      try {
        const webhook = await this.pauseWebhook(webhookId);
        results.paused.push(webhook);
      } catch (error: any) {
        results.errors.push({
          webhookId,
          error: error.message,
          code: error.code,
        });
      }
    }

    return results;
  }

  // === Webhook Discovery ===

  /**
   * Find webhooks by endpoint URL
   * @param endpoint - Endpoint URL to search for
   * @param planApiId - Plan API ID
   * @returns Matching webhooks
   */
  async findWebhooksByEndpoint(
    endpoint: string,
    planApiId: string,
  ): Promise<any[]> {
    const allWebhooks = await this.listAllWebhooks(planApiId);
    return allWebhooks.filter((webhook: any) => webhook.endpoint === endpoint);
  }

  /**
   * Find webhooks by event type
   * @param eventType - Event type to search for
   * @param planApiId - Plan API ID
   * @returns Matching webhooks
   */
  async findWebhooksByEventType(
    eventType: string,
    planApiId: string,
  ): Promise<any[]> {
    const allWebhooks = await this.listAllWebhooks(planApiId);
    return allWebhooks.filter(
      (webhook: any) => webhook.event_type === eventType,
    );
  }

  /**
   * Find inactive webhooks
   * @param planApiId - Plan API ID
   * @returns Inactive webhooks
   */
  async findInactiveWebhooks(planApiId: string): Promise<any[]> {
    const allWebhooks = await this.listAllWebhooks(planApiId);
    return allWebhooks.filter((webhook: any) => webhook.status === "PAUSED");
  }

  // === Convenience Methods ===

  /**
   * Test webhook endpoint connectivity
   * @param endpoint - Endpoint URL to test
   * @returns Test results
   */
  async testWebhookEndpoint(endpoint: string): Promise<any> {
    const testPayload = {
      event_type: "PING",
      timestamp: new Date().toISOString(),
      webhook_id: "test",
    };

    try {
      // Use the global fetch for arbitrary (non-Figma) endpoints.
      const response: any = await globalThis.fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Figma-Event": "PING",
        },
        body: JSON.stringify(testPayload),
      });

      return {
        reachable: true,
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers.entries()),
      };
    } catch (error: any) {
      return {
        reachable: false,
        error: error.message,
      };
    }
  }

  /**
   * Verify a webhook payload signature.
   *
   * Figma signs the request body with an HMAC-SHA256 keyed by the webhook
   * passcode and delivers it in the `X-Figma-Signature` header. This compares
   * the computed digest to the provided signature in constant time.
   *
   * @param payload - Raw webhook payload (the exact request body bytes/string)
   * @param signature - The `X-Figma-Signature` header value (hex)
   * @param passcode - The webhook passcode used as the HMAC key
   * @returns Whether the signature is valid
   */
  verifySignature(
    payload: string,
    signature: string,
    passcode: string,
  ): boolean {
    if (!payload || !signature || !passcode) return false;
    const expected = createHmac("sha256", passcode)
      .update(payload)
      .digest("hex");
    const a = Buffer.from(expected);
    const b = Buffer.from(signature);
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  }

  /**
   * Get supported event types
   * @returns Available event types
   */
  getSupportedEventTypes(): string[] {
    return [...WEBHOOK_EVENT_TYPES];
  }

  /**
   * Get supported context types
   * @returns Available context types
   */
  getSupportedContextTypes(): string[] {
    return [...WEBHOOK_CONTEXT_TYPES];
  }

  /**
   * Clean up resources
   */
  async close(): Promise<void> {
    // Clean up any resources if needed
    this.logger.debug("FigmaWebhooksSDK closed");
  }
}

export default FigmaWebhooksSDK;
