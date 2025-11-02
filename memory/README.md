# memory/

**LexBrain subsystem: episodic work memory and recall**

This directory contains everything related to capturing and retrieving work session Frames.

## Subdirectories

- **`frames/`** — Frame schema definitions, metadata types, Frame creation/storage logic
- **`store/`** — Local database adapter (SQLite), Frame persistence, query/search, image storage
- **`renderer/`** — Memory card image generation (visual summary of Frame state with embedded images)
- **`mcp_server/`** — Model Context Protocol stdio server exposing `/remember` and `/recall` tools

## Key concepts

A **Frame** is a timestamped snapshot of what you were doing:
- Which modules you touched (`module_scope`)
- What the blocker was (`status_snapshot.merge_blockers`)
- What the next action is (`status_snapshot.next_action`)
- Human-memorable reference point ("that auth deadlock")
- Optional image attachments (`image_ids`)

Frames are stored locally (no cloud sync, no telemetry). Retrieval is via MCP tools that assistants can call.

## Image Attachments

Frames support binary image attachments stored in SQLite:
- **Supported formats:** PNG, JPEG, SVG
- **Maximum size:** 10MB per image
- **Multiple images:** Each Frame can have multiple image attachments
- **Storage:** Binary blobs in SQLite with efficient indexing
- **Rendering:** Images are embedded in memory card PNG output

### Using image attachments

When creating a Frame via `lex.remember`, include base64-encoded images:

```json
{
  "reference_point": "authentication bug",
  "summary_caption": "Login page error screenshot",
  "status_snapshot": { "next_action": "Debug auth flow" },
  "module_scope": ["ui/auth"],
  "images": [
    {
      "data": "iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB...",
      "mime_type": "image/png"
    }
  ]
}
```

Images are validated (size, MIME type) and stored with the Frame. They can be retrieved individually or embedded in rendered memory cards.

## Integration with policy/

When you `/recall` a Frame, the system:
1. Retrieves the Frame from `store/`
2. Calls `shared/atlas/` to get the fold-radius neighborhood for `module_scope`
3. Returns both the Frame (temporal anchor) and Atlas Frame (spatial anchor)
4. Optionally renders a visual memory card with embedded images

This gives context with receipts: "here's what you were doing + here's the policy boundaries that were blocking you."

## Performance

The image storage system has been tested with:
- ✅ Individual image sizes up to 10MB
- ✅ Multiple images per Frame
- ✅ Efficient binary blob storage in SQLite
- ✅ Fast retrieval and rendering

For large deployments with 100+ images, consider:
- Enabling SQLite WAL mode (already configured)
- Using SSD storage for the database
- Implementing periodic cleanup of old images

---

**Note:** This code originated from the LexBrain repo during the merge to `lex`.
