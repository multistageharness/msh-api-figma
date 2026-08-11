/**
 * Health Check Server for Figma Files API
 * Provides status information and simple connectivity tests
 */

import { FigmaApiClient } from "@figma-api/fetch";
import Fastify from "fastify";
import { FigmaFilesSDK } from "./index.js";

const fastify = Fastify({
  logger: true,
});

const PORT = process.env.PORT || 3005;
const FIGMA_TOKEN = process.env.FIGMA_TOKEN;

// Health check endpoint
fastify.get("/", async (_request, _reply) => {
  const hasToken = !!FIGMA_TOKEN;

  return {
    module: "figma-files",
    version: "1.0.0",
    status: hasToken ? "healthy" : "unhealthy",
    environment: {
      FIGMA_TOKEN: hasToken ? "present" : "missing",
    },
    endpoints: [
      "GET / - Health check and module information",
      "GET /test - Test Figma API connectivity",
      "GET /files/:fileKey - Get complete file structure (example)",
      "GET /files/:fileKey/metadata - Get file metadata (example)",
      "GET /files/:fileKey/nodes - Get specific nodes (example)",
      "GET /files/:fileKey/versions - Get version history (example)",
      "GET /files/:fileKey/render - Render images (example)",
    ],
    availableMethods: [
      "getFile(fileKey)",
      "getFileNodes(fileKey, nodeIds)",
      "getFileMetadata(fileKey)",
      "getFileVersions(fileKey)",
      "renderImage(fileKey, nodeIds, options)",
      "searchNodes(fileKey, query)",
      "getComponents(fileKey)",
      "getStyles(fileKey)",
      "extractText(fileKey)",
    ],
  };
});

// Simple test endpoint
fastify.get("/test", async (request, reply) => {
  if (!FIGMA_TOKEN) {
    return reply.code(400).send({
      success: false,
      error: "FIGMA_TOKEN environment variable not set",
    });
  }

  try {
    const testFileKey = (request.query as any).fileKey;

    if (!testFileKey) {
      return {
        success: true,
        message:
          "SDK initialized successfully. Provide ?fileKey=YOUR_FILE_KEY to test API connectivity",
        tokenPresent: true,
      };
    }

    const sdk = new FigmaFilesSDK({
      fetcher: new FigmaApiClient({ apiToken: FIGMA_TOKEN }),
    });
    const file = await sdk.getFile(testFileKey);

    return {
      success: true,
      message: "Successfully connected to Figma API",
      fileKey: testFileKey,
      fileName: file?.name || "Unknown",
      version: file?.version || "Unknown",
    };
  } catch (error: any) {
    return reply.code(500).send({
      success: false,
      error: error.message,
      type: error.constructor.name,
    });
  }
});

// Example endpoint - Get complete file structure
fastify.get("/files/:fileKey", async (request, reply) => {
  if (!FIGMA_TOKEN) {
    return reply.code(400).send({
      success: false,
      error: "FIGMA_TOKEN environment variable not set",
    });
  }

  try {
    const { fileKey } = request.params as any;
    const sdk = new FigmaFilesSDK({
      fetcher: new FigmaApiClient({ apiToken: FIGMA_TOKEN }),
    });
    const file = await sdk.getFile(fileKey);

    return {
      success: true,
      fileKey,
      file,
    };
  } catch (error: any) {
    return reply.code(500).send({
      success: false,
      error: error.message,
      type: error.constructor.name,
    });
  }
});

// Example endpoint - Get file metadata
fastify.get("/files/:fileKey/metadata", async (request, reply) => {
  if (!FIGMA_TOKEN) {
    return reply.code(400).send({
      success: false,
      error: "FIGMA_TOKEN environment variable not set",
    });
  }

  try {
    const { fileKey } = request.params as any;
    const sdk = new FigmaFilesSDK({
      fetcher: new FigmaApiClient({ apiToken: FIGMA_TOKEN }),
    });
    const metadata = await (sdk as any).getFileMetadata(fileKey);

    return {
      success: true,
      fileKey,
      metadata,
    };
  } catch (error: any) {
    return reply.code(500).send({
      success: false,
      error: error.message,
      type: error.constructor.name,
    });
  }
});

// Example endpoint - Get specific nodes
fastify.get("/files/:fileKey/nodes", async (request, reply) => {
  if (!FIGMA_TOKEN) {
    return reply.code(400).send({
      success: false,
      error: "FIGMA_TOKEN environment variable not set",
    });
  }

  try {
    const { fileKey } = request.params as any;
    const { ids } = request.query as any;

    if (!ids) {
      return reply.code(400).send({
        success: false,
        error:
          "Missing required query parameter: ids (comma-separated node IDs)",
      });
    }

    const nodeIds = ids.split(",");
    const sdk = new FigmaFilesSDK({
      fetcher: new FigmaApiClient({ apiToken: FIGMA_TOKEN }),
    });
    const nodes = await (sdk as any).getFileNodes(fileKey, nodeIds);

    return {
      success: true,
      fileKey,
      nodes,
    };
  } catch (error: any) {
    return reply.code(500).send({
      success: false,
      error: error.message,
      type: error.constructor.name,
    });
  }
});

// Example endpoint - Get version history
fastify.get("/files/:fileKey/versions", async (request, reply) => {
  if (!FIGMA_TOKEN) {
    return reply.code(400).send({
      success: false,
      error: "FIGMA_TOKEN environment variable not set",
    });
  }

  try {
    const { fileKey } = request.params as any;
    const sdk = new FigmaFilesSDK({
      fetcher: new FigmaApiClient({ apiToken: FIGMA_TOKEN }),
    });
    const versions = await (sdk as any).getFileVersions(fileKey);

    return {
      success: true,
      fileKey,
      versions,
    };
  } catch (error: any) {
    return reply.code(500).send({
      success: false,
      error: error.message,
      type: error.constructor.name,
    });
  }
});

// Example endpoint - Render images
fastify.get("/files/:fileKey/render", async (request, reply) => {
  if (!FIGMA_TOKEN) {
    return reply.code(400).send({
      success: false,
      error: "FIGMA_TOKEN environment variable not set",
    });
  }

  try {
    const { fileKey } = request.params as any;
    const { ids, format = "png", scale = "1" } = request.query as any;

    if (!ids) {
      return reply.code(400).send({
        success: false,
        error:
          "Missing required query parameter: ids (comma-separated node IDs)",
      });
    }

    const nodeIds = ids.split(",");
    const sdk = new FigmaFilesSDK({
      fetcher: new FigmaApiClient({ apiToken: FIGMA_TOKEN }),
    });
    const images = await (sdk as any).renderImage(fileKey, nodeIds, {
      format,
      scale: parseFloat(scale),
    });

    return {
      success: true,
      fileKey,
      format,
      scale,
      images,
    };
  } catch (error: any) {
    return reply.code(500).send({
      success: false,
      error: error.message,
      type: error.constructor.name,
    });
  }
});

// Start server
const start = async () => {
  try {
    await fastify.listen({ port: PORT as number, host: "0.0.0.0" });
    console.log(`\n🚀 Figma Files Health Check Server running on port ${PORT}`);
    console.log(`   Health check: http://localhost:${PORT}/`);
    console.log(`   Test endpoint: http://localhost:${PORT}/test`);
    console.log(`   FIGMA_TOKEN: ${FIGMA_TOKEN ? "✓ Set" : "✗ Not set"}\n`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
