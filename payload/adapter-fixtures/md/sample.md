# Font licensing onboarding

Adapter fixture — markdown. Adversarial-but-adaptable on purpose: a paragraph
wrapped across several source lines, a fenced code block whose indentation is
content, both list markers, a table, and a heading with trailing hashes.

## Foundry requirements ##

The foundry must expose a CDN endpoint and a self-hosted fallback. Render
budget is four hundred milliseconds end-to-end, measured from request to
paint.

- CDN endpoint, TLS only
* Self-hosted fallback for offline
1. Trial license before production

Configuration lives in one block:

```yaml
foundry:
  name: typeco
  timeout-ms: 400
```

| Field | Meaning |
|-------|---------|
| `pending` | license requested, not granted |
| `granted` | license final |

### Escalation

Page the design-ops rotation when the CDN degrades for more than ninety seconds.
