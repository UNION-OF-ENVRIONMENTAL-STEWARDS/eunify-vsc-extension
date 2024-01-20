import * as vscode from "vscode";

// Variables
let trackedEvents: string[] = [];
let fileListeners: vscode.Disposable[] = [];
let documentListeners: vscode.Disposable[] = [];
let editorListeners: vscode.Disposable[] = [];
let debugListeners: vscode.Disposable[] = [];
let startTime: Date | null = null;
let timerInterval: NodeJS.Timeout | null = null;
let stopTime: Date | null = null;
let statusBarItem: vscode.StatusBarItem;
let isTracking = false;

// Activation Function
export function activate(context: vscode.ExtensionContext) {
  initializeStatusBar(context);
  restorePreviousState(context);
  registerCommands(context);
  continuePreviousTracking(context);
  registerTreeDataProvider();
  checkInstalledExtensions();
  checkCopilotInstallation();
}

function initializeStatusBar(context: vscode.ExtensionContext) {
  statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left
  );
  context.subscriptions.push(statusBarItem);
}

function restorePreviousState(context: vscode.ExtensionContext) {
  const savedStartTime = context.globalState.get<string>("startTime");
  const savedElapsedTime = context.globalState.get<number>("elapsedTime");

  if (savedStartTime) {
    startTime = new Date(savedStartTime);
  }

  if (startTime && savedElapsedTime) {
    startTime = new Date(startTime.getTime() - savedElapsedTime);
  }

  trackedEvents = context.globalState.get<string[]>("trackedEvents") || [];
}

function registerCommands(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.commands.registerCommand("eunifyTracker.start", () =>
      startTracking(context)
    ),
    vscode.commands.registerCommand("eunifyTracker.stop", () =>
      softStopTracking(context)
    )
  );
}

function continuePreviousTracking(context: vscode.ExtensionContext) {
  if (context.globalState.get("isTracking")) {
    startTracking(context); // Resume tracking
  }
}

function registerTreeDataProvider() {
  vscode.window.registerTreeDataProvider(
    "eunifyTrackerView",
    eunifyTrackerProvider
  );
  eunifyTrackerProvider.refresh();
}

// Main Tracking Functions
function startTracking(context: vscode.ExtensionContext) {
  if (isTracking) {
    return; // Avoid double start
  }

  isTracking = true;
  context.globalState.update("isTracking", isTracking);
  vscode.commands.executeCommand("setContext", "isTracking", true);
  setStartTime(context);
  timerInterval = setInterval(() => updateTimer(context), 1000);
  updateTimer(context);

  registerEventListeners();
  vscode.window.showInformationMessage("Tracking started");
  context.globalState.update("trackedEvents", trackedEvents);
}

function setStartTime(context: vscode.ExtensionContext) {
  if (!startTime) {
    startTime = new Date(); // Always use the current time as the start time
  }
}

function updateTimer(context: vscode.ExtensionContext) {
  if (!startTime || !timerInterval) {
    return;
  }

  const savedElapsedTime = context.globalState.get<number>("elapsedTime") || 0;
  const elapsed = new Date().getTime() - startTime.getTime() + savedElapsedTime; // Add the saved elapsed time to the current elapsed time
  const timeStr = new Date(elapsed).toISOString().substr(11, 8); // Extract time from ISO string
  
  statusBarItem.text = `Tracking: ${timeStr}`;
  statusBarItem.show();
  vscode.commands.executeCommand("setContext", "elapsedTime", timeStr);
}

function registerEventListeners() {
  registerFileEventListeners();
  registerDocumentEventListeners();
  registerEditorEventListeners();
  registerDebugEventListeners();
}

function softStopTracking(context: vscode.ExtensionContext) {
  if (!isTracking) {
    return;
  }

  isTracking = false;
  context.globalState.update("isTracking", isTracking);
  vscode.commands.executeCommand("setContext", "isTracking", false);

  if (timerInterval) {
    clearInterval(timerInterval);
  }

  if (startTime) {
    stopTime = new Date(); // Store the current time as the stop time
    const elapsed = stopTime.getTime() - startTime.getTime();
    const savedElapsedTime = context.globalState.get<number>("elapsedTime") || 0;
    context.globalState.update("elapsedTime", elapsed + savedElapsedTime); // Add the elapsed time to the saved elapsed time
    startTime = null;
  }

  statusBarItem.text = `Tracking: 00:00:00`;
  statusBarItem.hide();
  trackedEvents = [];
  eunifyTrackerProvider.refresh();
  vscode.window.showInformationMessage("Tracking stopped");
}

export function deactivate(context: vscode.ExtensionContext) {
  if (isTracking && startTime) {
    context.globalState.update(
      "elapsedTime",
      new Date().getTime() - startTime.getTime()
    );
  }
  hardStopTracking(context);
}

function hardStopTracking(context: vscode.ExtensionContext) {
  isTracking = false;
  startTime = null;
  if (timerInterval) {
    clearInterval(timerInterval);
  }
  statusBarItem.hide();
  context.globalState.update("elapsedTime", 0);
}

// Utility Functions

// Event Listener Registration
function registerFileEventListeners() {
  fileListeners.push(
    vscode.workspace.onDidCreateFiles((event) =>
      logToConsole(`File created: ${event.files[0].toString()}`)
    ),
    vscode.workspace.onDidDeleteFiles((event) =>
      logToConsole(`File deleted: ${event.files[0].toString()}`)
    ),
    vscode.workspace.onDidChangeWorkspaceFolders((event) =>
      logToConsole(`Workspace folder changed: ${JSON.stringify(event)}`)
    )
  );
}

function registerDocumentEventListeners() {
  documentListeners.push(
    vscode.workspace.onDidOpenTextDocument((event) =>
      logToConsole(`Text document opened: ${event.uri.toString()}`)
    ),
    vscode.workspace.onDidCloseTextDocument((event) =>
      logToConsole(`Text document closed: ${event.uri.toString()}`)
    ),
    vscode.workspace.onDidChangeTextDocument((event) =>
      logToConsole(`Text document changed: ${event.document.uri.toString()}`)
    )
  );
}

function registerEditorEventListeners() {
  editorListeners.push(
    vscode.window.onDidChangeActiveTextEditor((event) => {
      if (event && event.document) {
        logToConsole(`Text editor changed: ${event.document.uri.toString()}`);
      }
    })
  );
}

function registerDebugEventListeners() {
  debugListeners.push(
    vscode.debug.onDidStartDebugSession((session) =>
      logToConsole(`Debug session started: ${session.name}`)
    ),
    vscode.debug.onDidTerminateDebugSession((session) =>
      logToConsole(`Debug session stopped: ${session.name}`)
    )
  );
}

// Utility to Log Events
function checkInstalledExtensions() {
  const allExtensions = vscode.extensions.all;
  allExtensions.forEach((ext) => {
    logToConsole(`Installed Extension: ${ext.id}`);
  });
}

function checkCopilotInstallation() {
  const copilotInstalled = !!vscode.extensions.getExtension("github.copilot");
  copilotInstalled
    ? logToConsole("GitHub Copilot is installed.")
    : logToConsole("GitHub Copilot is not installed.");
}

function logToConsole(message: string) {
  try {
    console.log(message); // Log to console
    trackedEvents.push(message); // Add to our list
    eunifyTrackerProvider.refresh(); // Refresh our custom view
  } catch (error) {
    vscode.window.showErrorMessage(
      `Failed to log message. Error: ${(error as Error).toString()}`
    );
  }
}

// TreeDataProvider
class EunifyTrackerProvider implements vscode.TreeDataProvider<string> {
  private _onDidChangeTreeData: vscode.EventEmitter<string | undefined> =
    new vscode.EventEmitter<string | undefined>();
  readonly onDidChangeTreeData: vscode.Event<string | undefined> =
    this._onDidChangeTreeData.event;

  getTreeItem(element: string): vscode.TreeItem {
    return new vscode.TreeItem(element, vscode.TreeItemCollapsibleState.None);
  }

  getChildren(element?: string): Thenable<string[]> {
    if (!element) {
      return Promise.resolve(trackedEvents);
    }
    return Promise.resolve([]);
  }

  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }
}

const eunifyTrackerProvider = new EunifyTrackerProvider();