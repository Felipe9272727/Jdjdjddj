import {createRequire} from 'node:module';
import path from 'node:path';
/** Optional local-only configuration when the host cannot enumerate interfaces. */
export function configureLoopback(dependencies) {
  if(process.env.REMOTION_LOOPBACK_ONLY!=='1')return;
  const require=createRequire(path.join(dependencies,'package.json'));
  const config=require(path.join(dependencies,'node_modules/@remotion/renderer/dist/port-config.js'));
  config.getPortConfig=()=>({host:'127.0.0.1',hostsToTry:['127.0.0.1']});
}
