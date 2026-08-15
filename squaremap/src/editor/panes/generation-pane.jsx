/**
 * Random territory / resource generation panel
 *
 * squaremap fork: chinese ui text.
 */

"use strict";

import { useState, useMemo, useRef } from "react";

import ace from "ace-builds/src-noconflict/ace";
import "ace-builds/src-min-noconflict/mode-javascript";
import "ace-builds/src-min-noconflict/ext-language_tools";
import "ace-builds/src-min-noconflict/ext-spellcheck";
import aceJavascriptWorkerUrl from "file-loader!ace-builds/src-noconflict/worker-javascript";
ace.config.setModuleUrl("ace/mode/javascript_worker", aceJavascriptWorkerUrl)
import AceEditor from "react-ace";

import Nodes from "nodes.js";
import * as UI from "ui/ui.jsx";

import 'ui/css/ace-editor-nodes-dark.js';
import 'ui/css/ace-editor.css';
import "ui/css/nodes-scrollbar.css";
import "editor/css/panes/common.css";
import "editor/css/panes/generation-pane.css";

const handleBtnSubdivide = () => {
    if ( Nodes.selectedTerritory === undefined ) {
        console.log("No selected territory to subdivide");
        return;
    }
    const id = Nodes.selectedTerritory.id;

    console.log(`[terr=${id}] Subdividing into territories...`);

    Nodes._subdivideIntoRandomTerritories(
        id,
        Nodes.generatorAverageRadius,
        Nodes.generatorScaleX,
        Nodes.generatorScaleY,
        Nodes.generatorRandomSeed,
        Nodes.generatorIterationsSmoothCenters,
        Nodes.generatorIterationsSmoothCorners,
        Nodes.generatorDeleteSmallerThan,
        Nodes.generatorMergeSmallerThan,
        Nodes.generatorCopyName,
    );
}

const handleBtnResourceDistribute = () => {
    Nodes.distributeResourcesInSelectedTerritories();
}

const handleBtnResourceRemove = () => {
    Nodes._removeAllNodesFromTerritories(Nodes.selectedTerritoryIds());
}

/**
 * Set nodes resource distribution settings
 */
const editorOnChange = (text) => {
    try {
        let data = JSON.parse(text);
        Nodes.setSetting("resourceDistributeSettings", data, false, false, true);
    }
    catch {
        // ignore
    }
};

const CodeEditor = (props) => {
    return (
        <AceEditor
            ref={props.refEditor}
            mode="javascript"
            theme="nodes_dark"
            name="nodes-code-ace-editor"
            onFocus={() => {}}
            onBlur={props.onBlur}
            onChange={editorOnChange}
            width={'100%'}
            height={'100%'}
            fontSize={13}
            tabSize={3}
            wrapEnabled={true}
            showPrintMargin={true}
            showGutter={true}
            highlightActiveLine={true}
            value={props.editorText}
            setOptions={{
                wrap: true,
                wrapBehavioursEnabled: true,
                showLineNumbers: true,
                tabSize: 3,
            }}
            editorProps={{
                $blockScrolling: Infinity
            }}
        />
    );
}

export const GenerationPane = (props) => {

    // code editor
    const refEditor = useRef(null);

    const editorOnBlur = () => {
        if ( refEditor.current !== null ) {
            editorOnChange(refEditor.current.editor.getValue());
        }
    };

    const editorText = JSON.stringify(Nodes.resourceDistributeSettings, null, 3);

    // memoization: only re-render when node value is saved
    // i.e. when json is correctly parsed
    const codeEditor = useMemo(() => CodeEditor({
        refEditor: refEditor,
        editorText: editorText,
        onBlur: editorOnBlur,
    }), [editorText]);

    return (
        <>
            <div className="nodes-editor-panel-title">随机生成:</div>

            <div className="nodes-editor-section-header">细分领土:</div>
            <div className="nodes-editor-generation-buttons">
                <UI.Button
                    className="nodes-editor-generation-text-button"
                    onClick={handleBtnSubdivide}
                >
                    细分
                </UI.Button>
                <UI.Button
                    className="nodes-editor-generation-text-button"
                    onClick={Nodes.mergeSelectedTerritories}
                >
                    合并选中
                </UI.Button>
            </div>

            <div className="nodes-editor-setting-field">
                <div>平均半径:</div>
                <UI.InputEdit
                    className={"nodes-editor-setting-input"}
                    value={Nodes.generatorAverageRadius}
                    onChange={val => Nodes.setSetting("generatorAverageRadius", val, false, false, true)}
                />
            </div>
            <div className="nodes-editor-setting-field">
                <div>缩放 X:</div>
                <UI.InputEdit
                    className={"nodes-editor-setting-input"}
                    value={Nodes.generatorScaleX}
                    onChange={val => Nodes.setSetting("generatorScaleX", val, false, false, true)}
                />
            </div>
            <div className="nodes-editor-setting-field">
                <div>缩放 Y:</div>
                <UI.InputEdit
                    className={"nodes-editor-setting-input"}
                    value={Nodes.generatorScaleY}
                    onChange={val => Nodes.setSetting("generatorScaleY", val, false, false, true)}
                />
            </div>
            <div className="nodes-editor-setting-field">
                <div>随机种子:</div>
                <UI.InputEdit
                    className={"nodes-editor-setting-input"}
                    value={Nodes.generatorRandomSeed}
                    onChange={val => Nodes.setSetting("generatorRandomSeed", val, false, false, true)}
                />
            </div>
            <div className="nodes-editor-setting-field">
                <div>中心平滑迭代:</div>
                <UI.InputEdit
                    className={"nodes-editor-setting-input"}
                    value={Nodes.generatorIterationsSmoothCenters}
                    onChange={val => Nodes.setSetting("generatorIterationsSmoothCenters", val, false, false, true)}
                />
            </div>
            <div className="nodes-editor-setting-field">
                <div>角点平滑迭代:</div>
                <UI.InputEdit
                    className={"nodes-editor-setting-input"}
                    value={Nodes.generatorIterationsSmoothCorners}
                    onChange={val => Nodes.setSetting("generatorIterationsSmoothCorners", val, false, false, true)}
                />
            </div>
            <div className="nodes-editor-setting-field">
                <div>小于此值删除:</div>
                <UI.InputEdit
                    className={"nodes-editor-setting-input"}
                    value={Nodes.generatorDeleteSmallerThan}
                    onChange={val => Nodes.setSetting("generatorDeleteSmallerThan", val, false, false, true)}
                />
            </div>
            <div className="nodes-editor-setting-field">
                <div>小于此值合并:</div>
                <UI.InputEdit
                    className={"nodes-editor-setting-input"}
                    value={Nodes.generatorMergeSmallerThan}
                    onChange={val => Nodes.setSetting("generatorMergeSmallerThan", val, false, false, true)}
                />
            </div>
            <div className="nodes-editor-setting-field">
                <UI.Checkbox
                    checked={Nodes.generatorCopyName}
                    onChange={val => Nodes.setSetting("generatorCopyName", val, false, false, true)}
                    label={"名称复制到新领土"}
                />
            </div>

        
            <div className="nodes-editor-section-header">资源分配:</div>
            <div className="nodes-editor-generation-buttons">
                <UI.Button
                    className="nodes-editor-generation-text-button"
                    onClick={handleBtnResourceDistribute}
                >
                    分配
                </UI.Button>
                <UI.Button
                    className="nodes-editor-generation-text-button"
                    onClick={handleBtnResourceRemove}
                >
                    全部移除
                </UI.Button>
            </div>
            <div className="nodes-editor-setting-field">
                <div>随机种子:</div>
                <UI.InputEdit
                    className={"nodes-editor-setting-input"}
                    value={Nodes.resourceDistributeRandomSeed}
                    onChange={val => Nodes.setSetting("resourceDistributeRandomSeed", val, false, false, true)}
                />
            </div>
            <div className="nodes-editor-section-header">资源分配设置:</div>
            <div id="nodes-resource-distribute-ace-editor-container">
                {codeEditor}
            </div>

            <div className="nodes-editor-help">
                <div>随机生成说明:</div>
                <div>- 平均半径单位为区块</div>
                <div>- 资源概率格式: "资源名": 概率, 例如</div>
                <div>- "diamond": 1,</div>
                <div>- "gold": 2</div>
            </div>
        </>
    )
}
