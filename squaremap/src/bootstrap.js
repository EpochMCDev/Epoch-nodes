/**
 * bootstrap.js (squaremap)
 * ----------------------------------------------------------------
 * Async entry: loads the nodes editor (wasm + react) and exposes the
 * squaremap map glue to the host page as window.MapGlue.
 */

import { createMap } from "./mapGlue.js";

let Nodes = {
    initialize: function(options, callback) {
        import('./nodes.js')
            .then((module) => {
                // set window value
                window.Nodes = module.default;

                // run nodes initialization
                module.default.initialize(options, callback);
            })
            .catch(err => console.error('[Nodes] Load failed', err));
    }
};

// expose squaremap map glue to the host page
window.MapGlue = {
    create: createMap,
};

// export to webpack
export default Nodes;
