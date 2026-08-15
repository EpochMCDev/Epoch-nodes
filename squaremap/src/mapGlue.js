/**
 * mapGlue.js
 * ----------------------------------------------------------------
 * Standalone Leaflet map that loads squaremap tiles and exposes the
 * block<->latlng projection used by the nodes editor.
 *
 * squaremap projection (from the squaremap frontend):
 *   - tiles are served at /tiles/{world}/{z}/{x}/{y}.png, tileSize 512
 *   - at the world's max zoom, 1 block = 1 pixel
 *   - scale = 1 / 2^maxZoom; block (x, z) -> latlng(-z * scale, x * scale)
 *   - L.CRS.Simple aligns the leaflet tile grid with squaremap tile files
 *
 * World settings are read live from /tiles/settings.json (world list) and
 * /tiles/{world}/settings.json ({ zoom: { max, extra, def }, spawn }).
 */

import L from "leaflet";
import "leaflet/dist/leaflet.css";

export const createMap = (options = {}) => {
    const params = new URLSearchParams(window.location.search);

    return fetch("/tiles/settings.json")
        .then((response) => {
            if (!response.ok) {
                throw new Error("Failed to load /tiles/settings.json");
            }
            return response.json();
        })
        .then((settings) => {
            let worldName = options.world || params.get("world");
            if (!worldName && settings.worlds !== undefined) {
                if (Array.isArray(settings.worlds)) {
                    // squaremap 1.3.15+: worlds is an array of world objects
                    // ({ name, display_name, type, ... }); older versions
                    // may use a bare array of names
                    const first = settings.worlds[0];
                    worldName = typeof first === "string" ? first : first !== undefined ? first.name : undefined;
                } else {
                    worldName = Object.keys(settings.worlds)[0];
                }
            }
            if (!worldName) {
                throw new Error("No squaremap world found to load");
            }

            return fetch(`/tiles/${worldName}/settings.json`)
                .then((response) => {
                    if (!response.ok) {
                        throw new Error(`Failed to load world settings for '${worldName}'`);
                    }
                    return response.json();
                })
                .then((worldSettings) => {
                    const maxZoom = worldSettings.zoom?.max ?? 3;
                    const extraZoom = worldSettings.zoom?.extra ?? 0;
                    const defZoom = worldSettings.zoom?.def ?? maxZoom;
                    const spawn = worldSettings.spawn ?? { x: 0, z: 0 };
                    const scale = 1 / Math.pow(2, maxZoom);

                    // block coords -> leaflet latlng (x -> lng, z -> -lat)
                    const toLatLng = (x, z) => L.latLng(-z * scale, x * scale);

                    // leaflet latlng -> block coords
                    const toBlock = (latlng) => ({
                        x: latlng.lng / scale,
                        z: -latlng.lat / scale,
                    });

                    const map = L.map("map", {
                        crs: L.CRS.Simple,
                        minZoom: 0,
                        maxZoom: maxZoom + extraZoom,
                        zoomSnap: 0.25,
                        noWrap: true,
                        preferCanvas: true,
                        attributionControl: false,
                    });

                    // squaremap serves tiles at {z}/{x}_{y}.png (underscore
                    // between x and y, not a slash)
                    L.tileLayer(`/tiles/${worldName}/{z}/{x}_{y}.png`, {
                        tileSize: 512,
                        minZoom: 0,
                        maxZoom: maxZoom + extraZoom,
                        maxNativeZoom: maxZoom,
                        noWrap: true,
                        crossOrigin: true,
                    }).addTo(map);

                    map.setView(toLatLng(spawn.x, spawn.z), defZoom);

                    return {
                        map,
                        toLatLng,
                        toBlock,
                        world: worldName,
                        maxZoom,
                        scale,
                    };
                });
        });
};
