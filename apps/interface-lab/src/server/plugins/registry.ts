import type { PluginCall, PluginPrimitive } from '#/lib/plugin-contract';
import { githubPlugin } from '#/server/plugins/github';
import { openMeteoPlugin } from '#/server/plugins/open-meteo';

const plugins = [openMeteoPlugin, githubPlugin];

const pluginRegistry = Object.fromEntries(plugins.map((plugin) => [plugin.id, plugin])) as Record<
  PluginCall['plugin'],
  (typeof plugins)[number]
>;

export const pluginCatalog = plugins
  .map(
    (plugin) =>
      `- ${plugin.id} (${plugin.name}): ${plugin.description}\n  Call: await window.y31.invoke({ plugin: "${plugin.id}", input: ${plugin.inputDescription} })\n  Returns: ${plugin.resultDescription}`,
  )
  .join('\n');

export const executePluginCall = async (call: PluginCall): Promise<PluginPrimitive> =>
  pluginRegistry[call.plugin].execute(call.input);
