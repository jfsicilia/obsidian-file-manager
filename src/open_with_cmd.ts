import { getAbsolutePathOfFile } from "file_manager";
import { TAbstractFile, TFile, TFolder } from "obsidian";
import { FileManager } from "file_manager";
import open from "open";

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

// All the variables that can be replaced in the command arguments.
export const ALL_VARS = [
	VAR_FILE_NAME,
	VAR_FILE_PATH,
	VAR_FOLDER_NAME,
	VAR_FOLDER_PATH,
];

/**
 * Opens the file with the given command and arguments.
 */
export async function openFile(file: TAbstractFile, cmd: string, args: string) {
	const app: { [key: string]: any } = {};
	app.name = cmd;
	args = args.trim();
	if (args) {
		app.arguments = args.split(",");
		app.arguments.forEach((arg: string, index: number) => {
			arg = arg.trim();
			const folder: TFolder =
				file instanceof TFolder ? file : file.parent!;
			arg = arg.includes(VAR_FILE_PATH)
				? arg.replace(VAR_FILE_PATH, getAbsolutePathOfFile(file))
				: arg;
			arg = arg.includes(VAR_FOLDER_PATH)
				? arg.replace(VAR_FOLDER_PATH, getAbsolutePathOfFile(folder))
				: arg;
			arg = arg.includes(VAR_FILE_NAME)
				? arg.replace(VAR_FILE_NAME, file.name)
				: arg;
			arg = arg.includes(VAR_FOLDER_NAME)
				? arg.replace(VAR_FOLDER_NAME, folder.name)
				: arg;
			app.arguments[index] = arg;
		});
	}
	//@ts-ignore
	await open("", { app });
}

/**
 * Creates a new OpenWithCmd object with the given name, command and arguments.
 * The callback function of the command will first check if the file explorer
 * has an active file or folder, and then open the file with the given command
 * and arguments.
 */
export function createOpenWithCmd(
	fm: FileManager,
	name: string,
	cmd: string,
	args: string
): OpenWithCmd {
	return {
		id: "open-with-" + name.toLowerCase(),
		name: "Open with " + name,
		checkCallback: (checking: boolean): boolean => {
			// Get the active file or folder in file explorer.
			let file: TAbstractFile | null = fm.getActiveFileOrFolder();
			if (!file) return false;
			if (checking) return true;
			// All went well and not checking, so open the file.
			(async () => await openFile(file, cmd, args))();
			return true;
		},
	};
}
