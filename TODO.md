# Codebase Notebook — Feature Roadmap

## Reference Management

- [x] **Pin/favorite references** — Mark key references within a note so they surface first in the tree view
- [x] **Drag-and-drop reorder** — Let users reorder references within a note via the tree view
- [x] **Bulk add references** — Select multiple ranges or files and add them all to a note at once
- [x] **Auto-update line numbers** — Watch for file changes and adjust reference line numbers when code shifts

## Organization

- [x] **Tags/labels on notes** — Add tags like `#auth`, `#perf`, `#bug` for cross-cutting categorization and filtering
- [x] **Archive notes** — Hide completed research notes without deleting them
- [ ] **Note templates** — Predefined templates (e.g., "Bug Investigation", "Code Review", "Feature Exploration") with starter headings

## Export & Sharing

- [ ] **Export to markdown/PDF** — Generate a standalone document from a note with embedded code snippets and file links
- [ ] **Share via gist** — Publish a note as a GitHub Gist for sharing with teammates
- [ ] **Import from clipboard** — Paste a markdown snippet and auto-detect file references in it

## Navigation & Discovery

- [ ] **Hover preview** — Show the annotation when hovering over a referenced line in the editor (beyond CodeLens)
- [ ] **Reference graph** — A webview showing a visual map of how notes connect to files and to each other
- [ ] **References to this file** — A tree view filter or command showing all notes that reference the currently open file

## AI-Powered

- [ ] **Auto-tag** — Use the LM to suggest tags for a note based on its references
- [ ] **Question answering over notes** — "Which note covers authentication?" resolved locally
- [ ] **Stale annotation refresh** — When `diff` detects changed code, offer to regenerate the annotation with the new code

## Collaboration

- [ ] **Git-friendly storage** — Option to store notes inside the repo (e.g., `.codenotes/`) so they're committed and shared with the team
- [ ] **Note comments/threads** — Allow multiple annotations per reference, creating a conversation thread
