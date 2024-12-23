# File Manager Plugin for Obsidian

This plugin enhances the Obsidian File Explorer by introducing essential file management features. It adds several new commands to interact with the `File Explorer`, allowing users to bind hotkeys for efficient keyboard-only file management. 

**NOTE**: Version 1.2 introduces the new [`pathexplorer`](#pathexplorer-codeblock) codeblock. See [details](#pathexplorer-codeblock) below.

## Features

-   **Open With**: Open files or folders using custom commands.
-   **Go to File/Folder**: Locate and focus on a file or folder in the file explorer.
-   **`pathexplorer` codeblock**: Display files and folders from specified paths and open them using custom commands.
-   **Create Subfolder**: Create a subfolder within the current folder.
-   **Create Folder**: Create a sibling folder.
-   **Create Note**: Create an empty note in the current folder.
-   **Duplicate**: Duplicate files or folders.
-   **Move**: Move selected files or folders to a new location.
-   **Copy**: Copy selected files or folders to a new location.
-   **Copy, Cut, Paste**: Copy or cut selected files or folders to the clipboard and paste them.
-   **Clear Clipboard**: Clear the clipboard contents.
-   **Toggle Selection**: Toggle the selection of a file or folder.
-   **Select All**: Select all files and folders.
-   **Invert Selection**: Invert the current selection.
-   **Deselect All**: Clear all selections.
-   **Rename**: Rename files or folders.

### Copy/Move Conflict Resolution

When file conflicts occur, choose from the following resolution methods:

-   **Overwrite**: Replace the existing file or folder.
-   **Skip**: Ignore the conflicting file or folder.
-   **Keep**: Retain both files by renaming the new one.

## Usage

### File Explorer Commands

> **NOTE**: These commands are available only when the `File Explorer` panel is focused.

-   `File Manager: Create a subfolder within the focused or active file/folder`.
-   `File Manager: Create a folder as sibling of the focused or active file/folder`.
-   `File Manager: Create a note within the focused or active folder`.
-   `File Manager: Duplicate focused or active file/folder`,
-   `File Manager: Copy selected files/folders to clipboard`,
-   `File Manager: Cut selected files/folders to clipboard`,
-   `File Manager: Paste files/folders from clipboard to selected folder`,
-   `File Manager: Clear clipboard`,
-   `File Manager: Move selected files/folders to a new folder`.
-   `File Manager: Copy selected files/folders to a new folder`.
-   `File Manager: Select all siblings and children of the focused or active file/folder`.
-   `File Manager: Toggle selection of the focused or active file/folder`.
-   `File Manager: Clear selection`.
-   `File Manager: Invert selection`.
-   `File Manager: Rename focused or active file/folder`.

### Global Commands

> **NOTE**: The following command is available if a file explorer exists in Obsidian.

-   `File Manager: Go to file or folder in file explorer`.

> **NOTE**: This command is globally available. If the file explorer is active, the focused or selected file/folder will be used for the `Open With` command. Otherwise, the currently active document will be used.

-   `File Manager: Open with ...`

Create custom `Open With` commands in the settings tab.

![Open With](./assets/openwith.png)

**NEW:** Version 1.3.1 allows to define app URL Schemas as commands (for example: `ulysses://x-callback-url/open?path={{file_path}}`).

The `Open With` commands are also available in the File Context Menu if enabled in the settings.

<img src="./assets/contextmenu.png" width="200">

### pathexplorer codeblock

Version 1.2 introduces the `pathexplorer` codeblock. For example, adding the following codeblock to a note:

````
```pathexplorer
# Path or paths to explore.
path C:\projects\dev\dump_shortcuts

# If present include dump_shortcuts as root of files and folders. 
include-root

# Use .gitignore syntax to ignore files/folders.
ignore .git/
ignore .venv/
ignore old/
ignore build/
ignore dist/
ignore test*/
ignore __pycache__/
ignore .*
ignore *.bat
ignore *.spec

# Define max-depth (default 1)
max-depth 3

# Define max-files (default 100)
max-files 20 
```
````

Will render the following output in reader mode:

![Settings](./assets/pathexplorer.png)

#### `pathexplorer` codeblock syntax.

> **#** 
> 
> For line comments
> 
> **path \<relative or absolute path\>**
> 
> Specify paths to explore. Multiple paths can be defined, one per line.
> 
> **include-root**
>
> Include the root folder as the parent of its children.
>
> **max-depth**
>
> Max depth level to explore in the tree.
>
> **max-files**
>
> Max number of files/folders to display.
>
> **ignore**
>
> Ignore files/folders using `.gitignore` patterns. Inverted patterns (`!<pattern>`) are also supported.  Multiple ignore patterns can be defined, one per line.
>
> **flat [\<none\> | hide-files | hide-folders]**
>
> Display files and folders as a list without hierarchy. Use optional flags to hide files or folders.
>
> **hide-icons**
>
> Hide command icons next to files/folders.

Create custom patterns in the settings tab.

![pathexplorer settings](./assets/pathexplorer_settings.png)

## Installation

Install `File Manager` from the Community Plugins section.

## Configuration

Customize plugin behavior using the general settings tab.

**NOTE**: Refer to the `Open With` and `pathexplorer` sections for additional settings.

![Settings](./assets/settings.png)

## Development

1. Clone this repository into the `.obsidian/plugins` folder of an Obsidian Vault.
2. Ensure Node.js version is at least v16 (`node --version`).
3. Run `npm install` to install dependencies.
4. Run `npm run dev` to start compilation in watch mode.
5. Enable the `File Manager` plugin in Obsidian settings.

## Support

For issues or feature requests, open an issue on the GitHub repository.

## License

This plugin is licensed under the MIT License.

## Roadmap

-   Add **merge** functionality for folder copy/move.
-   Auto-select files in the destination after copying/moving.
-   Add **sorting** customization to `pathexplorer` codeblock.

## Acknowledgments

This plugin was inspired by the following plugins. Thanks to their developers:

-   [Obsidian Open With](https://github.com/phibr0/obsidian-open-with)
-   [Obsidian File Explorer Count](https://github.com/ozntel/file-explorer-note-count)

