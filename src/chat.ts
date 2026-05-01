import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import { NotesStorage } from "./storage";
import { NoteEntry } from "./types";
import { createCommandName } from "./utils";

const PARTICIPANT_ID = "crosscodenotes.assistant";

export function registerChatParticipant(
  context: vscode.ExtensionContext,
  storage: NotesStorage,
): void {
  const participant = vscode.chat.createChatParticipant(
    PARTICIPANT_ID,
    makeHandler(context, storage),
  );

  participant.iconPath = new vscode.ThemeIcon("notebook");

  context.subscriptions.push(participant);
}

function makeHandler(
  context: vscode.ExtensionContext,
  storage: NotesStorage,
): vscode.ChatRequestHandler {
  return async (request, _ctx, stream, token) => {
    try {
      if (request.command === "annotate") {
        return await handleAnnotate(request, stream, storage, token, context);
      }
      if (request.command === "summarize") {
        return await handleSummarize(request, stream, storage, token);
      }
      return await handleDefault(request, stream, storage, token);
    } catch (err) {
      if (err instanceof vscode.LanguageModelError) {
        stream.markdown(`> Language model error: ${err.message} (${err.code})`);
      } else {
        throw err;
      }
      return {};
    }
  };
}

// --- Handlers ---

async function handleDefault(
  request: vscode.ChatRequest,
  stream: vscode.ChatResponseStream,
  storage: NotesStorage,
  token: vscode.CancellationToken,
): Promise<vscode.ChatResult> {
  stream.progress("Reading notes...");

  const notesContext = buildNotesContext(storage);
  const messages = [
    vscode.LanguageModelChatMessage.User(
      `You are an assistant for the "Codebase Notebook" VS Code extension. ` +
        `You help developers understand and navigate their code notes and references.\n\n` +
        `Here is the current state of the user's notes:\n\n${notesContext}\n\n` +
        `Answer the following question based on the notes above. Be concise and specific. ` +
        `If you reference a file or annotation, quote it.\n\n` +
        `Question: ${request.prompt}`,
    ),
  ];

  const response = await request.model.sendRequest(messages, {}, token);
  for await (const chunk of response.stream) {
    if (chunk instanceof vscode.LanguageModelTextPart) {
      stream.markdown(chunk.value);
    }
  }

  return {};
}

async function handleAnnotate(
  request: vscode.ChatRequest,
  stream: vscode.ChatResponseStream,
  storage: NotesStorage,
  token: vscode.CancellationToken,
  context: vscode.ExtensionContext,
): Promise<vscode.ChatResult> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    stream.markdown(
      "Open a file and place your cursor on (or select) the code you want to annotate, then try again.",
    );
    return {};
  }

  const sel = editor.selection;
  const codeSnippet =
    editor.document.getText(sel) || editor.document.lineAt(sel.start.line).text;
  const file = editor.document.fileName;
  const line = sel.start.line + 1;
  const language = editor.document.languageId;
  const baseName = path.basename(file);

  const currentNotePath = context.workspaceState.get<string>("currentNote");
  const noteId = currentNotePath ? path.basename(currentNotePath, ".md") : null;
  const hasActiveNote = noteId !== null && storage.noteExists(noteId);

  stream.progress(`Annotating ${baseName}:${line}...`);

  const extra = request.prompt.trim()
    ? `\n\nAdditional context: ${request.prompt}`
    : "";

  const messages = [
    vscode.LanguageModelChatMessage.User(
      `Generate a concise technical annotation for this code snippet. ` +
        `Explain what it does and why it's notable. 1–2 sentences, no preamble.` +
        extra +
        `\n\nFile: ${baseName}\nLine: ${line}\nLanguage: ${language}\n\n` +
        `\`\`\`${language}\n${codeSnippet}\n\`\`\``,
    ),
  ];

  stream.markdown(`**Suggested annotation for \`${baseName}:${line}\`**\n\n`);

  let fullAnnotation = "";
  const response = await request.model.sendRequest(messages, {}, token);
  for await (const chunk of response.stream) {
    if (chunk instanceof vscode.LanguageModelTextPart) {
      stream.markdown(chunk.value);
      fullAnnotation += chunk.value;
    }
  }

  stream.markdown("\n\n");

  // Show the file as a reference
  stream.reference(vscode.Uri.file(file));

  if (hasActiveNote) {
    stream.button({
      command: createCommandName("applyAnnotatedReference"),
      title: "$(notebook) Add to Active Note",
      arguments: [
        {
          noteId,
          file,
          line,
          codeSnippet,
          language,
          annotation: fullAnnotation.trim(),
        },
      ],
    });
  } else {
    stream.markdown(
      "_No active note selected. Use **Codebase Notebook: Select Note** first, then re-run this command._",
    );
  }

  return {};
}

async function handleSummarize(
  request: vscode.ChatRequest,
  stream: vscode.ChatResponseStream,
  storage: NotesStorage,
  token: vscode.CancellationToken,
): Promise<vscode.ChatResult> {
  const notes = storage.getNotes();

  if (notes.length === 0) {
    stream.markdown(
      "You don't have any notes yet. Create one with **Codebase Notebook: Create Note**.",
    );
    return {};
  }

  const query = request.prompt.trim().toLowerCase();
  const targetNote = query
    ? notes.find((n) => n.name.toLowerCase().includes(query))
    : null;

  if (query && !targetNote) {
    stream.markdown(
      `No note found matching "${request.prompt}".\n\nAvailable notes: ${notes.map((n) => `\`${n.name}\``).join(", ")}`,
    );
    return {};
  }

  const label = targetNote ? `"${targetNote.name}"` : "all notes";
  stream.progress(`Summarizing ${label}...`);

  const targets = targetNote ? [targetNote] : notes;
  const notesContext = buildNotesContext(storage, targets);

  const prompt = targetNote
    ? `Summarize the note "${targetNote.name}". Explain what areas of the codebase it covers, what the annotations say about those areas, and any patterns you notice.`
    : `Summarize all these notes at a high level. Group related areas of the codebase. Highlight which files or topics have the most coverage and what the overall theme of the research appears to be.`;

  const messages = [
    vscode.LanguageModelChatMessage.User(`${notesContext}\n\n${prompt}`),
  ];

  const response = await request.model.sendRequest(messages, {}, token);
  for await (const chunk of response.stream) {
    if (chunk instanceof vscode.LanguageModelTextPart) {
      stream.markdown(chunk.value);
    }
  }

  for (const note of targets) {
    if (fs.existsSync(note.filePath)) {
      stream.reference(vscode.Uri.file(note.filePath));
    }
  }

  return {};
}

// --- Context builder ---

function buildNotesContext(storage: NotesStorage, notes?: NoteEntry[]): string {
  const targets = notes ?? storage.getNotes();

  if (targets.length === 0) {
    return "No notes available.";
  }

  const parts: string[] = ["# User's Code Notes\n"];

  for (const note of targets) {
    const refs = storage.getReferencesForNote(note.id);

    // Include free-form markdown text the user wrote (strip auto-generated ref sections)
    let userText = "";
    if (fs.existsSync(note.filePath)) {
      const raw = fs.readFileSync(note.filePath, "utf-8");
      const sepIdx = raw.indexOf("\n---\n");
      const content =
        sepIdx !== -1 ? raw.substring(0, sepIdx).trim() : raw.trim();
      // Remove the h1 title line — it's redundant with the note name
      userText = content.replace(/^#\s.+\n?/, "").trim();
    }

    parts.push(`## Note: ${note.name}`);
    if (userText) {
      parts.push(userText);
    }

    if (refs.length === 0) {
      parts.push("_(no code references yet)_");
    } else {
      parts.push(`\n${refs.length} code reference(s):\n`);
      for (const ref of refs) {
        const baseName = path.basename(ref.file);
        parts.push(`### ${baseName}:${ref.line}`);
        parts.push(`File: \`${ref.file}\``);
        if (ref.annotation) {
          parts.push(`Annotation: ${ref.annotation}`);
        }
        if (ref.codeSnippet) {
          parts.push(`\`\`\`${ref.language}\n${ref.codeSnippet}\n\`\`\``);
        }
        parts.push("");
      }
    }

    parts.push("");
  }

  return parts.join("\n");
}
