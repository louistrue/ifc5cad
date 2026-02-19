// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import {
    Config,
    type IDocument,
    type IEventHandler,
    type IMeshExporter,
    type IVisual,
    isDisposable,
    Logger,
    type Plane,
} from "chili-core";
import { NodeSelectionHandler } from "chili-vis";
import { AmbientLight, AxesHelper, GridHelper, Object3D, Scene } from "three";
import { ThreeMeshExporter } from "./meshExporter";
import { ThreeHighlighter } from "./threeHighlighter";
import { ThreeView } from "./threeView";
import { ThreeViewHandler } from "./threeViewEventHandler";
import { ThreeVisualContext } from "./threeVisualContext";

Object3D.DEFAULT_UP.set(0, 0, 1);

export class ThreeVisual implements IVisual {
    readonly defaultEventHandler: IEventHandler;
    readonly context: ThreeVisualContext;
    readonly scene: Scene;
    readonly highlighter: ThreeHighlighter;
    readonly viewHandler: IEventHandler;
    readonly meshExporter: IMeshExporter;
    private _eventHandler: IEventHandler;
    private _gridHelper: GridHelper;

    get eventHandler() {
        return this._eventHandler;
    }

    set eventHandler(value: IEventHandler) {
        if (this._eventHandler === value) return;
        this._eventHandler = value;
        Logger.info(`Changed EventHandler to ${Object.getPrototypeOf(value).constructor.name}`);
    }

    constructor(readonly document: IDocument) {
        this.scene = this.initScene();
        this._gridHelper = this.createGrid();
        this.scene.add(this._gridHelper);
        this.defaultEventHandler = this.createDefaultSelectionHandler(document);
        this.viewHandler = new ThreeViewHandler();
        this.context = new ThreeVisualContext(this, this.scene);
        this.highlighter = new ThreeHighlighter(this.context);
        this.meshExporter = new ThreeMeshExporter(this.context);
        this._eventHandler = this.defaultEventHandler;
        Config.instance.onPropertyChanged(this.handleGridConfigChanged);
    }

    protected createDefaultSelectionHandler(document: IDocument) {
        return new NodeSelectionHandler(document, true);
    }

    initScene() {
        const scene = new Scene();
        const envLight = new AmbientLight(0x888888, 4);
        const axisHelper = new AxesHelper(250);
        scene.add(envLight, axisHelper);
        return scene;
    }

    private createGrid(): GridHelper {
        const size = Config.instance.gridSize;
        const totalSize = Math.max(size * 200, 200);
        const divisions = Math.min(Math.round(totalSize / size), 2000);
        const grid = new GridHelper(totalSize, divisions, 0x444444, 0xcccccc);
        // Rotate from XZ plane (Three.js default) to XY plane (Z-up convention)
        grid.rotation.x = Math.PI / 2;
        grid.visible = Config.instance.gridVisible;
        return grid;
    }

    private readonly handleGridConfigChanged = (prop: keyof Config) => {
        if (prop === "gridVisible") {
            this._gridHelper.visible = Config.instance.gridVisible;
            this.update();
        } else if (prop === "gridSize") {
            this.scene.remove(this._gridHelper);
            this._gridHelper.dispose();
            this._gridHelper = this.createGrid();
            this.scene.add(this._gridHelper);
            this.update();
        }
    };

    resetEventHandler() {
        this.eventHandler = this.defaultEventHandler;
    }

    isExcutingHandler(): boolean {
        return this.eventHandler !== this.defaultEventHandler;
    }

    createView(name: string, workplane: Plane) {
        return new ThreeView(this.document, name, workplane, this.highlighter, this.context);
    }

    update(): void {
        this.document.application.views.forEach((view) => {
            if (view.document === this.document) view.update();
        });
    }

    dispose() {
        Config.instance.removePropertyChanged(this.handleGridConfigChanged);
        this.context.dispose();
        this.defaultEventHandler.dispose();
        this._eventHandler.dispose();
        this.viewHandler.dispose();
        this.scene.traverse((x) => {
            if (isDisposable(x)) x.dispose();
        });
        this.scene.clear();
    }
}
