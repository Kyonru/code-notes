export interface NoteEntry {
  id: string;
  name: string;
  filePath: string;
  createdAt: string;
  updatedAt: string;
  tags?: string[];
  archived?: boolean;
}

export interface ReferenceEntry {
  id: string;        // `${noteId}:${file}:${line}`
  noteId: string;
  file: string;      // absolute path to code file
  line: number;
  annotation: string;
  codeSnippet: string;
  language: string;
  addedAt: string;
  pinned?: boolean;
  sortOrder?: number;
}

export interface NoteIndex {
  schemaVersion: number;
  notes: Record<string, NoteEntry>;
  references: Record<string, ReferenceEntry>;
}
