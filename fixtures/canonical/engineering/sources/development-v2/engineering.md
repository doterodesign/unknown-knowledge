# Aurora engineering — additional synthetic source artifacts

Draft development-v2, captured 2026-09-18. These are invented artifacts. Each
section identifies its own scope and standing; placing sections in this file
does not combine their claims. Original pilot source remains a separate artifact.

## css-audit

The accepted Aurora Web 4 exporter audit records a semitransparent accent named
`--accent-soft`, emitted as `rgba(r, g, b, a)` with the original alpha. Its
assertion checks that export does not composite this token onto the background.
The audit covers the CSS exporter in the active Web 4 release. It independently
confirms the serialization contract; it is not a future-release proposal.

## eclat-color

The reviewed French glossary uses “éclat” as an alias for the semitransparent
accent color role in Aurora Web 4. That role uses the existing `--accent-soft`
token. The glossary describes naming; the CSS contract defines serialization.

## eclat-project

Éclat is also a proposed Android animation project. Its draft names an animation
cue `spark-start`, not a color token. No part of that draft changes Web 4 CSS.
The project has no approved production animation contract yet.

## production-theme

The accepted Aurora Web 4 production theme sets the card corner radius to 6 px.
Its scope excludes experimental preview builds. This contract belongs to both
card layout and release styling; an additional release classification does not
remove either responsibility.

## preview-theme

The reviewed Aurora experimental preview uses a 12 px card radius. That value
is for the preview channel only and has not replaced production's 6 px rule.

## cross-platform-notebook

This reviewed notebook contains two independent observations: Android's image
viewer accepts P3 images, and the desktop CSS exporter serializes alpha colors
as rgba. It reports no test of P3 colors with alpha in the Android CSS exporter.
The notebook is not a joint Android color-export qualification.

## keyboard-capture

An accepted active Aurora Web 4 keyboard contract requires screenshots of focus
states to retain the two-pixel focus outline and its two-pixel offset. The
record's subject classification has not yet been supplied. Its source owner
and Web 4 scope are explicit; missing classification does not retract approval.

## web5-proposal

A proposed Aurora Web 5 change would serialize all colors with `color(display-p3
...)`. The review has not accepted it, no implementation has shipped, and it
does not supersede the active Web 4 rgba contract.

## palette-mail

An unreviewed message says “the accent should be solid now” but identifies
neither a product nor a release. It provides no approved change to an exporter.

## screenshot-limit

The active Android image-viewer test records a maximum screenshot width of
4096 pixels. It says nothing about Web 4 CSS color serialization or focus rings.
