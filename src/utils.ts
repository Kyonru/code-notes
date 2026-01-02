import * as vscode from "vscode";
import { EXTENSION_NAME } from "./constants";

export const createCommandName = (name: string) => `${EXTENSION_NAME}.${name}`;

export function getLineFromOffset(content: string, offset: number): number {
  return content.slice(0, offset).split(/\r?\n/).length;
}

export function getNotesDir(context: vscode.ExtensionContext) {
  return context.globalStorageUri.fsPath;
}
