# Aurora engineering — synthetic fixture evidence

Version: pilot-1. Captured: 2026-09-18. Every fact below describes this invented
fixture only. This document is the authored artifact, not a catalog summary.

## css-export

The Aurora CSS exporter represents every color token with a non-opaque alpha
as `rgba(r, g, b, a)`. The semitransparent accent token is named
`--accent-soft`. It retains its alpha value; the exporter must not flatten it
against the page background. This active contract applies to Aurora Web 4.

## opaque-export

Aurora Web 4's opaque-only export mode writes six-digit hexadecimal color
values. This mode accepts alpha equal to one and rejects all other alpha
values.

## focus-ring

Aurora's keyboard-focus treatment is a two-pixel outline with a two-pixel
offset.

## prior-export

The retired Aurora Web 3 exporter flattened transparent colors to opaque
hexadecimal values. Its behavior is preserved for historical debugging only;
it is not the active Web 4 contract.

## unclassified-note

An engineering note uses “accent” to mean emphasis in a release announcement.
