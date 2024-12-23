import { getAbsolutePathOfFile } from "file_manager";
import { TAbstractFile, TFile, TFolder } from "obsidian";
import open from "open";
import path from "path";
import { promises as fsa } from "fs";

/**
 * It stores all the information to create a obsidian command with a check
 * callback. It will be used to create dynamic commands for all the apps
 * defined by the user to open files/folders with.
 */
export interface OpenWithCmd {
	id: string;
	name: string;
	checkCallback: (checking: boolean) => void;
}

// Variables to be replaced in the command arguments.
export const VAR_FILE_PATH = "{{file_path}}";
export const VAR_FOLDER_PATH = "{{folder_path}}";
export const VAR_FILE_NAME = "{{file_name}}";
export const VAR_FOLDER_NAME = "{{folder_name}}";

// URL Schema separator.
const URL_SCHEMA = "://";

// All the variables that can be replaced in the command arguments.
export const ALL_VARS = [
	VAR_FILE_NAME,
	VAR_FILE_PATH,
	VAR_FOLDER_NAME,
	VAR_FOLDER_PATH,
];

function _replaceVar(
	text: string,
	filePath: string,
	folderPath: string,
	fileName: string,
	folderName: string
) {
	text = text.includes(VAR_FILE_PATH)
		? text.replace(VAR_FILE_PATH, filePath)
		: text;
	text = text.includes(VAR_FOLDER_PATH)
		? text.replace(VAR_FOLDER_PATH, folderPath)
		: text;
	text = text.includes(VAR_FILE_NAME)
		? text.replace(VAR_FILE_NAME, fileName)
		: text;
	text = text.includes(VAR_FOLDER_NAME)
		? text.replace(VAR_FOLDER_NAME, folderName)
		: text;
	return text;
}

/**
 * Opens the file with the given command and arguments.
 * @param cmd The command to open the file with.
 * @param args The arguments to pass to the command.
 * @param filePath The path of the file to open.
 * @param folderPath The path of the folder containing the file.
 * @param fileName The name of the file.
 * @param folderName The name of the folder containing the file.
 */
async function _openPath(
	cmd: string,
	args: string,
	filePath: string,
	folderPath: string,
	fileName: string,
	folderName: string
) {
	// From version 1.3.1 the command could also be an App URL Schema (the
	// command contains "://"). In this case variables could appear in the URL
	// Schema, so we replace them and open it with the browser. Arguments are
	// not supported in this case.
	if (cmd.includes(URL_SCHEMA)) {
		cmd = _replaceVar(cmd, filePath, folderPath, fileName, folderName);
		window.open(cmd);
		return;
	}

	// Create the app object that will be passed to the open function.
	// It contains the "name" of the app and the "arguments" to pass to it.
	const app: { [key: string]: any } = {};
	app.name = cmd;
	args = args.trim();
	if (args) {
		app.arguments = args.split(",");
		app.arguments.forEach((arg: string, index: number) => {
			arg = arg.trim();
			arg = _replaceVar(arg, filePath, folderPath, fileName, folderName);
			app.arguments[index] = arg;
		});
	}
	//@ts-ignore
	await open("", { app });
}

/**
 * Opens the file with the given command and arguments.
 * @param fileOrFolder The file/folder to open.
 * @param cmd The command to open the file with.
 * @param args The arguments to pass to the command.
 */
async function _openStringFile(
	fileOrFolder: string,
	cmd: string,
	args: string
) {
	const stats = await fsa.stat(fileOrFolder);
	const filePath = fileOrFolder;
	const folderPath = stats.isDirectory()
		? fileOrFolder
		: path.dirname(fileOrFolder);
	const fileName = path.basename(filePath);
	const folderName = path.basename(folderPath);

	await _openPath(cmd, args, filePath, folderPath, fileName, folderName);
}

/**
 * Opens the file with the given command and arguments.
 * @param fileOrFolder The file/folder to open.
 * @param cmd The command to open the file with.
 * @param args The arguments to pass to the command.
 */
async function _openTAbstractFile(
	fileOrFolder: TAbstractFile,
	cmd: string,
	args: string
) {
	const folder: TFolder =
		fileOrFolder instanceof TFolder ? fileOrFolder : fileOrFolder.parent!;
	const filePath: string = getAbsolutePathOfFile(fileOrFolder);
	const folderPath: string = getAbsolutePathOfFile(folder);
	const fileName: string = fileOrFolder.name;
	const folderName: string = folder.name;
	await _openPath(cmd, args, filePath, folderPath, fileName, folderName);
}

/**
 * Opens the file with the given command and arguments.
 * @param fileOrFolder The file/folder to open. It can be a string path or an
 * Obsidian's TAbstractFile.
 * @param cmd The command to open the file with.
 * @param args The arguments to pass to the command. It can contain the
 * variables VAR_FILE_PATH, VAR_FOLDER_PATH, VAR_FILE_NAME and VAR_FOLDER_NAME
 * that will be replaced by the corresponding values of the file.
 */
export async function openFile(
	fileOrFolder: TAbstractFile | string,
	cmd: string,
	args: string
) {
	if (typeof fileOrFolder === "string") {
		await _openStringFile(fileOrFolder, cmd, args);
	} else {
		await _openTAbstractFile(fileOrFolder, cmd, args);
	}
}
