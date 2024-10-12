# File Manager Plugin for Obsidian

This plugin adds advanced file management features to the Obsidian file explorer.

## Features

-   **Create subfolder**: Create a subfolders of current folder.
-   **Create folder**: Create sibling folder.
-   **Duplicate**: Duplicates file/folder.
-   **Move**: Move selected files/folders to existing location.
-   **Copy**: Copy selected files/folders to existing location.
-   **Copy, Cut and Paste**: Copy or cut selected files/folders to clipboard and paste from it.
-   **Toggle Selection**: Toggle selection of file/folder.
-   **Select All**: Select all files/folders.
-   **Deselect All**: Clear selection
-   **Invert Selection**: Invert the current selection.
-   **Rename**: Rename file/folder.

### Conflict Resolution

When a file conflict occurs, choose between a dialog asking for conflict resolution
or a predefined method:

-   **Overwrite**: Overwrite the existing file/folder.
-   **Skip**: Skip the conflicting file/folder.
-   **Keep**: Keep both files by renaming the new one.

## Usage

When you have the focus in the `file explorer` panel, the following commands
will be available.

### Commands

-   `Create a subfolder within the focused or active file/folder`.
-   `Create a folder as sibling of the focused or active file/folder`.
-   `Duplicate focused or active file/folder`,
-   `Copy selected files/folders to clipboard`,
-   `Paste files/folders from clipboard to selected folder`,
-   `Cut selected files/folders to clipboard`,
-   `Move selected files/folders to a new folder`.
-   `Copy selected files/folders to a new folder`.
-   `Select all siblings and children of the focused or active file/folder`.
-   `Toggle selection of the focused or active file/folder`.
-   `Clear selection`.
-   `Invert selection`.
-   `Rename focused or active file/folder`.

## Installation

Select `File Manager` from the community available plugins.

### Configuration

There's a settings tab for the plugin to customize behaviour.

## Development

1. Clone this repository into the `.obsidian/plugins` folder of a obsidian Vault.
2. Ensure your NodeJS version is at least v16 (`node --version`).
3. Run `npm install` to install dependencies.
4. Run `npm run dev` to start compilation in watch mode.

## Support

For any issues or feature requests, please open an issue on the GitHub repository.

## License

This plugin is licensed under the MIT License.
