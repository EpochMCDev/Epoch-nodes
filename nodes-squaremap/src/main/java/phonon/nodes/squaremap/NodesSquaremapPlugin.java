package phonon.nodes.squaremap;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardCopyOption;
import org.bukkit.Bukkit;
import org.bukkit.plugin.java.JavaPlugin;
import xyz.jpenilla.squaremap.api.Squaremap;
import xyz.jpenilla.squaremap.api.SquaremapProvider;

/**
 * Nodes-squaremap addon.
 *
 * <p>Renders the nodes plugin state (plugins/nodes/*.json) on squaremap and
 * copies the json files into the squaremap web directory so the web editor
 * (nodes-editor/) can fetch them. Pure file coupling: no dependency on the
 * unstable nodes plugin API.
 */
public final class NodesSquaremapPlugin extends JavaPlugin {

    private NodesData nodesData;
    private SquaremapRenderer renderer;
    private Settings settings;
    private Path webNodesDir;

    @Override
    public void onEnable() {
        saveDefaultConfig();
        this.settings = new Settings(getConfig());
        this.nodesData = new NodesData(Paths.get(getConfig().getString("data-directory", "plugins/nodes")));

        try {
            Squaremap squaremap = SquaremapProvider.get();
            this.renderer = new SquaremapRenderer(squaremap, settings);
            this.renderer.registerLayers();
            this.webNodesDir = squaremap.webDir().resolve("nodes");
            getLogger().info("Hooked into squaremap; rendering nodes on " + renderer.worldCount() + " world(s)");
        } catch (Throwable t) {
            getLogger().severe("Failed to hook into squaremap: " + t);
            Bukkit.getPluginManager().disablePlugin(this);
            return;
        }

        // immediate async refresh, then periodic refresh on a timer
        Bukkit.getScheduler().runTaskAsynchronously(this, this::refresh);
        Bukkit.getScheduler().runTaskTimerAsynchronously(this, this::refresh, settings.updateInterval, settings.updateInterval);
    }

    @Override
    public void onDisable() {
        Bukkit.getScheduler().cancelTasks(this);
        if (renderer != null) {
            renderer.unregisterLayers();
            renderer = null;
        }
    }

    private void refresh() {
        try {
            if (nodesData.hasChanges()) {
                NodesData.Snapshot snapshot = nodesData.read();
                if (renderer != null) {
                    renderer.render(snapshot);
                }
            }
            if (settings.copyJsonToWeb && webNodesDir != null) {
                copyJsonToWeb();
            }
        } catch (Throwable t) {
            getLogger().warning("nodes-squaremap refresh failed: " + t);
        }
    }

    private void copyJsonToWeb() {
        Path dataDir = Paths.get(getConfig().getString("data-directory", "plugins/nodes"));
        for (String fileName : new String[]{"world.json", "towns.json", "ports.json", "config.json"}) {
            Path source = dataDir.resolve(fileName);
            if (!Files.exists(source)) {
                continue;
            }
            try {
                Files.createDirectories(webNodesDir);
                Files.copy(source, webNodesDir.resolve(fileName), StandardCopyOption.REPLACE_EXISTING);
            } catch (IOException e) {
                getLogger().warning("Failed to copy " + fileName + " to squaremap web: " + e.getMessage());
            }
        }
    }
}
