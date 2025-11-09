# API Error Codes

This document describes the error codes returned by the Frame Ingestion API.

## Error Response Format

All API errors return a JSON response with the following structure:

```json
{
  "error": "ERROR_CODE",
  "message": "Human-readable error message",
  "field": "fieldName",  // Optional: field that caused the error
  "code": 400           // HTTP status code
}
```

## Error Codes

### VALIDATION_FAILED (400)

Returned when the request body fails validation.

**Common causes:**
- Missing required fields (`reference_point`, `summary_caption`, `module_scope`, `status_snapshot.next_action`)
- Invalid field types
- Empty arrays where non-empty arrays are required

**Example:**
```json
{
  "error": "VALIDATION_FAILED",
  "message": "Field 'module_scope' is required and must be a non-empty array",
  "field": "module_scope",
  "code": 400
}
```

### UNAUTHORIZED (401)

Returned when authentication fails.

**Common causes:**
- Missing `Authorization` header
- Invalid API key
- Malformed `Authorization` header

**Example:**
```json
{
  "error": "UNAUTHORIZED",
  "message": "Invalid or missing API key",
  "code": 401
}
```

### CONFLICT (409)

Returned when attempting to create a duplicate Frame.

Frames are considered duplicates if they have the same content hash, which is calculated from:
- `reference_point`
- `summary_caption`
- `module_scope` (sorted)
- `status_snapshot.next_action`
- `timestamp` (rounded to 5-minute bucket)

**Example:**
```json
{
  "error": "CONFLICT",
  "message": "Frame with same content already exists",
  "code": 409,
  "existing_frame_id": "frame-1234567890-abc123"
}
```

### INTERNAL_ERROR (500)

Returned when an unexpected server error occurs.

**Common causes:**
- Database connection failures
- Disk space issues
- Internal server errors

**Example:**
```json
{
  "error": "INTERNAL_ERROR",
  "message": "Database write failed",
  "code": 500
}
```

## Usage Examples

### Successful Request

```bash
curl -X POST http://localhost:3000/api/frames \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-api-key" \
  -d '{
    "reference_point": "auth handshake timeout",
    "summary_caption": "Fixed timeout in auth service",
    "module_scope": ["services/auth", "lib/networking"],
    "status_snapshot": {
      "next_action": "Deploy to staging"
    }
  }'
```

**Response (201 Created):**
```json
{
  "id": "frame-1699564800-abc123",
  "status": "created"
}
```

### Validation Error

```bash
curl -X POST http://localhost:3000/api/frames \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-api-key" \
  -d '{
    "reference_point": "test",
    "summary_caption": "test"
  }'
```

**Response (400 Bad Request):**
```json
{
  "error": "VALIDATION_FAILED",
  "message": "Field 'module_scope' is required and must be a non-empty array",
  "field": "module_scope",
  "code": 400
}
```

### Duplicate Frame

```bash
# Second request with same content
curl -X POST http://localhost:3000/api/frames \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-api-key" \
  -d '{
    "reference_point": "auth handshake timeout",
    "summary_caption": "Fixed timeout in auth service",
    "module_scope": ["services/auth", "lib/networking"],
    "status_snapshot": {
      "next_action": "Deploy to staging"
    }
  }'
```

**Response (409 Conflict):**
```json
{
  "error": "CONFLICT",
  "message": "Frame with same content already exists",
  "code": 409,
  "existing_frame_id": "frame-1699564800-abc123"
}
```

### Authentication Error

```bash
curl -X POST http://localhost:3000/api/frames \
  -H "Content-Type: application/json" \
  -d '{
    "reference_point": "test",
    "summary_caption": "test",
    "module_scope": ["test"],
    "status_snapshot": {
      "next_action": "test"
    }
  }'
```

**Response (401 Unauthorized):**
```json
{
  "error": "UNAUTHORIZED",
  "message": "Invalid or missing API key",
  "code": 401
}
```
