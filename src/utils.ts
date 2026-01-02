import * as vscode from "vscode";
import * as path from "path";
import * as os from "os";

import { EXTENSION_NAME } from "./constants";

export const createCommandName = (name: string) => `${EXTENSION_NAME}.${name}`;

export function getLineFromOffset(content: string, offset: number): number {
  return content.slice(0, offset).split(/\r?\n/).length;
}

export function getNotesDir(context: vscode.ExtensionContext): string {
  const config = vscode.workspace.getConfiguration(EXTENSION_NAME);
  const customPath = config.get<string>("notesDirectory");

  if (customPath && customPath.trim() !== "") {
    const expandedPath = customPath.startsWith("~")
      ? path.join(os.homedir(), customPath.slice(1))
      : customPath;
    return path.resolve(expandedPath);
  }

  return getDefaultNotesDir(context);
}

export function getDefaultNotesDir(context: vscode.ExtensionContext) {
  return context.globalStorageUri.fsPath;
}
