import * as fs from "fs";
import * as path from "path";
import { CURRENT_SCHEMA_VERSION, INDEX_FILE_NAME } from "./constants";
import { NoteIndex } from "./types";

export async function migrateIfNeeded(notesDir: string): Promise<void> {
  if (!fs.existsSync(notesDir)) {
    return;
  }

  const indexPath = path.join(notesDir, INDEX_FILE_NAME);

  if (fs.existsSync(indexPath)) {
    try {
      const raw = JSON.parse(fs.readFileSync(indexPath, "utf-8"));
      if (raw.schemaVersion === CURRENT_SCHEMA_VERSION) {
        return;
      }
      // Future schema version upgrades go here
    } catch {
      // Corrupt index — will be rebuilt below
    }
  }

  // v0 → v1: parse existing .md files and build the index
  const mdFiles = fs.readdirSync(notesDir).filter((f) => f.endsWith(".md"));

  const index: NoteIndex = {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    notes: {},
    references: {},
  };

  for (const mdFile of mdFiles) {
    const noteId = path.basename(mdFile, ".md");
    const filePath = path.join(notesDir, mdFile);
    const stats = fs.statSync(filePath);

    index.notes[noteId] = {
      id: noteId,
      name: noteId,
      filePath,
      createdAt: stats.birthtime.toISOString(),
      updatedAt: stats.mtime.toISOString(),
    };

    const content = fs.readFileSync(filePath, "utf-8");
    const sectionRegex = /## (.+?):(\d+)/g;
    let match: RegExpExecArray | null;

    while ((match = sectionRegex.exec(content)) !== null) {
      const lineNumber = parseInt(match[2], 10);
      const sectionStart = match.index;
      const nextSection = content.indexOf("\n## ", sectionStart + 1);
      const sectionContent = content.substring(
        sectionStart,
        nextSection === -1 ? content.length : nextSection
      );

      const pathMatch = sectionContent.match(/\*\*Path:\*\* `(.+?)`/);
      const file = pathMatch ? pathMatch[1] : "";
      if (!file) {
        continue;
      }

      const noteMatch = sectionContent.match(/\*\*Note:\*\* (.+?)(?:\n|$)/);
      const annotation = noteMatch ? noteMatch[1].trim() : "";

      const codeMatch = sectionContent.match(/```[\w]*\n([\s\S]+?)\n```/);
      const codeSnippet = codeMatch ? codeMatch[1] : "";

      const refId = `${noteId}:${file}:${lineNumber}`;
      index.references[refId] = {
        id: refId,
        noteId,
        file,
        line: lineNumber,
        annotation,
        codeSnippet,
        language: "",
        addedAt: stats.mtime.toISOString(),
      };
    }
  }

  const tmpPath = `${indexPath}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(index, null, 2), "utf-8");
  fs.renameSync(tmpPath, indexPath);
}
