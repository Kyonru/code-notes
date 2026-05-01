import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import { NotesStorage } from "./storage";
import { getNotesDir } from "./utils";

export class NotesInlineCompletionProvider
  implements vscode.InlineCompletionItemProvider
{
  constructor(
    private readonly storage: NotesStorage,
    private readonly context: vscode.ExtensionContext,
  ) {}

  async provideInlineCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    context: vscode.InlineCompletionContext,
    token: vscode.CancellationToken,
  ): Promise<vscode.InlineCompletionItem[]> {
    // Only provide completions in markdown files in notes directory
    if (document.languageId !== "markdown") {
      return [];
    }

    const notesDir = this.storage.getNotesDirectory();
    if (!document.uri.fsPath.startsWith(notesDir)) {
      return [];
    }

    // Get the note ID from file name
    const fileName = path.basename(document.uri.fsPath, ".md");
    const note = this.storage.getNote(fileName);
    if (!note) {
      return [];
    }

    // Get references for this note
    const references = this.storage.getReferencesForNote(note.id);
    if (references.length === 0) {
      return [];
    }

    try {
      const completions = await this.generateCompletions(
        document,
        position,
        references,
        token,
      );
      return completions;
    } catch (err) {
      // Silently fail - don't disrupt user experience
      console.error("Error generating completions:", err);
      return [];
    }
  }

  private async generateCompletions(
    document: vscode.TextDocument,
    position: vscode.Position,
    references: ReturnType<NotesStorage["getReferencesForNote"]>,
    token: vscode.CancellationToken,
  ): Promise<vscode.InlineCompletionItem[]> {
    // Get current line text up to cursor
    const line = document.lineAt(position).text;
    const lineUpToCursor = line.substring(0, position.character);

    // Don't suggest in code blocks or empty lines
    if (
      this.isInCodeBlock(document, position) ||
      lineUpToCursor.trim() === ""
    ) {
      return [];
    }

    // Build context from references
    const codeContext = references
      .slice(0, 5) // Limit to 5 most recent references for context
      .map(
        (ref) =>
          `File: ${ref.file}\nLine ${ref.line}:\n\`\`\`${ref.language}\n${ref.codeSnippet}\n\`\`\`\nAnnotation: ${ref.annotation}`,
      )
      .join("\n\n");

    const prompt =
      `You are helping a developer write notes about their code. ` +
      `Based on the code references in this note, suggest a natural continuation for the current line.\n\n` +
      `Code Context:\n${codeContext}\n\n` +
      `Current note text:\n${document.getText(
        new vscode.Range(
          new vscode.Position(0, 0),
          new vscode.Position(position.line, position.character),
        ),
      )}\n\n` +
      `Current line so far: "${lineUpToCursor}"\n\n` +
      `Suggest ONLY the continuation text (not the full line). Be concise and relevant to the code context. ` +
      `If no good suggestion comes to mind, return empty string.`;

    try {
      const models = await vscode.lm.selectChatModels({
        vendor: "copilot",
        family: "gpt-4",
      });

      if (models.length === 0) {
        return [];
      }

      const messages = [vscode.LanguageModelChatMessage.User(prompt)];

      const response = await models[0].sendRequest(messages, {}, token);

      let suggestion = "";
      for await (const chunk of response.stream) {
        if (chunk instanceof vscode.LanguageModelTextPart) {
          suggestion += chunk.value;
        }
        if (token.isCancellationRequested) {
          return [];
        }
      }

      suggestion = suggestion.trim();

      if (suggestion && !suggestion.includes("\n")) {
        return [
          new vscode.InlineCompletionItem(
            suggestion,
            new vscode.Range(position, position),
          ),
        ];
      }

      return [];
    } catch (err) {
      if (err instanceof vscode.LanguageModelError) {
        // Model errors are expected sometimes, silently fail
        return [];
      }
      throw err;
    }
  }

  private isInCodeBlock(
    document: vscode.TextDocument,
    position: vscode.Position,
  ): boolean {
    let inCodeBlock = false;
    for (let i = 0; i < position.line; i++) {
      const line = document.lineAt(i).text;
      if (line.trim().startsWith("```")) {
        inCodeBlock = !inCodeBlock;
      }
    }
    return inCodeBlock;
  }
}

export function initInlineCompletionProvider(
  context: vscode.ExtensionContext,
  storage: NotesStorage,
): void {
  const provider = new NotesInlineCompletionProvider(storage, context);
  const notesDir = getNotesDir(context);

  // Register for all markdown files
  const selector: vscode.DocumentSelector = {
    scheme: "file",
    language: "markdown",
  };

  context.subscriptions.push(
    vscode.languages.registerInlineCompletionItemProvider(selector, provider),
  );
}
