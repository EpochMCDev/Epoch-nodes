package phonon.nodes.squaremap;

import java.util.Collections;
import java.util.List;
import java.util.Map;
import org.bukkit.configuration.file.FileConfiguration;

/**
 * Parsed addon configuration from config.yml.
 */
public final class Settings {
    public final List<String> worlds;       // empty = auto (all enabled squaremap worlds)
    public final long updateInterval;       // ticks
    public final boolean copyJsonToWeb;
    public final int iconSize;
    public final int textSize;
    public final boolean renderTerritories;
    public final boolean renderTerritoryBorderOnly;
    public final boolean renderNodeIcons;
    public final boolean renderPorts;
    public final boolean renderTownNames;
    public final boolean renderNationNames;
    public final int[] unownedColor;
    public final double fillOpacity;
    public final int strokeWeight;
    public final int[] borderColor;
    public final Map<String, int[]> iconColors;

    public Settings(FileConfiguration config) {
        this.worlds = config.contains("worlds")
            ? List.copyOf(config.getStringList("worlds"))
            : (config.getString("world", "auto").equals("auto") ? List.of() : List.of(config.getString("world")));
        this.updateInterval = Math.max(20L, config.getLong("update-interval", 100L));
        this.copyJsonToWeb = config.getBoolean("copy-json-to-web", true);
        this.iconSize = Math.max(8, config.getInt("icon-size", 16));
        this.textSize = Math.max(8, config.getInt("text-size", 20));
        this.renderTerritories = config.getBoolean("render.territories", true);
        this.renderTerritoryBorderOnly = config.getBoolean("render.territory-border-only", false);
        this.renderNodeIcons = config.getBoolean("render.node-icons", true);
        this.renderPorts = config.getBoolean("render.ports", true);
        this.renderTownNames = config.getBoolean("render.town-names", true);
        this.renderNationNames = config.getBoolean("render.nation-names", false);
        this.unownedColor = readRgb(config, "unowned-color", new int[]{80, 80, 80});
        this.fillOpacity = Math.max(0.0, Math.min(1.0, config.getDouble("fill-opacity", 0.35)));
        this.strokeWeight = Math.max(1, config.getInt("stroke-weight", 2));
        this.borderColor = readRgb(config, "border-color", new int[]{40, 40, 40});

        java.util.Map<String, int[]> colors = new java.util.HashMap<>();
        if (config.isConfigurationSection("icons")) {
            for (String key : config.getConfigurationSection("icons").getKeys(false)) {
                colors.put(key, readRgb(config, "icons." + key, new int[]{128, 128, 128}));
            }
        }
        this.iconColors = Collections.unmodifiableMap(colors);
    }

    private static int[] readRgb(FileConfiguration config, String path, int[] def) {
        List<Integer> list = config.getIntegerList(path);
        if (list.size() >= 3) {
            return new int[]{list.get(0), list.get(1), list.get(2)};
        }
        return def;
    }
}
