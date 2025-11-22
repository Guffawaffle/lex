# Frame Ingestion API Usage Examples

This document provides examples of how to use the Frame Ingestion HTTP API.

## Starting the Server

```typescript
import { createDatabase } from "lex/memory/store";
import { startHttpServer } from "lex/memory/mcp_server/http-server";

const db = createDatabase("/path/to/frames.db");

// Start server with API key authentication
await startHttpServer(db, {
  port: 3000,
  apiKey: process.env.LEX_API_KEY,
});

console.log("Frame ingestion API running on http://localhost:3000");
```

## Basic Frame Ingestion

### Using curl

```bash
curl -X POST http://localhost:3000/api/frames \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-api-key" \
  -d '{
    "reference_point": "auth handshake timeout",
    "summary_caption": "Fixed timeout issue in auth service",
    "module_scope": ["services/auth", "lib/networking"],
    "status_snapshot": {
      "next_action": "Deploy to staging",
      "blockers": ["Waiting for QA approval"]
    },
    "branch": "feature/auth-fix",
    "jira": "TICKET-123"
  }'
```

**Response (201 Created):**
```json
{
  "id": "frame-1699564800-abc123",
  "status": "created"
}
```

### Using JavaScript/TypeScript

```typescript
const response = await fetch("http://localhost:3000/api/frames", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: "Bearer your-api-key",
  },
  body: JSON.stringify({
    reference_point: "auth handshake timeout",
    summary_caption: "Fixed timeout issue in auth service",
    module_scope: ["services/auth", "lib/networking"],
    status_snapshot: {
      next_action: "Deploy to staging",
      blockers: ["Waiting for QA approval"],
    },
    branch: "feature/auth-fix",
    jira: "TICKET-123",
  }),
});

const result = await response.json();
console.log(`Frame created: ${result.id}`);
```

### Using Python

```python
import requests

url = "http://localhost:3000/api/frames"
headers = {
    "Content-Type": "application/json",
    "Authorization": "Bearer your-api-key"
}
data = {
    "reference_point": "auth handshake timeout",
    "summary_caption": "Fixed timeout issue in auth service",
    "module_scope": ["services/auth", "lib/networking"],
    "status_snapshot": {
        "next_action": "Deploy to staging",
        "blockers": ["Waiting for QA approval"]
    },
    "branch": "feature/auth-fix",
    "jira": "TICKET-123"
}

response = requests.post(url, json=data, headers=headers)
result = response.json()
print(f"Frame created: {result['id']}")
```

## Advanced Usage

### Batch Ingestion

```typescript
async function ingestFrames(frames: any[]) {
  const results = [];

  for (const frame of frames) {
    const response = await fetch("http://localhost:3000/api/frames", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer your-api-key",
      },
      body: JSON.stringify(frame),
    });

    const result = await response.json();
    if (response.status === 201) {
      results.push(result);
    } else if (response.status === 409) {
      console.log(`Duplicate frame skipped: ${result.existing_frame_id}`);
    } else {
      console.error(`Error ingesting frame: ${result.message}`);
    }
  }

  return results;
}
```

### With Merge-Weave Metadata

```typescript
const frame = {
  reference_point: "payment webhook processing",
  summary_caption: "Implemented Stripe webhook handler",
  module_scope: ["services/payment", "api/webhooks"],
  status_snapshot: {
    next_action: "Add signature verification",
  },
  // Merge-weave provenance metadata
  runId: "run-12345",
  planHash: "abc123def456",
  spend: {
    prompts: 15,
    tokens_estimated: 8500,
  },
};

const response = await fetch("http://localhost:3000/api/frames", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: "Bearer your-api-key",
  },
  body: JSON.stringify(frame),
});
```

## Error Handling

### Handling Validation Errors

```typescript
try {
  const response = await fetch("http://localhost:3000/api/frames", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer your-api-key",
    },
    body: JSON.stringify(frame),
  });

  const result = await response.json();

  if (response.status === 201) {
    console.log(`Success: ${result.id}`);
  } else if (response.status === 400) {
    console.error(`Validation error: ${result.message}`);
    console.error(`Field: ${result.field}`);
  } else if (response.status === 409) {
    console.log(`Duplicate frame: ${result.existing_frame_id}`);
  } else if (response.status === 401) {
    console.error("Authentication failed");
  } else {
    console.error(`Server error: ${result.message}`);
  }
} catch (error) {
  console.error("Network error:", error);
}
```

### Handling Duplicates

The API automatically detects duplicate frames based on content hash. If you try to ingest a frame with the same:
- `reference_point`
- `summary_caption`
- `module_scope`
- `status_snapshot.next_action`
- `timestamp` (within 5-minute bucket)

You'll receive a 409 Conflict response with the existing frame ID:

```json
{
  "error": "CONFLICT",
  "message": "Frame with same content already exists",
  "code": 409,
  "existing_frame_id": "frame-1699564800-abc123"
}
```

## Health Check

The server includes a health check endpoint:

```bash
curl http://localhost:3000/health
```

**Response:**
```json
{
  "status": "ok"
}
```

## Environment Variables

Configure the API using environment variables:

```bash
# API Key for authentication
export LEX_API_KEY="your-secure-api-key"

# Database path (optional, defaults to .smartergpt.local/lex/memory.db)
export LEX_DB_PATH="/path/to/custom/frames.db"

# Server port (optional, defaults to 3000)
export LEX_API_PORT=3000
```

## See Also

- [API Error Codes](./API_ERRORS.md) - Complete list of error codes and responses
- [Frame Schema](../src/memory/frames/types.ts) - Full Frame schema definition
