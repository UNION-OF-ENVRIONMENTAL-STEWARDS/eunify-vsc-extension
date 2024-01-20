"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deactivate = exports.activate = void 0;
const vscode = require("vscode");
// Variables
let trackedEvents = [];
let fileListeners = [];
let documentListeners = [];
let editorListeners = [];
let debugListeners = [];
let startTime = null;
let timerInterval = null;
let stopTime = null;
let statusBarItem;
let isTracking = false;
// Activation Function
function activate(context) {
    initializeStatusBar(context);
    restorePreviousState(context);
    registerCommands(context);
    continuePreviousTracking(context);
    registerTreeDataProvider();
    checkInstalledExtensions();
    checkCopilotInstallation();
}
exports.activate = activate;
function initializeStatusBar(context) {
    statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);
    context.subscriptions.push(statusBarItem);
}
function restorePreviousState(context) {
    const savedStartTime = context.globalState.get("startTime");
    const savedElapsedTime = context.globalState.get("elapsedTime");
    if (savedStartTime) {
        startTime = new Date(savedStartTime);
    }
    if (startTime && savedElapsedTime) {
        startTime = new Date(startTime.getTime() - savedElapsedTime);
    }
    trackedEvents = context.globalState.get("trackedEvents") || [];
}
function registerCommands(context) {
    context.subscriptions.push(vscode.commands.registerCommand("eunifyTracker.start", () => startTracking(context)), vscode.commands.registerCommand("eunifyTracker.stop", () => softStopTracking(context)));
}
function continuePreviousTracking(context) {
    if (context.globalState.get("isTracking")) {
        startTracking(context); // Resume tracking
    }
}
function registerTreeDataProvider() {
    vscode.window.registerTreeDataProvider("eunifyTrackerView", eunifyTrackerProvider);
    eunifyTrackerProvider.refresh();
}
// Main Tracking Functions
function startTracking(context) {
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
function setStartTime(context) {
    if (!startTime) {
        startTime = new Date(); // Always use the current time as the start time
    }
}
function updateTimer(context) {
    if (!startTime || !timerInterval) {
        return;
    }
    const savedElapsedTime = context.globalState.get("elapsedTime") || 0;
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
function softStopTracking(context) {
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
        const savedElapsedTime = context.globalState.get("elapsedTime") || 0;
        context.globalState.update("elapsedTime", elapsed + savedElapsedTime); // Add the elapsed time to the saved elapsed time
        startTime = null;
    }
    statusBarItem.text = `Tracking: 00:00:00`;
    statusBarItem.hide();
    trackedEvents = [];
    eunifyTrackerProvider.refresh();
    vscode.window.showInformationMessage("Tracking stopped");
}
function deactivate(context) {
    if (isTracking && startTime) {
        context.globalState.update("elapsedTime", new Date().getTime() - startTime.getTime());
    }
    hardStopTracking(context);
}
exports.deactivate = deactivate;
function hardStopTracking(context) {
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
    fileListeners.push(vscode.workspace.onDidCreateFiles((event) => logToConsole(`File created: ${event.files[0].toString()}`)), vscode.workspace.onDidDeleteFiles((event) => logToConsole(`File deleted: ${event.files[0].toString()}`)), vscode.workspace.onDidChangeWorkspaceFolders((event) => logToConsole(`Workspace folder changed: ${JSON.stringify(event)}`)));
}
function registerDocumentEventListeners() {
    documentListeners.push(vscode.workspace.onDidOpenTextDocument((event) => logToConsole(`Text document opened: ${event.uri.toString()}`)), vscode.workspace.onDidCloseTextDocument((event) => logToConsole(`Text document closed: ${event.uri.toString()}`)), vscode.workspace.onDidChangeTextDocument((event) => logToConsole(`Text document changed: ${event.document.uri.toString()}`)));
}
function registerEditorEventListeners() {
    editorListeners.push(vscode.window.onDidChangeActiveTextEditor((event) => {
        if (event && event.document) {
            logToConsole(`Text editor changed: ${event.document.uri.toString()}`);
        }
    }));
}
function registerDebugEventListeners() {
    debugListeners.push(vscode.debug.onDidStartDebugSession((session) => logToConsole(`Debug session started: ${session.name}`)), vscode.debug.onDidTerminateDebugSession((session) => logToConsole(`Debug session stopped: ${session.name}`)));
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
function logToConsole(message) {
    try {
        console.log(message); // Log to console
        trackedEvents.push(message); // Add to our list
        eunifyTrackerProvider.refresh(); // Refresh our custom view
    }
    catch (error) {
        vscode.window.showErrorMessage(`Failed to log message. Error: ${error.toString()}`);
    }
}
// TreeDataProvider
class EunifyTrackerProvider {
    constructor() {
        this._onDidChangeTreeData = new vscode.EventEmitter();
        this.onDidChangeTreeData = this._onDidChangeTreeData.event;
    }
    getTreeItem(element) {
        return new vscode.TreeItem(element, vscode.TreeItemCollapsibleState.None);
    }
    getChildren(element) {
        if (!element) {
            return Promise.resolve(trackedEvents);
        }
        return Promise.resolve([]);
    }
    refresh() {
        this._onDidChangeTreeData.fire(undefined);
    }
}
const eunifyTrackerProvider = new EunifyTrackerProvider();
//# sourceMappingURL=extension.js.map