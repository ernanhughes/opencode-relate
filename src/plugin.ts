import { Plugin } from "@opencode/plugin";
import { relateTools } from "./tools.ts";

const RelatePlugin = Plugin.define({
  id: "opencode-relate",
  async setup(ctx) {
    await ctx.tool.transform((editor) => {
      for (const tool of relateTools()) editor.add(tool);
    });
  },
});

export default RelatePlugin;
