# Change Log

All notable changes to the "solenodontelabs-codenotes" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [Unreleased]

## [v0.3.1] - 2026-05-01

- Improves Readme
- Improves release process

## [v0.3.0] - 2026-05-01

### AI Features

- AI Chat Participant (`@codenotes`) with `/annotate`, `/summarize`, `/relate`, `/diff`, `/suggest-note` commands
- Suggest Note for Selection (AI) — recommends which note fits selected code
- Inline completions — annotation suggestions as you type in `.md` notes
- Auto-Tag Note (AI) — suggest tags based on references
- Ask Notes (AI) — natural language Q&A over your notes
- Refresh Stale Annotations (AI) — detect code drift and regenerate
- Semantic Search (AI) — natural language search across all annotations
- Auto Annotate (AI) — AI generates annotation from code + note context (`Cmd+Shift+;`)
- Smart Linking (AI) — auto-detect related references and add cross-link comments
- Annotation Quality Scoring (AI) — rate staleness/vagueness, suggest rewrites
- Code Review Assistant (AI) — surface relevant annotations for git changes

### AI Provider

- External AI API support (OpenAI, Anthropic, Ollama, any OpenAI-compatible endpoint)
- Auto-detect provider (VS Code LM API or external)
- Secure API key storage via SecretStorage
- Configurable model selection

### Notes & Organization

- Note templates (Bug Investigation, Code Review, Feature Exploration, Architecture Decision, Learning Notes)
- Tags/labels with filtering
- Archive/unarchive notes
- Comments/threads on references
- Export to Markdown
- Git-friendly `.codenotes/` workspace storage option

### Code References

- Pin/favorite references
- Bulk add references
- Drag-and-drop reorder
- Auto-update line numbers on file changes
- Quick Add annotation (`Cmd+Shift+L`) — minimal dialogs
- Delete annotation command
- Annotation history/versioning — track changes over time
- Broken reference detection — auto-scan on startup

### Navigation & Visualization

- Reference graph (interactive webview)
- References to this file command
- Annotation timeline (chronological webview)
- Status bar badge for stale/broken annotations

### Infrastructure

- Open VSX marketplace publishing
- Engine version lowered to `^1.85.0` (Cursor compatibility)
- JSON-based storage with schema migration

## [v0.2.0] - 2026-01-02

- Add search notes
- Add change notes directory
- Add keybindings
- Add Icon

## [v0.1.0] - 2025-08-10

- Initial Release
- Add note taking

[v0.3.1]: https://github.com/Kyonru/code-notes/compare/v0.3.0...v0.3.1
[v0.3.0]: https://github.com/Kyonru/code-notes/compare/v0.2.0...v0.3.0
[v0.2.0]: https://github.com/Kyonru/code-notes/compare/v0.1.0...v0.2.0
[v0.1.0]: https://github.com/Kyonru/code-notes/releases/tag/v0.1.0
