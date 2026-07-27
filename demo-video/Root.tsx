import { Composition } from "remotion";

import manifest from "./generated-manifest.json";
import { VideoDbDemo } from "./VideoDbDemo";

export const VideoDbDemoRoot = () => (
  <Composition
    id="KathaQuestVideoDBDemo"
    component={VideoDbDemo}
    durationInFrames={manifest.totalFrames}
    fps={30}
    width={1280}
    height={720}
  />
);
