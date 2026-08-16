# Odds feed onboarding

Adapter fixture — markdown. Adversarial-but-adaptable on purpose: a paragraph
wrapped across several source lines, a fenced code block whose indentation is
content, both list markers, a table, and a heading with trailing hashes.

## Provider requirements ##

The provider must expose a websocket endpoint and a REST fallback. Latency
budget is four hundred milliseconds end-to-end, measured from ingest to
price.

- Websocket endpoint, TLS only
* REST fallback for replay
1. Sandbox credentials before production

Configuration lives in one block:

```yaml
provider:
  name: oddsco
  timeout-ms: 400
```

| Field | Meaning |
|-------|---------|
| `suspended` | market locked, not settled |
| `settled` | outcome final |

### Escalation

Page the trading desk when the feed suspends for more than ninety seconds.
