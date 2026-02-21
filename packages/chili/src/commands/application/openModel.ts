// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import {
    AsyncController,
    CancelableCommand,
    Combobox,
    PubSub,
    command,
    property,
    type CommandKeys,
} from "chili-core";

const OPEN_FORMAT_COMMANDS: Record<string, CommandKeys> = {
    IFC: "file.openIfc",
    IFCX: "file.openIfcx",
};

@command({
    key: "file.openModel",
    icon: "icon-folder-open",
    isApplicationCommand: true,
})
export class OpenModel extends CancelableCommand {
    @property("file.format")
    get format() {
        return this.getPrivateValue("format", this.initFormats());
    }

    @property("common.confirm")
    readonly confirm = () => {
        this.controller?.success();
    };

    protected async executeAsync(): Promise<void> {
        this.controller = new AsyncController();
        const result = await waitForController(this.controller);
        if (result !== "success") {
            return;
        }

        const selected = this.format.selectedItem;
        if (!selected) {
            return;
        }

        const command = OPEN_FORMAT_COMMANDS[selected];
        if (command) {
            PubSub.default.pub("executeCommand", command);
        }
    }

    private initFormats() {
        const box = new Combobox<string>();
        box.items.push("IFC", "IFCX");
        return box;
    }
}

function waitForController(controller: AsyncController): Promise<"success" | "cancel"> {
    return new Promise((resolve) => {
        controller.onCompleted(() => resolve("success"));
        controller.onCancelled(() => resolve("cancel"));
    });
}
