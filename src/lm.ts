import * as vscode from "vscode";
import { EXTENSION_NAME } from "./constants";

// --- Types ---

export interface LMMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface LMProvider {
  sendRequest(
    messages: LMMessage[],
    token?: vscode.CancellationToken
  ): Promise<string>;
  isAvailable(): boolean;
  readonly name: string;
}

// --- VS Code LM Provider ---

export class VSCodeLMProvider implements LMProvider {
  readonly name = "vscode";

  isAvailable(): boolean {
    return typeof vscode.lm !== "undefined" && typeof vscode.lm.selectChatModels === "function";
  }

  async sendRequest(
    messages: LMMessage[],
    token?: vscode.CancellationToken
  ): Promise<string> {
    const model = await this.selectModel();
    if (!model) {
      throw new Error("No language model selected.");
    }

    const chatMessages = messages.map((m) =>
      m.role === "user"
        ? vscode.LanguageModelChatMessage.User(m.content)
        : vscode.LanguageModelChatMessage.Assistant(m.content)
    );

    const response = await model.sendRequest(
      chatMessages,
      {},
      token ?? new vscode.CancellationTokenSource().token
    );

    let result = "";
    for await (const chunk of response.stream) {
      if (chunk instanceof vscode.LanguageModelTextPart) {
        result += chunk.value;
      }
    }
    return result;
  }

  private async selectModel(): Promise<vscode.LanguageModelChat | undefined> {
    const config = vscode.workspace.getConfiguration(EXTENSION_NAME);
    const preferredFamily = config.get<string>("modelFamily")?.trim();

    const selector: vscode.LanguageModelChatSelector = { vendor: "copilot" };
    if (preferredFamily) {
      selector.family = preferredFamily;
    }

    let models = await vscode.lm.selectChatModels(selector);

    if (models.length === 0 && preferredFamily) {
      models = await vscode.lm.selectChatModels({ vendor: "copilot" });
    }

    if (models.length === 0) {
      vscode.window.showErrorMessage(
        "No language model available. Make sure GitHub Copilot is active."
      );
      return undefined;
    }

    if (models.length === 1) {
      return models[0];
    }

    const items = models.map((m) => ({
      label: m.name,
      description: m.family,
      model: m,
    }));

    const picked = await vscode.window.showQuickPick(items, {
      placeHolder: "Select a language model",
    });

    return picked?.model;
  }
}

// --- External LM Provider (OpenAI-compatible) ---

export class ExternalLMProvider implements LMProvider {
  readonly name = "external";

  isAvailable(): boolean {
    const config = vscode.workspace.getConfiguration(EXTENSION_NAME);
    const endpoint = config.get<string>("aiEndpoint")?.trim();
    return !!endpoint;
  }

  async sendRequest(
    messages: LMMessage[],
    token?: vscode.CancellationToken
  ): Promise<string> {
    const config = vscode.workspace.getConfiguration(EXTENSION_NAME);
    const endpoint = config.get<string>("aiEndpoint")?.trim();
    const model = config.get<string>("aiModel")?.trim() || "gpt-4o";

    if (!endpoint) {
      throw new Error(
        "No AI endpoint configured. Set crosscodenotes.aiEndpoint in settings."
      );
    }

    const apiKey = await this.getApiKey();
    if (!apiKey) {
      throw new Error(
        "No API key configured. Run 'Codebase Notebook: Set AI API Key' command."
      );
    }

    const body = JSON.stringify({
      model,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
    });

    const controller = new AbortController();
    const disposeToken = token?.onCancellationRequested(() =>
      controller.abort()
    );

    try {
      const response = await fetch(`${endpoint}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body,
        signal: controller.signal,
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`AI API error (${response.status}): ${text}`);
      }

      const data = (await response.json()) as {
        choices?: { message?: { content?: string } }[];
      };

      return data.choices?.[0]?.message?.content?.trim() ?? "";
    } finally {
      disposeToken?.dispose();
    }
  }

  private secretStorage: vscode.SecretStorage | undefined;

  setSecretStorage(storage: vscode.SecretStorage): void {
    this.secretStorage = storage;
  }

  async getApiKey(): Promise<string | undefined> {
    return this.secretStorage?.get("crosscodenotes.aiApiKey");
  }

  async setApiKey(key: string): Promise<void> {
    await this.secretStorage?.store("crosscodenotes.aiApiKey", key);
  }

  async clearApiKey(): Promise<void> {
    await this.secretStorage?.delete("crosscodenotes.aiApiKey");
  }
}

// --- Provider Manager ---

let activeProvider: LMProvider | undefined;
let externalProviderInstance: ExternalLMProvider | undefined;

export function initLMProvider(context: vscode.ExtensionContext): void {
  const vscodeLM = new VSCodeLMProvider();
  externalProviderInstance = new ExternalLMProvider();
  externalProviderInstance.setSecretStorage(context.secrets);

  // Auto-detect: prefer VS Code LM if available
  if (vscodeLM.isAvailable()) {
    const config = vscode.workspace.getConfiguration(EXTENSION_NAME);
    const preferred = config.get<string>("aiProvider")?.trim();

    if (preferred === "external" && externalProviderInstance.isAvailable()) {
      activeProvider = externalProviderInstance;
    } else {
      activeProvider = vscodeLM;
    }
  } else if (externalProviderInstance.isAvailable()) {
    activeProvider = externalProviderInstance;
  } else {
    // Will fallback to vscode and show error on use
    activeProvider = vscodeLM;
  }
}

export function getLMProvider(): LMProvider {
  if (!activeProvider) {
    throw new Error("LM Provider not initialized. Call initLMProvider first.");
  }
  return activeProvider;
}

export function getExternalProvider(): ExternalLMProvider {
  if (!externalProviderInstance) {
    throw new Error("External LM Provider not initialized.");
  }
  return externalProviderInstance;
}
