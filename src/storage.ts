import * as fs from "fs";
import * as path from "path";
import { CURRENT_SCHEMA_VERSION, INDEX_FILE_NAME } from "./constants";
import { NoteEntry, NoteIndex, ReferenceEntry } from "./types";

function slugify(name: string): string {
  return name.replace(/[^a-z0-9-_]/gi, "-").toLowerCase();
}

function emptyIndex(): NoteIndex {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    notes: {},
    references: {},
  };
}

export class NotesStorage {
  private notesDir: string;
  private indexPath: string;
  private index: NoteIndex = emptyIndex();

  constructor(notesDir: string) {
    this.notesDir = notesDir;
    this.indexPath = path.join(notesDir, INDEX_FILE_NAME);
  }

  async initialize(): Promise<void> {
    if (!fs.existsSync(this.notesDir)) {
      fs.mkdirSync(this.notesDir, { recursive: true });
    }
    await this.loadIndex();
  }

  async reload(newNotesDir: string): Promise<void> {
    this.notesDir = newNotesDir;
    this.indexPath = path.join(newNotesDir, INDEX_FILE_NAME);
    if (!fs.existsSync(newNotesDir)) {
      fs.mkdirSync(newNotesDir, { recursive: true });
    }
    await this.loadIndex();
  }

  // --- Notes ---

  async createNote(name: string): Promise<NoteEntry> {
    const id = slugify(name);
    const filePath = path.join(this.notesDir, `${id}.md`);

    if (!this.index.notes[id]) {
      const now = new Date().toISOString();
      const entry: NoteEntry = {
        id,
        name,
        filePath,
        createdAt: now,
        updatedAt: now,
      };
      fs.writeFileSync(filePath, `# ${name}\n\n`);
      this.index.notes[id] = entry;
      await this.saveIndex();
    }

    return this.index.notes[id];
  }

  async deleteNote(noteId: string): Promise<void> {
    const note = this.index.notes[noteId];
    if (!note) {
      return;
    }

    if (fs.existsSync(note.filePath)) {
      fs.unlinkSync(note.filePath);
    }

    delete this.index.notes[noteId];

    for (const refId of Object.keys(this.index.references)) {
      if (this.index.references[refId].noteId === noteId) {
        delete this.index.references[refId];
      }
    }

    await this.saveIndex();
  }

  getNotes(): NoteEntry[] {
    return Object.values(this.index.notes).sort((a, b) =>
      a.name.localeCompare(b.name),
    );
  }

  getNote(noteId: string): NoteEntry | undefined {
    return this.index.notes[noteId];
  }

  noteExists(noteId: string): boolean {
    return noteId in this.index.notes;
  }

  // --- Tags ---

  async addTag(noteId: string, tag: string): Promise<void> {
    const note = this.index.notes[noteId];
    if (!note) { return; }
    if (!note.tags) { note.tags = []; }
    const normalized = tag.toLowerCase().replace(/^#/, "").trim();
    if (!normalized || note.tags.includes(normalized)) { return; }
    note.tags.push(normalized);
    note.updatedAt = new Date().toISOString();
    await this.saveIndex();
  }

  async removeTag(noteId: string, tag: string): Promise<void> {
    const note = this.index.notes[noteId];
    if (!note || !note.tags) { return; }
    const normalized = tag.toLowerCase().replace(/^#/, "").trim();
    note.tags = note.tags.filter((t) => t !== normalized);
    note.updatedAt = new Date().toISOString();
    await this.saveIndex();
  }

  async setTags(noteId: string, tags: string[]): Promise<void> {
    const note = this.index.notes[noteId];
    if (!note) { return; }
    note.tags = tags.map((t) => t.toLowerCase().replace(/^#/, "").trim()).filter(Boolean);
    note.updatedAt = new Date().toISOString();
    await this.saveIndex();
  }

  getAllTags(): string[] {
    const tagSet = new Set<string>();
    for (const note of Object.values(this.index.notes)) {
      for (const tag of note.tags ?? []) {
        tagSet.add(tag);
      }
    }
    return [...tagSet].sort();
  }

  getNotesByTag(tag: string): NoteEntry[] {
    const normalized = tag.toLowerCase().replace(/^#/, "").trim();
    return Object.values(this.index.notes)
      .filter((n) => n.tags?.includes(normalized))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  // --- References ---

  async addReference(
    noteId: string,
    file: string,
    line: number,
    codeSnippet: string,
    language: string,
    annotation: string,
  ): Promise<ReferenceEntry> {
    const note = this.index.notes[noteId];
    if (!note) {
      throw new Error(`Note "${noteId}" not found`);
    }

    const id = `${noteId}:${file}:${line}`;
    const ref: ReferenceEntry = {
      id,
      noteId,
      file,
      line,
      annotation,
      codeSnippet,
      language,
      addedAt: new Date().toISOString(),
    };

    this.index.references[id] = ref;
    note.updatedAt = new Date().toISOString();

    const baseName = path.basename(file);
    let section = `\n---\n\n## ${baseName}:${line}\n\n`;
    section += `**File:** \`${file}\`  \n`;
    section += `**Line:** ${line}\n`;

    if (annotation) {
      section += `\n> ${annotation}\n`;
    }

    section += `\n\`\`\`${language}\n${codeSnippet}\n\`\`\`\n`;

    fs.appendFileSync(note.filePath, section);

    await this.saveIndex();
    return ref;
  }

  async deleteReference(referenceId: string): Promise<void> {
    const ref = this.index.references[referenceId];
    if (!ref) {
      return;
    }

    const note = this.index.notes[ref.noteId];
    if (note) {
      note.updatedAt = new Date().toISOString();
    }

    delete this.index.references[referenceId];
    await this.saveIndex();
  }

  getReferencesForNote(noteId: string): ReferenceEntry[] {
    return Object.values(this.index.references)
      .filter((r) => r.noteId === noteId)
      .sort((a, b) => {
        if (a.pinned && !b.pinned) { return -1; }
        if (!a.pinned && b.pinned) { return 1; }
        return (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
      });
  }

  async reorderReferences(noteId: string, orderedIds: string[]): Promise<void> {
    for (let i = 0; i < orderedIds.length; i++) {
      const ref = this.index.references[orderedIds[i]];
      if (ref && ref.noteId === noteId) {
        ref.sortOrder = i;
      }
    }
    await this.saveIndex();
  }

  async togglePinReference(referenceId: string): Promise<boolean> {
    const ref = this.index.references[referenceId];
    if (!ref) {
      return false;
    }
    ref.pinned = !ref.pinned;
    await this.saveIndex();
    return ref.pinned;
  }

  isReferencePinned(referenceId: string): boolean {
    return this.index.references[referenceId]?.pinned ?? false;
  }

  getReferencesForFile(filePath: string): ReferenceEntry[] {
    return Object.values(this.index.references).filter(
      (r) => r.file === filePath,
    );
  }

  async updateReferences(refs: ReferenceEntry[]): Promise<void> {
    for (const ref of refs) {
      const oldId = ref.id;
      const newId = `${ref.noteId}:${ref.file}:${ref.line}`;

      // Re-key if the ID changed (line number moved)
      if (oldId !== newId) {
        delete this.index.references[oldId];
        ref.id = newId;
        this.index.references[newId] = ref;

        // Update the markdown note file
        const note = this.index.notes[ref.noteId];
        if (note && fs.existsSync(note.filePath)) {
          const baseName = path.basename(ref.file);
          const oldLine = oldId.split(":").pop();
          const oldHeading = `## ${baseName}:${oldLine}`;
          const newHeading = `## ${baseName}:${ref.line}`;
          const oldLineField = `**Line:** ${oldLine}`;
          const newLineField = `**Line:** ${ref.line}`;

          let content = fs.readFileSync(note.filePath, "utf-8");
          content = content.replace(oldHeading, newHeading);
          content = content.replace(oldLineField, newLineField);
          fs.writeFileSync(note.filePath, content, "utf-8");
        }
      } else if (this.index.references[oldId]) {
        this.index.references[oldId] = ref;
      }
    }
    await this.saveIndex();
  }

  getAllReferences(): ReferenceEntry[] {
    return Object.values(this.index.references);
  }

  getNotesDirectory(): string {
    return this.notesDir;
  }

  // --- Persistence ---

  private async saveIndex(): Promise<void> {
    const tmpPath = `${this.indexPath}.tmp`;
    fs.writeFileSync(tmpPath, JSON.stringify(this.index, null, 2), "utf-8");
    fs.renameSync(tmpPath, this.indexPath);
  }

  private async loadIndex(): Promise<void> {
    if (!fs.existsSync(this.indexPath)) {
      this.index = emptyIndex();
      return;
    }

    try {
      const raw = fs.readFileSync(this.indexPath, "utf-8");
      this.index = JSON.parse(raw) as NoteIndex;

      // Fix any stale filePaths if the notesDir moved
      for (const note of Object.values(this.index.notes)) {
        note.filePath = path.join(this.notesDir, `${note.id}.md`);
      }
    } catch {
      this.index = emptyIndex();
    }
  }
}
